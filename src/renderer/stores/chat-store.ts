/**
 * chat-store.ts — 对话状态管理
 *
 * 消息按 sessionId 隔离存储，互不干扰。
 * 本地 AgentLoop（IPC）：消息流通过 agentApi.chat() 的 onToken 回调 + 返回 MessageVO 驱动。
 *
 * 消息路由：agentApi.onMessage → 路由到各个 handler，保持 View → Store → API 单向依赖。
 */
import { createLocalAgentApi } from '@/renderer/api/agent-local'
import { messagesApi } from '@/renderer/api/messages-api'
import type { AgentApi, AgentApprovalEvent, AgentMessageVO, AgentStreamEvent, Message as ApiMessage } from '@/renderer/api/types'
import { useSessionStore } from '@/renderer/stores/session-store'
import { playMessageNotification } from '@/renderer/utils/audio-utils'
import { showInfoToast } from '@/renderer/utils/notification-utils'
import { isValidTokenValue } from '@/renderer/utils/streaming/token-validate'
import { mergeToolCallChunks, type ToolCallChunk } from '@/renderer/utils/streaming/tool-call-merge'
import { extractCompleted } from '@/renderer/utils/streaming/useParagraphSegmenter'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ActionMergedPayload,
  AgentResponseTokenPayload,
  ApprovalRequestPayload,
  ChatMergedPayload,
  ClarifyRequestPayload,
  ErrorPayload,
  ExecuteToolPayload,
  MessageVOData,
  SessionTitleUpdatedPayload,
  ThinkingPayload,
  TipsPayload
} from './types'


export const useChatStore = defineStore('chat', () => {
  // ── 状态（按 sessionId 隔离）──

  /** 会话 store（Agent 画像 profile 来源） */
  const sessionStore = useSessionStore()

  /** 每个 session 的消息列表 */
  const messagesBySession = ref<Record<string, ApiMessage[]>>({})
  /** 每个 session 的流式内容 */
  const streamingContentBySession = ref<Record<string, string>>({})
  /** 每个 conversation 的 token 队列（复合键 sessionId:conversationId），避免多流混杂 */
  const streamingContentByConversation = ref<Record<string, string>>({})
  /** 每 session 的 tool 调用记录（用于 todo list） */
  const toolCallsBySession = ref<Record<string, { toolCallId: string; toolName: string; status: 'pending' | 'done' }[]>>({})
  /** 每个 conversation 的 tool call 累积片段（流式累积，isFinish 时 join 一次 JSON.parse） */
  const toolCallArgsBufferByConversation = ref<Record<string, string[]>>({})
  /** 每个 conversation 的完整 toolCall 缓存：compositeKey → { toolCallId: {name, arguments} }。
   * isFinish 时从 toolCallArgs 组装；exe_client_tool 只下发 id，执行时按 id 从本缓存取完整参数。 */
  const toolCallsByConversation = ref<Record<string, Record<string, { name: string; arguments: unknown }>>>({})
  /** 每个 conversation 的 2 秒轮询定时器（用于清理） */
  const pollingTimersByConversation: Record<string, ReturnType<typeof setInterval>> = {}
  /** 每个 session 的推理内容 */
  const streamingReasoningBySession = ref<Record<string, string>>({})
  /** 每个 session 是否正在处理中（用于 UI 指示器，不阻断操作） */
  const isProcessingBySession = ref<Record<string, boolean>>({})

  // AgentApi 引用（本地 AgentLoop IPC，由 initAgentApi 创建）
  let agentApi: AgentApi | null = null

  // ── 按 session 获取数据 ──

  function getMessages(sessionId: string): ApiMessage[] {
    return messagesBySession.value[sessionId] ?? []
  }

  function getStreamingReasoning(sessionId: string): string {
    return streamingReasoningBySession.value[sessionId] ?? ''
  }

  // ── Backend 注入 + 消息路由 ──

  let initialized = false

  /**
   * 初始化本地 AgentApi（IPC）并建立消息路由。
   * 由 SplashView / WorkspaceView 在初始化时调用。
   * 本地 AgentLoop：流式 token 在 sendMessage 的 chat 回调中处理；
   * onApprovalRequest 处理审批请求等事件。
   */
  function initAgentApi(): AgentApi {
    if (initialized && agentApi) return agentApi
    initialized = true
    agentApi = createLocalAgentApi()

    // 审批请求事件 → 弹审批卡片
    agentApi.onApprovalRequest((payload: AgentApprovalEvent) => {
      const tc = payload as AgentApprovalEvent
      addApprovalMessage({
        sessionId: '',
        data: {
          toolCallId: tc.toolCallId,
          toolName: tc.name,
          approvalArguments: tc.arguments as Record<string, unknown>,
        } as unknown as MessageVOData,
      } as ApprovalRequestPayload)
    })

    return agentApi
  }

  function getAgentApi(): AgentApi | null {
    return agentApi
  }

  /** 处理 chat 通道事件：agent_response / approval_request / interaction_status_update */
  function handleChatEvent(payload: ChatMergedPayload): void {
    const sessionId = payload.sessionId ?? ''
    if (!sessionId) return
    const subType = payload.type ?? ''

    switch (subType) {
      case 'agent_response': {
        // 已废弃：文本内容通过 agent_response_token 流式下发，不再通过 agent_response 一次性推送
        // 保留 handler 仅用于非流式兜底（后端已不再发送）
        console.debug('agent_response 事件已废弃（流式取代），sessionId=%s', sessionId)
        break
      }
      case 'agent_response_token': {
        handleTokenEvent(payload as AgentResponseTokenPayload)
        break
      }
      case 'approval_request':
        addApprovalMessage(payload as ApprovalRequestPayload)
        break
      case 'clarify_request': {
        const d = (payload as ClarifyRequestPayload).data
        if (!d || !d.toolCallId) break
        const tcStr = d.toolCall
        let question = ''
        let choices: string[] | null = null
        if (typeof tcStr === 'string') {
          try {
            const parsed = JSON.parse(tcStr) as Record<string, unknown>
            const entry = Object.values(parsed)[0] as Record<string, unknown> | undefined
            const args = entry?.['arguments'] as Record<string, unknown> | undefined
            question = (args?.['question'] as string) ?? ''
            choices = (args?.['choices'] as string[]) ?? null
          } catch { /* fallback to empty */ }
        }
        addClarifyMessage({ toolCallId: d.toolCallId, sessionId, question, choices })
        break
      }
      case 'interaction_status_update': {
        const { data, sessionId: sid } = payload
        const toolCallId = (data as Record<string, unknown>)?.toolCallId as string | undefined
        if (toolCallId) updateApprovalStatus(toolCallId, (data as Record<string, unknown>)?.interactionStatus as string, sid)
        break
      }
      case 'clarify_status_update': {
        const { data, sessionId: sid } = payload
        const toolCallId = (data as Record<string, unknown>)?.toolCallId as string | undefined
        if (toolCallId) updateClarifyStatus(toolCallId, sid)
        break
      }
    }
  }

  /** 处理 thinking 通道事件：追加推理内容 */
  function handleThinkingEvent(payload: ThinkingPayload): void {
    const sessionId = payload.sessionId ?? ''
    if (!sessionId) return
    const text = payload.message ?? ''
    if (!isValidTokenValue(text)) return

    streamingReasoningBySession.value[sessionId] =
      (streamingReasoningBySession.value[sessionId] ?? '') + text
    window.dispatchEvent(new CustomEvent('agent-thinking', {
      detail: { sessionId, reasoning: streamingReasoningBySession.value[sessionId] }
    }))
  }

  /**
   * 处理 agent_response_token 事件。
   * LlmChunk 中可能同时包含 text / reasoning / toolCallArgs 三种内容，
   * 各自独立字段，前端检查非空分别路由到对应缓冲区。
   */
  function handleTokenEvent(payload: AgentResponseTokenPayload): void {
    const data = payload.data
    if (!data) return
    const sessionId = data.sessionId || payload.sessionId
    const conversationId = data.conversationId || payload.conversationId
    if (!sessionId || !conversationId) return

    const compositeKey = `${sessionId}:${conversationId}`

    // ── 新流到来 → 清理上一轮残留 + 创建占位消息 ──
    const isNewStream = !streamingContentByConversation.value[compositeKey]
      && !toolCallArgsBufferByConversation.value[compositeKey]
    if (isNewStream && (isValidTokenValue(data.token) || isValidTokenValue(data.toolCallArgs) || isValidTokenValue(data.reasoning))) {
      // 清理上一轮工具调用记录
      delete toolCallsBySession.value[sessionId]
      // 清理上一轮推理内容
      delete streamingReasoningBySession.value[sessionId]
      // 清理旧的占位消息（如果仍在）
      removeStreamingPlaceholder(sessionId)
    }

    // 1. 文本内容 → 追加到文本缓冲区（占位 content 由 runSegmentation 定期追加）
    if (isValidTokenValue(data.token)) {
      const current = streamingContentByConversation.value[compositeKey] ?? ''
      streamingContentByConversation.value[compositeKey] = current + data.token
      // 确保占位消息存在（content 暂为空，等待分段追加）
      ensureStreamingPlaceholder(sessionId, conversationId, compositeKey)
    }

    // 2. 推理内容 → 追加到推理缓冲区
    if (isValidTokenValue(data.reasoning)) {
      streamingReasoningBySession.value[sessionId] =
        (streamingReasoningBySession.value[sessionId] ?? '') + data.reasoning
      window.dispatchEvent(new CustomEvent('agent-reasoning-token', {
        detail: { sessionId, conversationId, reasoning: data.reasoning }
      }))
    }

    // 3. 工具调用参数 → push 到字符串数组，isFinish 时 join 一次 JSON.parse
    if (isValidTokenValue(data.toolCallArgs)) {
      const arr = toolCallArgsBufferByConversation.value[compositeKey] ?? []
      arr.push(data.toolCallArgs)
      toolCallArgsBufferByConversation.value[compositeKey] = arr
    }

    // 首次收到 token → 启动 2 秒轮询
    if (!pollingTimersByConversation[compositeKey] && !data.isFinish) {
      startPolling(sessionId, conversationId)
    }

    // isFinish → 最后一次 flush + 停止轮询 + 清理 + 完成占位消息
    if (data.isFinish) {
      const accumulated = streamingContentByConversation.value[compositeKey] ?? ''
      const fullText = accumulated || (isValidTokenValue(data.token) ? data.token : '')
      if (fullText) {
        flushToChunks(sessionId, conversationId)
        // 完成占位消息（原地更新，不 push 新消息）
        finalizeStreamingPlaceholder(sessionId, conversationId, {
          content: fullText,
          messageType: 'assistant_text'
        })
      }

      // 清理推理缓冲区（isFinish 后不再需要）
      delete streamingReasoningBySession.value[sessionId]

      // 从 toolCallArgsBufferByConversation 提取工具调用列表
      // → 组装完整 toolCall map（toolCallId → {name, arguments}）缓存，供 exe_client_tool 按 id 取参
      const buffers = toolCallArgsBufferByConversation.value[compositeKey]
      if (buffers && buffers.length > 0) {
        const raw = buffers.join('')
        delete toolCallArgsBufferByConversation.value[compositeKey]
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            assembleToolCalls(parsed, sessionId, compositeKey)
          } else if (parsed.id && parsed.name) {
            assembleToolCalls([parsed], sessionId, compositeKey)
          }
        } catch {
          try {
            const wrapped = JSON.parse('[' + raw.replace(/}{/g, '},{') + ']')
            assembleToolCalls(wrapped, sessionId, compositeKey)
          } catch { /* 解析失败放弃 */ }
        }
      }

      stopPolling(compositeKey)
      cleanupConversationToken(sessionId, conversationId)
      isProcessingBySession.value[sessionId] = false

      window.dispatchEvent(new CustomEvent('agent-response-received', {
        detail: { sessionId, conversationId }
      }))
    }
  }

  /** 确保存在当前 conversation 的流式占位消息（content 由 runSegmentation 追加） */
  function ensureStreamingPlaceholder(sid: string, convId: string, key: string): void {
    if (!messagesBySession.value[sid]) messagesBySession.value[sid] = []
    const msgs = messagesBySession.value[sid]
    // 只匹配"活动中的"占位（isStreaming=true）；上一轮已完成的回复不匹配
    const existing = msgs.find(m => m.isStreaming)
    if (existing) {
      // content 不在此更新——由 runSegmentation 分段后追加
      return
    }
    // 创建新占位（唯一 id，content 初始为空）
    msgs.push({
      id: `msg_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: sid,
      conversationId: convId,
      role: 'assistant',
      messageType: 'assistant_text',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      isStreaming: true
    })
  }

  /** 移除"活动中的"流式占位消息（仅未完成残留；已完成的回复不删） */
  function removeStreamingPlaceholder(sid: string): void {
    const msgs = messagesBySession.value[sid]
    if (!msgs) return
    const idx = msgs.findIndex(m => m.isStreaming)
    if (idx >= 0) msgs.splice(idx, 1)
  }

  /** 完成流式占位消息（原地转为 finalized 消息） */
  function finalizeStreamingPlaceholder(sid: string, convId: string | undefined, info: {
    content: string
    messageType?: string
    reasoningContent?: string
  }): void {
    const msgs = messagesBySession.value[sid]
    if (!msgs) return
    const placeholder = msgs.find(m => m.isStreaming)
    if (!placeholder) return
    // content 已由 flushToChunks 追加完毕；兜底场景（无分段）用完整文本
    placeholder.content = placeholder.content || info.content
    placeholder.messageType = info.messageType ?? 'assistant_text'
    placeholder.isStreaming = false
    placeholder.status = 'completed'
    placeholder.timestamp = Date.now()
    // id 保持流式期间生成的唯一 id——同一消息在 v-for 中 key 不变，DOM 原地更新
    if (isValidTokenValue(info.reasoningContent)) {
      placeholder.reasoningContent = info.reasoningContent
    }
  }

  /** 本地 AgentLoop 返回最终 MessageVO 时：只更新流式占位（走流式输出，不再追加新消息） */
  function finalizeAgentMessage(sid: string, msg: AgentMessageVO): void {
    const msgs = messagesBySession.value[sid] ?? []
    if (!messagesBySession.value[sid]) {
      messagesBySession.value[sid] = []
    }
    const placeholder = msgs.find(m => m.isStreaming)
    if (!placeholder) return
    // 占位消息仍在流式中（isFinish 未到或顺序竞态）→ 更新；
    // 流式已由 isFinish 转正（isStreaming=false）→ 占位已存在，无需追加
    placeholder.content = msg.content || placeholder.content
    placeholder.messageType = msg.messageType ?? 'assistant_text'
    placeholder.reasoningContent = msg.reasoningContent || placeholder.reasoningContent
    placeholder.isStreaming = false
    placeholder.status = 'completed'
    placeholder.timestamp = Date.now()
  }

  /** 启动 3.5 秒分段轮询 */
  function startPolling(sessionId: string, conversationId: string): void {
    const compositeKey = `${sessionId}:${conversationId}`
    if (pollingTimersByConversation[compositeKey]) return

    pollingTimersByConversation[compositeKey] = setInterval(() => {
      runSegmentation(sessionId, conversationId)
    }, 3500)
  }

  /** 停止指定 conversation 的轮询 */
  function stopPolling(compositeKey: string): void {
    if (pollingTimersByConversation[compositeKey]) {
      clearInterval(pollingTimersByConversation[compositeKey])
      delete pollingTimersByConversation[compositeKey]
    }
  }

  /** 2 秒轮询：全量扫描 buffer，提取已封闭段落追加到占位消息 content，提取部分从 buffer 裁剪掉 */
  function runSegmentation(sessionId: string, conversationId: string): void {
    const compositeKey = `${sessionId}:${conversationId}`
    const buffer = streamingContentByConversation.value[compositeKey]
    if (!buffer) return

    // 全量扫描（buffer 是暂存区：提取走的裁剪掉，未封闭的留在原地）
    const { chunks, rest } = extractCompleted(buffer, 0, { nextId: 0 })

    if (chunks.length > 0) {
      // 追加到占位消息 content（可渲染的完整段落）
      appendToPlaceholderContent(sessionId, chunks.map(c => c.text).join('\n\n'))
      // 裁剪：只保留未提取的剩余文本
      streamingContentByConversation.value[compositeKey] = rest
    }
  }

  /** 追加文本到当前流式占位消息的 content 尾部 */
  function appendToPlaceholderContent(sid: string, text: string): void {
    if (!text) return
    const msgs = messagesBySession.value[sid]
    if (!msgs) return
    const placeholder = msgs.find(m => m.isStreaming)
    if (!placeholder) return
    placeholder.content = placeholder.content
      ? `${placeholder.content}\n\n${text}`
      : text
  }

  /** isFinish 时：把缓冲区剩余内容全部提取为 chunks 并追加到 content */
  function flushToChunks(sessionId: string, conversationId: string): void {
    // 提取所有已封闭段落（buffer 内部裁剪）
    runSegmentation(sessionId, conversationId)
    // 再跑一次：覆盖 isFinish 时边界刚闭合的段落
    runSegmentation(sessionId, conversationId)

    // 剩余未封闭文本（buffer 已被裁剪，剩下的必然是未提取的）直接追加，保证完整
    const compositeKey = `${sessionId}:${conversationId}`
    const remaining = streamingContentByConversation.value[compositeKey]
    if (remaining) {
      appendToPlaceholderContent(sessionId, remaining)
    }

    // 清空缓冲区（不再需要了）
    delete streamingContentByConversation.value[compositeKey]
  }

  /**
   * 切换 conversation 时调用：停止旧 conv 的轮询，清空临时渲染块。
   * buffer 不清空——切回来时可以继续累积。
   */
  function clearConvChunks(prevSessionId: string, prevConvId: string): void {
    if (!prevConvId) return
    const compositeKey = `${prevSessionId}:${prevConvId}`

    // 停止轮询（该 conv 不再需要 UI 更新）
    stopPolling(compositeKey)
  }

  /** 获取指定 conversation 的未分段原始缓冲区文本（供接收区显示） */
  function getConvPendingBuffer(sessionId: string, conversationId: string): string {
    if (!sessionId || !conversationId) return ''
    return streamingContentByConversation.value[`${sessionId}:${conversationId}`] ?? ''
  }

  /** 检查指定 conversation 是否还在流式接收中 */
  function isConvStreaming(sessionId: string, conversationId: string): boolean {
    if (!sessionId || !conversationId) return false
    const key = `${sessionId}:${conversationId}`
    return streamingContentByConversation.value[key] !== undefined
      && pollingTimersByConversation[key] !== undefined
  }

  /** 获取当前 session 活跃流式的 conversationId（无则返回空字符串） */
  function getActiveStreamingConvId(sessionId: string): string {
    if (!sessionId) return ''
    const prefix = `${sessionId}:`
    for (const key of Object.keys(streamingContentByConversation.value)) {
      if (key.startsWith(prefix)) {
        return key.slice(prefix.length)
      }
    }
    return ''
  }

  /** 清理 per-conversation token 队列 */
  function handleActionEvent(payload: ActionMergedPayload): void {
    const sessionId = payload.sessionId ?? ''
    if (!sessionId) return
    const subType = payload.type ?? ''

    switch (subType) {
      case 'conversation_complete':
        playMessageNotification()
        isProcessingBySession.value[sessionId] = false
        window.dispatchEvent(new CustomEvent('conversation-complete', {
          detail: { sessionId }
        }))
        break
      case 'session_title_updated': {
        const titleData = payload as SessionTitleUpdatedPayload
        window.dispatchEvent(new CustomEvent('session-title-updated', {
          detail: { sessionId, title: titleData.data?.title ?? '' }
        }))
        break
      }
      case 'tool_done': {
        const donePayload = payload as { data?: { toolCallId?: string; toolName?: string } }
        const doneData = donePayload.data ?? {}
        const doneId = doneData.toolCallId ?? ''
        if (doneId) {
          const tcArray = toolCallsBySession.value[sessionId] ?? []
          const found = tcArray.find(tc => tc.toolCallId === doneId)
          if (found) found.status = 'done'
          else tcArray.push({ toolCallId: doneId, toolName: doneData.toolName ?? '', status: 'done' })
          toolCallsBySession.value[sessionId] = tcArray
        }
        break
      }
      case 'exe_client_tool': {
        const toolPayload = payload as ExecuteToolPayload
        const toolData = toolPayload.data
        if (!toolData) break
        const toolCallId = toolData.id ?? ''
        const toolName = toolData.name ?? ''
        if (!toolCallId || !toolName) break

        // 服务端只下发 id（且无 conversationId、无 arguments）—— 按 sessionId 前缀匹配活跃 conversation 的缓存取参
        // 服务端串行：token 全下发 → isFinish → 才发 exe_client_tool，故缓存必然已组装完成
        let cached: Record<string, { name: string; arguments: unknown }> | undefined
        const cacheKeys = Object.keys(toolCallsByConversation.value).filter(k => k.startsWith(`${sessionId}:`))
        if (cacheKeys.length > 0) cached = toolCallsByConversation.value[cacheKeys[cacheKeys.length - 1]]
        const cachedCall = cached ? cached[toolCallId] : undefined
        const toolArgs = cachedCall?.arguments ?? toolData.arguments ?? {}
        if (!cachedCall) {
          console.warn(`[chat-store] toolCallId=${toolCallId} 未命中 toolCallsByConversation 缓存，回退事件 arguments`)
        }

        // 记录到 toolCallsBySession
        const tcArray = toolCallsBySession.value[sessionId] ?? []
        if (!tcArray.find(tc => tc.toolCallId === toolCallId)) {
          tcArray.push({ toolCallId, toolName, status: 'pending' })
          toolCallsBySession.value[sessionId] = tcArray
        }

        const sendResult = (id: string, result: string) => {
          agentApi?.toolResult({ profile: sessionStore.profile ?? 'default', sessionId, toolCallId: id, result }).catch(() => { /* 本地调用失败静默 */ })
        }

        // ── 本地 AgentLoop：工具已在主进程执行，renderer 只需处理 UI 类工具（clarify） ──
        console.log(`[chat-store] exe_client_tool 事件（本地模式忽略）tool=${toolName}`)

        // clarify 工具：往聊天框添加消息，渲染 ClarifyCard
        if (toolName === 'builtin_tinker_clarify') {
          const args = (toolArgs ?? {}) as Record<string, unknown>
          addClarifyMessage({
            toolCallId,
            sessionId,
            question: (args.question as string) || '',
            choices: args.choices as string[] | undefined | null
          })
        }
        break
      }
      case 'exe_mcp_tool': {
        const toolPayload = payload as ExecuteToolPayload
        const toolData = toolPayload.data
        if (!toolData) break
        const toolCallId = toolData.id ?? ''
        const toolName = toolData.name ?? ''
        const toolArgs = toolData.arguments ?? {}
        if (!toolCallId || !toolName) break

        // 本地 AgentLoop：工具已在主进程执行（含 MCP 工具），renderer 无需处理
        console.log(`[chat-store] exe_client_tool 事件（本地模式忽略）tool=${toolName}`)
        break
      }
    }
  }

  /** 处理 error 通道事件 */
  function handleErrorEvent(payload: ErrorPayload): void {
    const sessionId = payload.sessionId ?? ''
    handleError(sessionId, payload)
  }

  /** 处理 tips 通道事件 */
  function handleTipsEvent(payload: TipsPayload): void {
    const message = payload.message ?? ''
    if (!message) return

    showInfoToast(message)
    const code = payload.type ?? ''
    if (code === 'CONVERSATION_INTERRUPTED') {
      const sid = payload.sessionId ?? ''
      if (sid) isProcessingBySession.value[sid] = false
    }
  }

  // ── Action: 发送消息 ──

  function sendMessage(sessionId: string, content: string, profile?: string): void {
    if (!content.trim()) return
    const api = agentApi ?? initAgentApi()
    if (!api) return

    const activeProfile = profile ?? sessionStore.profile ?? 'default'

    const userMsg: ApiMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      role: 'user',
      messageType: 'user_message',
      content,
      timestamp: Date.now(),
      status: 'sending'
    }

    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = []
    }
    messagesBySession.value[sessionId].push(userMsg)

    // 清除该 session 之前残留的流式内容
    streamingContentBySession.value[sessionId] = ''
    streamingReasoningBySession.value[sessionId] = ''

    // 本地 AgentLoop：chat + onToken 流式回调
    api.chat({ sessionId, profile: activeProfile, content }, (evt: AgentStreamEvent) => {
      // 流式 token → 复用 handleTokenEvent 的格式
      // 本地会话无 conversationId（AgentLoop 返回结果才有），用 sessionId 兜底作流式 key
      const convId = (evt as unknown as { conversationId?: string }).conversationId ?? `local:${sessionId}`
      handleTokenEvent({
        sessionId,
        conversationId: convId,
        data: {
          token: evt.text ?? '',
          reasoning: evt.reasoning ?? '',
          toolCallArgs: evt.toolCallArgs ?? '',
          isFinish: evt.isFinish,
        },
      } as unknown as AgentResponseTokenPayload)
    }).then((msg: AgentMessageVO) => {
      // 流式结束后：以最终 MessageVO 补齐（占位消息由 handleTokenEvent 处理）
      userMsg.status = 'sent'
      isProcessingBySession.value[sessionId] = false
      if (msg) {
        finalizeAgentMessage(sessionId, msg)
      }
    }).catch((e: Error) => {
      userMsg.status = 'sent'
      isProcessingBySession.value[sessionId] = false
      // 错误提示已由 preload inv 拦截统一派发（GlobalTipToast），此处不再重复
      void e
    })

    userMsg.status = 'sent'
    isProcessingBySession.value[sessionId] = true
    window.dispatchEvent(new CustomEvent('conversation-start', {
      detail: { sessionId }
    }))
  }

  // ── Action: 切换会话 ──

  function switchSession(sessionId: string): void {
    // 切换到新 session，无特别清理
  }

  function loadMessages(sessionId: string, history: ApiMessage[]): void {
    messagesBySession.value[sessionId] = history
  }

  function prependMessages(sessionId: string, older: ApiMessage[]): void {
    const existing = messagesBySession.value[sessionId] ?? []
    messagesBySession.value[sessionId] = [...older, ...existing]
  }

  // ── Action: 追加流式 chunk ──

  function appendChunk(sessionId: string, content: string): void {
    if (content === '[DONE]') return
    if (!content) return
    const current = streamingContentBySession.value[sessionId] ?? ''
    streamingContentBySession.value[sessionId] = current + content
  }

  // ── Action: 完成回复 ──

  function finalizeMessage(info: {
    content: string
    sessionId: string
    conversationId?: string
    reasoningContent?: string
    messageType?: string
  }): void {
    const finalContent = isValidTokenValue(info.content) ? info.content : (streamingContentBySession.value[info.sessionId] ?? '')
    const finalReasoning = isValidTokenValue(info.reasoningContent)
      ? info.reasoningContent
      : (streamingReasoningBySession.value[info.sessionId] ?? '')

    const assistantMsg: ApiMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: info.sessionId,
      conversationId: info.conversationId,
      role: 'assistant',
      messageType: info.messageType,
      content: finalContent,
      reasoningContent: finalReasoning || undefined,
      timestamp: Date.now(),
      status: 'completed'
    }

    if (!messagesBySession.value[info.sessionId]) {
      messagesBySession.value[info.sessionId] = []
    }
    // 去重：同一会话内容的消息已存在则跳过（STOMP 推送与历史加载竞争导致重复）
    const exists = messagesBySession.value[info.sessionId].some(
      m => m.role === 'assistant' && m.content === finalContent
        && m.conversationId === info.conversationId
    )
    if (exists) {
      streamingContentBySession.value[info.sessionId] = ''
      streamingReasoningBySession.value[info.sessionId] = ''
      isProcessingBySession.value[info.sessionId] = false
      cleanupConversationToken(info.sessionId, info.conversationId)
      return
    }
    messagesBySession.value[info.sessionId].push(assistantMsg)

    streamingContentBySession.value[info.sessionId] = ''
    streamingReasoningBySession.value[info.sessionId] = ''
    isProcessingBySession.value[info.sessionId] = false
    cleanupConversationToken(info.sessionId, info.conversationId)
  }

  // ── Action: 审批（内联为消息）──

  function addApprovalMessage(data: ApprovalRequestPayload): void {
    const sessionId = data.sessionId ?? ''
    if (!sessionId) return
    const raw = data.data as MessageVOData | undefined

    const msg: ApiMessage = {
      // 服务端实时消息 id 可能为 0（未落库）——0 是 falsy，必须走 fallback 保证唯一 key
      id: raw?.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      conversationId: raw?.conversationId ?? data.conversationId,
      role: 'approval',
      messageType: raw?.messageType,
      content: raw?.content ?? '等待审批',
      timestamp: raw?.timestamp ?? Date.now(),
      status: 'completed',
      interactionStatus: (raw?.interactionStatus as 'pending' | 'approved' | 'rejected') ?? 'pending',
      toolName: raw?.toolName,
      toolCallId: raw?.toolCallId,
      approvalArguments: raw?.approvalArguments as unknown | undefined,
      toolCall: raw?.toolCall as ApiMessage['toolCall'] | undefined
    }

    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = []
    }
    messagesBySession.value[sessionId].push(msg)
  }

  /** 服务端推送交互状态变更（如过期） */
  function updateApprovalStatus(toolCallId: string, status: string, sessionId: string): void {
    if (!sessionId || !toolCallId) return

    const msgs = messagesBySession.value[sessionId] ?? []
    const msg = msgs.find(m => m.role === 'approval' && m.toolCallId === toolCallId)
    if (!msg) return

    msg.interactionStatus = status as 'approved' | 'rejected' | 'timed_out'
    if (status === 'timed_out') {
      msg.content = '⏰ 已过期'
    }
  }

  /** 服务端推送 clarify 状态变更（如过期） */
  function updateClarifyStatus(toolCallId: string, sessionId: string): void {
    if (!sessionId || !toolCallId) return

    const msgs = messagesBySession.value[sessionId] ?? []
    const msg = msgs.find(m => m.role === 'clarify' && m.toolCallId === toolCallId)
    if (!msg) return
    msg.interactionStatus = 'timed_out'
    msg.content = '⏰ 已过期'
  }

  /** 内联 clarify 提问消息。 */
  function addClarifyMessage(data: {
    toolCallId: string
    sessionId: string
    question: string
    choices?: string[] | null
  }): void {
    const { toolCallId, sessionId, question, choices } = data
    if (!sessionId || !toolCallId) return

    const msg: ApiMessage = {
      id: `clarify_${toolCallId}_${Date.now()}`,
      sessionId,
      role: 'clarify',
      messageType: 'clarify_request',
      content: '',
      timestamp: Date.now(),
      status: 'completed',
      toolCallId,
      clarifyQuestion: question,
      clarifyChoices: choices ?? null
    }

    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = []
    }
    messagesBySession.value[sessionId].push(msg)
  }

  /** 提交 clarify 回答（View 层 ClarifyCard 直接调此方法发送 tool_result） */
  function submitClarify(toolCallId: string, result: string, sessionId: string): void {
    if (!toolCallId) {
      console.warn('[chat-store] submitClarify: toolCallId is empty, skipping send')
      return
    }
    agentApi?.toolResult({ profile: sessionStore.profile ?? 'default', sessionId, toolCallId, result }).catch(() => { /* 本地调用失败静默 */ })
  }

  function resolveApproval(toolCallId: string, approved: boolean): void {
    if (!agentApi) return

    // 找到对应的审批消息获取 sessionId
    for (const [sid, msgs] of Object.entries(messagesBySession.value)) {
      const msg = msgs.find(m => m.role === 'approval' && m.toolCallId === toolCallId)
      if (!msg) continue

      agentApi.approval({ profile: sessionStore.profile ?? 'default', sessionId: sid, toolCallId, approved }).catch(() => { /* 本地调用失败静默 */ })

      msg.interactionStatus = approved ? 'approved' : 'rejected'
      msg.content = approved ? '✅ 已批准' : '❌ 已拒绝'
      return
    }
  }

  // ── API：消息加载 ──

  /**
   * 从 API 加载会话消息并存入 store。
   * 替代原本 View 层的「listBySession + loadMessages 两步调用」。
   */
  async function loadMessagesFromApi(sessionId: string, limit = 50, offset = 0): Promise<ApiMessage[]> {
    const msgs = await messagesApi.listBySession(sessionId, limit, offset)
    messagesBySession.value[sessionId] = msgs
    return msgs
  }

  /**
   * 加载更旧的消息并 prepend。
   * 替代 View 层的「getMessages().length + listBySession + prependMessages 三步调用」。
   */
  async function loadOlderMessages(sessionId: string, pageSize = 50): Promise<ApiMessage[]> {
    const offset = (messagesBySession.value[sessionId] ?? []).length
    const older = await messagesApi.listBySession(sessionId, pageSize, offset)
    if (older.length > 0) {
      const existing = messagesBySession.value[sessionId] ?? []
      messagesBySession.value[sessionId] = [...older, ...existing]
    }
    return older
  }

  // ── API：对话管理 ──

  /** 原文模式专用：未 normalize 的原始消息（保留完整 toolCall map） */
  async function listByConversationRaw(conversationId: string): Promise<ApiMessage[]> {
    return messagesApi.listByConversationRaw(conversationId)
  }

  async function deleteConversation(conversationId: string, sessionId: string): Promise<void> {
    await messagesApi.deleteConversation(conversationId)
    messagesBySession.value[sessionId] = []
  }

  // ── Action: 中断 ──

  function stopProcessing(sessionId: string): void {
    if (!agentApi) return
    agentApi.interrupt(sessionStore.profile ?? 'default', sessionId).catch(() => { /* 本地调用失败静默 */ })
    streamingContentBySession.value[sessionId] = ''
    streamingReasoningBySession.value[sessionId] = ''
    isProcessingBySession.value[sessionId] = false
  }

  // ── Action: 清空全部消息 ──

  function clearMessages(): void {
    messagesBySession.value = {}
    streamingContentBySession.value = {}
    streamingReasoningBySession.value = {}
    isProcessingBySession.value = {}
  }

  // ── Action: 重置全部 ──

  function resetLocalState(): void {
    messagesBySession.value = {}
    streamingContentBySession.value = {}
    streamingReasoningBySession.value = {}
    isProcessingBySession.value = {}
  }

  function $reset(): void {
    resetLocalState()
    agentApi = null
    initialized = false
  }

  // ── 内部: 错误处理 ──

  function handleError(sessionId: string, payload: ErrorPayload): void {
    const code = payload.type ?? ''
    const message = payload.message ?? ''

    console.error(`[chat-store] Server error ${code}: ${message}`)

    if (sessionId) isProcessingBySession.value[sessionId] = false

    // 事件通道错误（非 IPC invoke）→ 派发全局通知队列（error 样式）
    window.dispatchEvent(new CustomEvent('global-tip', {
      detail: { type: 'error', code: code || 'AGENT_ERROR', message: message || '操作失败，请重试' }
    }))
  }

  /** 清理 per-conversation token 队列 */
  function cleanupConversationToken(sessionId: string, conversationId?: string): void {
    if (!conversationId) return
    const key = `${sessionId}:${conversationId}`
    delete streamingContentByConversation.value[key]
  }

  /**
   * 从 JSON.parse 的 tool call 数组组装完整工具调用缓存：
   * 1) toolCallsByConversation[compositeKey] = { toolCallId: {name, arguments} } —— exe_client_tool 按 id 取参
   * 2) toolCallsBySession[sessionId] 追加 {toolCallId, toolName, status} —— UI todo 列表展示
   *
   * 流式分片处理：每个 chunk 的 arguments 是【增量片段】（首 chunk 可能为空，
   * id/name 只出现在首 chunk）。必须按 index 合并所有片段的 arguments 再整体 parse，
   * 不能取第一个含 id 的对象（否则拿到空/截断片段 → 工具参数丢失）。
   */
  function assembleToolCalls(arr: ToolCallChunk[], sessionId: string, compositeKey: string): void {
    // 纯合并逻辑在 utils/streaming/tool-call-merge（按 index 合并 + JSON.parse）
    const byId = mergeToolCallChunks(arr)
    const tcArray = toolCallsBySession.value[sessionId] ?? []
    for (const [id, call] of Object.entries(byId)) {
      tcArray.push({ toolCallId: id, toolName: call.name, status: 'pending' })
    }
    if (Object.keys(byId).length > 0) {
      toolCallsByConversation.value[compositeKey] = byId
      toolCallsBySession.value[sessionId] = tcArray
    }
  }

  return {
    // 状态
    messagesBySession,
    streamingContentBySession,
    streamingContentByConversation,
    streamingReasoningBySession,
    isProcessingBySession,
    toolCallsBySession,
    toolCallArgsBufferByConversation,
    toolCallsByConversation,

    // 按 session 获取
    getMessages,
    getStreamingReasoning,

    // streaming chunks
    getConvPendingBuffer,
    getActiveStreamingConvId,
    clearConvChunks,

    // Actions
    initAgentApi,
    getAgentApi,
    sendMessage,
    switchSession,
    loadMessages,
    prependMessages,
    appendChunk,
    finalizeMessage,
    cleanupConversationToken,
    addApprovalMessage,
    addClarifyMessage,
    submitClarify,
    resolveApproval,
    stopProcessing,
    clearMessages,
    resetLocalState,
    $reset,
    // API
    loadMessagesFromApi,
    loadOlderMessages,
    listByConversationRaw,
    deleteConversation,
  }
})
