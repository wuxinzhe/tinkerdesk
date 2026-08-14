/**
 * chat-store.ts — Chat state management
 *
 * Messages are stored isolated per sessionId.
 * Local TinkerAgent (IPC): the message stream is driven by agentApi.chat()'s
 * onToken callback + the returned MessageVO.
 *
 * 消息路由：agentApi.onMessage → 路由到各个 handler，保持 View → Store → API 单向依赖。
 */
import { createLocalAgentApi } from '@/renderer/api/agent-local'
import { messagesApi } from '@/renderer/api/messages-api'
import type { AgentApi, AgentMessageVO, Message as ApiMessage } from '@/renderer/api/types'
import { STATUS_CONTENT_APPROVED, STATUS_CONTENT_REJECTED, STATUS_CONTENT_TIMED_OUT } from '@/renderer/constants'
import { useSessionStore } from '@/renderer/stores/session-store'
import { playMessageNotification } from '@/renderer/utils/audio-utils'
import { isValidTokenValue } from '@/renderer/utils/streaming/token-validate'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ActionMergedPayload,
  ActionSignalPayload,
  AgentResponseTokenPayload,
  ApprovalRequestPayload,
  MessageVOData,
  SessionTitleUpdatedPayload
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
  /** 每个 conversation 的 tool call 累积片段（流式累积，按 index 分路——多工具各自拼接，isFinish 时逐工具 join 一次 JSON.parse） */
  const toolCallArgsBufferByConversation = ref<Record<string, Record<number, string[]>>>({})
  /** 工具名缓存（工具轮次——main 随 token 下发，按 index 分路——多工具各自保留；isFinish 拼工具卡片用） */
  const toolCallNameByConversation = ref<Record<string, Record<number, string>>>({})
  /** 每个 conversation 的完整 toolCall 缓存：compositeKey → { toolCallId: {name, arguments} }。
   * isFinish 时从 toolCallArgs 组装；exe_client_tool 只下发 id，执行时按 id 从本缓存取完整参数。 */
  const toolCallsByConversation = ref<Record<string, Record<string, { name: string; arguments: unknown }>>>({})
  /** 每个 conversation 的 2 秒轮询定时器（用于清理） */
  /** 每个 session 的推理内容 */
  const streamingReasoningBySession = ref<Record<string, string>>({})
  /** 每个 session 是否正在处理中（用于 UI 指示器，不阻断操作） */
  const isProcessingBySession = ref<Record<string, boolean>>({})

  // AgentApi 引用（本地 TinkerAgent IPC，由 initAgentApi 创建）
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
   * 本地 TinkerAgent：流式 token 在 sendMessage 的 chat 回调中处理；
   * onApprovalRequest 处理审批请求等事件。
   */
  function initAgentApi(): AgentApi {
    if (initialized && agentApi) return agentApi
    initialized = true
    agentApi = createLocalAgentApi()

    // 统一路由消息入口（协议见 docs/event-protocol.md——route = '{一级}:{二级}' → 分域处理）
    agentApi.onRouteMessage((payload: { route?: string; sessionId?: string; data?: unknown }) => {
      handleRouteMessage(payload)
    })

    return agentApi
  }

  /** 路由消息分发：route = '{一级}:{二级}'——客户端自行解析（convId 可选——多会话并发区分对话） */
  function handleRouteMessage(payload: { route?: string; sessionId?: string; convId?: string; data?: unknown }): void {
    const [route1, route2] = (payload.route ?? '').split(':')
    const sessionId = payload.sessionId ?? ''
    const data = payload.data as Record<string, unknown> | undefined

    switch (route1) {
      case 'chat': {
        switch (route2) {
          case 'token': {
            // 流式 token（data = { chunks: StreamToken[] }——后端攒批原样下发，前端负责拼接累积）
            const chunks = (data?.chunks as Array<Record<string, unknown>> | undefined) ?? []
            for (const chunk of chunks) {
              handleTokenEvent({
                sessionId,
                conversationId: `local:${sessionId}`,
                data: {
                  token: (chunk?.text as string) ?? '',
                  reasoning: (chunk?.reasoning as string) ?? '',
                  toolCallArgs: (chunk?.toolCallArgs as string) ?? '',
                  toolCallName: chunk?.toolCallName as string | undefined,
                  toolCallIndex: chunk?.toolCallIndex as number | undefined,
                  isFinish: chunk?.isFinish ?? false,
                  finishReason: chunk?.finishReason as string | undefined,
                },
              } as unknown as AgentResponseTokenPayload)
            }
            break
          }
          case 'approval':
            setSessionStage(sessionId, 'approval')
            addApprovalMessage({
              sessionId,
              conversationId: (data?.conversationId as string) ?? '',
              data: {
                toolCallId: data?.toolCallId as string,
                toolName: data?.name as string,
                approvalArguments: data?.arguments as Record<string, unknown>,
              } as unknown as MessageVOData,
            } as ApprovalRequestPayload)
            break
          case 'clarify': {
            setSessionStage(sessionId, 'clarify')
            const question = (data?.arguments as Record<string, unknown> | undefined)?.['question'] as string | undefined
            const choices = (data?.arguments as Record<string, unknown> | undefined)?.['choices'] as string[] | undefined
            addClarifyMessage({ toolCallId: data?.toolCallId as string, sessionId, question: question ?? '', choices: choices ?? null })
            break
          }
          case 'interaction_status':
            updateApprovalStatus((data?.toolCallId as string) ?? '', (data?.interactionStatus as string) ?? '', sessionId)
            break
        }
        break
      }
      case 'session':
      case 'action':
        // 会话数据（stats/complete/title/budget）+ 行为动作（tool_start/tool_done）→ 同一动作处理
        handleActionEvent({ type: route2, data: payload.data, sessionId, convId: payload.convId } as unknown as ActionMergedPayload)
        break
      // tip/error 域由 preload 顶层分发（GlobalTipToast）——不在此处理
    }
  }
  function handleTokenEvent(payload: AgentResponseTokenPayload): void {
    const data = payload.data
    if (!data) return
    const sessionId = data.sessionId || payload.sessionId
    const conversationId = data.conversationId || payload.conversationId
    if (!sessionId || !conversationId) return

    const compositeKey = `${sessionId}:${conversationId}`

    // ── 新流到来 → 清理上一轮残留 + 创建占位消息 ──
    // （纯推理流：streamingContent/args 都空——必须把 reasoning 也计入，否则每 chunk 都判为新流→清空→只留最后 token）
    const isNewStream = !streamingContentByConversation.value[compositeKey]
      && !streamingReasoningBySession.value[sessionId]
      && !toolCallArgsBufferByConversation.value[compositeKey]
    if (isNewStream && (isValidTokenValue(data.token) || isValidTokenValue(data.toolCallArgs) || isValidTokenValue(data.reasoning))) {
      // 清理上一轮工具调用记录
      delete toolCallsBySession.value[sessionId]
      // 清理上一轮推理内容
      delete streamingReasoningBySession.value[sessionId]
      // 清理旧的占位消息（如果仍在）
      removeStreamingPlaceholder(sessionId)
    }

    // 1. 文本内容 → 追加到文本缓冲区（流式期间不渲染，isFinish 后完整 Markdown 渲染）
    if (isValidTokenValue(data.token)) {
      const current = streamingContentByConversation.value[compositeKey] ?? ''
      streamingContentByConversation.value[compositeKey] = current + data.token
      // 确保占位消息存在（content 暂为空，isFinish 后一次填充）
      ensureStreamingPlaceholder(sessionId, conversationId, compositeKey)
    }

    // 2. 推理内容 → 追加到推理缓冲区
    if (isValidTokenValue(data.reasoning)) {
      // 推理累积（思考气泡 store 直读——无需 window 事件派发）
      streamingReasoningBySession.value[sessionId] =
        (streamingReasoningBySession.value[sessionId] ?? '') + data.reasoning
    }

    // 3. 工具调用参数 → 按 index 分路 push（isFinish 时逐工具 join 一次 JSON.parse）
    if (isValidTokenValue(data.toolCallArgs)) {
      // 工具调用意图出现（即使混合 content——也算工具调用）→ 阶段 tool（齿轮旋转）
      setSessionStage(sessionId, 'tool')
      const idx = data.toolCallIndex ?? 0
      const byIndex = toolCallArgsBufferByConversation.value[compositeKey] ?? {}
      const arr = byIndex[idx] ?? []
      arr.push(data.toolCallArgs)
      byIndex[idx] = arr
      toolCallArgsBufferByConversation.value[compositeKey] = byIndex
      // 工具轮次也确保占位消息（isFinish 时转工具卡片）
      ensureStreamingPlaceholder(sessionId, conversationId, compositeKey)
    }
    // 3.5 工具名缓存（首次出现——按 index 分路，多工具各自保留）
    if (isValidTokenValue(data.toolCallName)) {
      // 工具调用意图出现（toolCallName 先于 args——同样算工具调用）
      setSessionStage(sessionId, 'tool')
      const idx = data.toolCallIndex ?? 0
      const byIndex = toolCallNameByConversation.value[compositeKey] ?? {}
      if (!byIndex[idx]) {
        byIndex[idx] = data.toolCallName as string
        toolCallNameByConversation.value[compositeKey] = byIndex
      }
    }

    // isFinish → 判断是否工具轮次（finishReason 明确判断）+ 完整文本一次填充占位消息
    if (data.isFinish) {
      const accumulated = streamingContentByConversation.value[compositeKey] ?? ''
      const fullText = accumulated || (isValidTokenValue(data.token) ? data.token : '')
      const buffers = toolCallArgsBufferByConversation.value[compositeKey]
      // 工具轮次：finishReason === 'tool_calls'（或缓冲非空兜底——按 index 分路后是对象）
      const isToolTurn = data.finishReason === 'tool_calls' || (buffers && Object.keys(buffers).length > 0)

      // 文本轮次：finalize 为 assistant_text
      if (fullText && !isToolTurn) {
        finalizeStreamingPlaceholder(sessionId, conversationId, {
          content: fullText,
          messageType: 'assistant_text'
        })
      }

      // 工具轮次：占位转 assistant_tool_call 卡片（content 过渡文本 + toolCall map）
      if (isToolTurn) {
        let toolCallJson: string | undefined
        const nameByIndex = toolCallNameByConversation.value[compositeKey]
        const argsByIndex = toolCallArgsBufferByConversation.value[compositeKey]
        if (argsByIndex && Object.keys(argsByIndex).length > 0) {
          // 多工具分路：逐 index 拼 map 结构 { call_<idx>: { name, arguments } }
          const toolCallsMap: Record<string, { name: string; arguments: unknown }> = {}
          for (const [idxStr, arr] of Object.entries(argsByIndex)) {
            const idx = Number(idxStr)
            const raw = arr.join('')
            let parsed: unknown = raw
            try { parsed = JSON.parse(raw) } catch { /* 参数解析失败——保留原文 */ }
            toolCallsMap[`call_${idx}`] = {
              name: nameByIndex?.[idx] ?? '',
              arguments: parsed,
            }
          }
          toolCallJson = JSON.stringify(toolCallsMap)
          delete toolCallArgsBufferByConversation.value[compositeKey]
        }
        delete toolCallNameByConversation.value[compositeKey]
        finalizeStreamingPlaceholder(sessionId, conversationId, {
          content: fullText,
          messageType: 'assistant_tool_call',
          toolCall: toolCallJson,
        })
      }
      // 清空文本缓冲区（接收区随之隐藏，Markdown 区显示完整回复）
      delete streamingContentByConversation.value[compositeKey]

      // 清理推理缓冲区（isFinish 后不再需要）
      delete streamingReasoningBySession.value[sessionId]

      cleanupConversationToken(sessionId, conversationId)
      isProcessingBySession.value[sessionId] = false
    }
  }

  /** 确保存在当前 conversation 的流式占位消息（content 由 runSegmentation 追加） */
  function ensureStreamingPlaceholder(sid: string, convId: string, _key: string): void {
    if (!messagesBySession.value[sid]) messagesBySession.value[sid] = []
    const msgs = messagesBySession.value[sid]
    // 只匹配"活动中的"占位（isStreaming=true）；上一轮已完成的回复不匹配
    const existing = msgs.find(m => m.isStreaming)
    if (existing) {
      // content 不在此更新——由 runSegmentation 分段后追加
      return
    }
    // 创建新占位（唯一 id，content 初始为空；工具轮次带工具名——胶囊流式即时可见；多工具取第一个）
    const toolName = toolCallNameByConversation.value[`${sid}:${convId}`]?.[0] ?? ''
    msgs.push({
      id: `msg_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: sid,
      conversationId: convId,
      role: 'assistant',
      messageType: toolName ? 'assistant_tool_call' : 'assistant_text',
      toolCallName: toolName ?? '',
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
  function finalizeStreamingPlaceholder(sid: string, _convId: string | undefined, info: {
    content: string
    messageType?: string
    reasoningContent?: string
    toolCall?: string
  }): void {
    const msgs = messagesBySession.value[sid]
    if (!msgs) return
    const placeholder = msgs.find(m => m.isStreaming)
    if (!placeholder) return
    // 完整文本一次填充（流式期间 content 为空，不分批渲染）
    placeholder.content = info.content
    placeholder.messageType = info.messageType ?? 'assistant_text'
    placeholder.isStreaming = false
    placeholder.status = 'completed'
    placeholder.timestamp = Date.now()
    // id 保持流式期间生成的唯一 id——同一消息在 v-for 中 key 不变，DOM 原地更新
    if (isValidTokenValue(info.reasoningContent)) {
      placeholder.reasoningContent = info.reasoningContent
    }
    if (isValidTokenValue(info.toolCall)) {
      placeholder.toolCall = info.toolCall
    }
  }

  /** 本地 TinkerAgent 返回最终 MessageVO 时：只更新流式占位（走流式输出，不再追加新消息） */
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

  /** 切换 conversation 时调用：清理临时状态（缓冲区分段已移除，无轮询可停） */
  function clearConvChunks(_prevSessionId: string, prevConvId: string): void {
    if (!prevConvId) return
  }

  /** 获取指定 conversation 的未分段原始缓冲区文本（供接收区显示） */
  function getConvPendingBuffer(sessionId: string, conversationId: string): string {
    if (!sessionId || !conversationId) return ''
    return streamingContentByConversation.value[`${sessionId}:${conversationId}`] ?? ''
  }

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
      case 'complete': {
        // 回复提醒（per-session notify_on_complete——事件 data 带开关；开才播）
        const notifyData = (payload as ActionSignalPayload).data as { notifyOnComplete?: boolean } | null | undefined
        if (notifyData?.notifyOnComplete) {
          playMessageNotification()
        }
        setSessionStage(sessionId, 'completed')
        isProcessingBySession.value[sessionId] = false
        window.dispatchEvent(new CustomEvent('conversation-complete', {
          detail: { sessionId, convId: (payload as ActionSignalPayload).convId ?? '', data: (payload as ActionSignalPayload).data ?? null }
        }))
        break
      }
      case 'stats': {
        // 每轮统计数据（数据面板——命中率/模型/上下文使用）
        window.dispatchEvent(new CustomEvent('agent-stats-update', {
          detail: { sessionId, data: (payload as ActionMergedPayload).data ?? null }
        }))
        break
      }
      case 'title': {
        const titleData = payload as SessionTitleUpdatedPayload
        window.dispatchEvent(new CustomEvent('session-title-updated', {
          detail: { sessionId, title: titleData.data?.title ?? '' }
        }))
        break
      }
      case 'tool_start': {
        // 工具调用开始 → 阶段 tool（齿轮旋转——区别于 LLM 思考的 spinner）
        setSessionStage(sessionId, 'tool')
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
        // 工具完成 → 回 working（LLM 继续生成）
        setSessionStage(sessionId, 'working')
        break
      }
    }
  }

  // ── Action: 发送消息 ──

  function sendMessage(sessionId: string, content: string, profile?: string): void {
    if (!content.trim()) return
    // 发起消息 → 阶段 working（localStorage 持久化）
    setSessionStage(sessionId, 'working')
    const api = agentApi ?? initAgentApi()
    if (!api) return

    const activeProfile = profile ?? sessionStore.profile ?? 'default'

    const userMsg: ApiMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      role: 'user',
      messageType: 'user_normal',
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

    // 本地 TinkerAgent：chat 返回最终 MessageVO（流式 token 由 onRouteMessage 的 chat:token 统一处理）
    api.chat({ sessionId, profile: activeProfile, content }).then((msg: AgentMessageVO) => {
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
      messageType: raw?.messageType ?? 'approval_request',
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
      msg.content = STATUS_CONTENT_TIMED_OUT
    }
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
    // 本地回显：完整载荷（{question, choices_offered, user_response}）写入 clarify 消息 content（刷新后/其他组件读取都有"已回复"）
    const list = messagesBySession.value[sessionId]
    const target = list?.find((m) => m.messageType === 'clarify_request' && m.toolCallId === toolCallId)
    if (target) {
      target.content = result
    }
    agentApi?.toolResult({ profile: sessionStore.profile ?? 'default', sessionId, toolCallId, result }).catch(() => { /* 本地调用失败静默 */ })
  }

  /** 本轮对话自动批准：找到当前审批消息的 conversationId → 后端放行当前挂起 + 本轮后续审批 */
  function resolveAutoApprove(toolCallId: string): void {
    if (!agentApi) return
    for (const [, msgs] of Object.entries(messagesBySession.value)) {
      const msg = msgs.find(m => m.role === 'approval' && m.toolCallId === toolCallId)
      if (!msg) continue
      const convId = msg.conversationId ?? ''
      if (!convId) {
        console.warn('[approval] autoApprove 缺 conversationId')
        return
      }
      console.log('[approval] 本轮自动批准 ' + JSON.stringify({ convId, toolCallId }))
      agentApi.autoApprove(convId).catch(() => { /* 本地调用失败静默 */ })
      // 本地：已放行的审批消息标记为已批准
      msg.interactionStatus = 'approved'
      return
    }
  }

  /** 审批请求事件 → 弹审批卡片（sessionId/conversationId 由 main 随事件携带；兜底用当前会话） */
  function resolveApproval(toolCallId: string, approved: boolean): void {
    console.log('[approval] resolveApproval called ' + JSON.stringify({ toolCallId, approved, hasApi: !!agentApi, sessions: Object.keys(messagesBySession.value).length }))
    if (!agentApi) return

    // 找到对应的审批消息获取 sessionId
    for (const [sid, msgs] of Object.entries(messagesBySession.value)) {
      const msg = msgs.find(m => m.role === 'approval' && m.toolCallId === toolCallId)
      if (!msg) continue
      console.log('[approval] 找到审批消息 ' + JSON.stringify({ sid, msgToolCallId: msg.toolCallId }))

      agentApi.approval({ profile: sessionStore.profile ?? 'default', sessionId: sid, toolCallId, approved }).catch(() => { /* 本地调用失败静默 */ })

      msg.interactionStatus = approved ? 'approved' : 'rejected'
      msg.content = approved ? STATUS_CONTENT_APPROVED : STATUS_CONTENT_REJECTED
      return
    }
  }

  // ── API：消息加载 ──

  /**
   * 从 API 加载会话消息并存入 store。
   * 替代原本 View 层的「listBySession + loadMessages 两步调用」。
   */
  async function loadMessagesFromApi(sessionId: string, limit = 50, offset = 0): Promise<ApiMessage[]> {
    const msgs = await messagesApi.listBySession(sessionId, sessionStore.profile ?? 'default', limit, offset)
    // main 返回 DESC（最新在前）——反转成 ASC 显示顺序（旧在上新在下）
    messagesBySession.value[sessionId] = [...msgs].reverse()
    return msgs
  }

  /**
   * 加载更旧的消息并 prepend。
   * 替代 View 层的「getMessages().length + listBySession + prependMessages 三步调用」。
   */
  async function loadOlderMessages(sessionId: string, pageSize = 50): Promise<ApiMessage[]> {
    const offset = (messagesBySession.value[sessionId] ?? []).length
    const older = await messagesApi.listBySession(sessionId, sessionStore.profile ?? 'default', pageSize, offset)
    if (older.length > 0) {
      const existing = messagesBySession.value[sessionId] ?? []
      // older 是更旧页（DESC）——页内反转成 ASC（最旧在前）——prepend 到顶部（更旧的在更上面）
      messagesBySession.value[sessionId] = [...older.reverse(), ...existing]
    }
    return older
  }

  // ── API：对话管理 ──

  /** 原文模式专用：未 normalize 的原始消息（保留完整 toolCall map） */
  async function listByConversationRaw(conversationId: string): Promise<ApiMessage[]> {
    return messagesApi.listByConversationRaw(conversationId, sessionStore.profile ?? 'default')
  }

  /** 对话模式专用：normalize 后的消息（MessageBubble 按 messageType 渲染工具/混合/审批/澄清卡） */
  async function listByConversation(conversationId: string): Promise<ApiMessage[]> {
    return messagesApi.listByConversation(conversationId, sessionStore.profile ?? 'default')
  }

  async function deleteConversation(conversationId: string, sessionId: string): Promise<void> {
    await messagesApi.deleteConversation(conversationId, sessionStore.profile ?? 'default')
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

  /** 清理 per-conversation token 队列 */
  function cleanupConversationToken(sessionId: string, conversationId?: string): void {
    if (!conversationId) return
    const key = `${sessionId}:${conversationId}`
    delete streamingContentByConversation.value[key]
  }

  /**
   * 会话阶段推导（localStorage 持久化——前端自维护——刷新后恢复）：
   * working=工作中（spinner）/ approval=等审批（❗）/ clarify=等回答（？）/ completed=已完成（✓）/ idle
   * 更新源（全在前端）：sendMessage→working；approval/clarify 事件→对应阶段；complete→completed；切会话→idle
   */
  type SessionStage = 'working' | 'tool' | 'approval' | 'clarify' | 'completed' | 'idle'
  const STAGE_KEY = (sessionId: string): string => `session_state_${sessionId}`
  const VALID_STAGES: SessionStage[] = ['working', 'tool', 'approval', 'clarify', 'completed', 'idle']

  function loadSessionStates(): Record<string, SessionStage> {
    const map: Record<string, SessionStage> = {}
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('session_state_')) {
          const sid = key.slice('session_state_'.length)
          const v = localStorage.getItem(key)
          if (v && (VALID_STAGES as string[]).includes(v)) {
            map[sid] = v as SessionStage
          }
        }
      }
    } catch {
      // localStorage 不可用（隐私模式等）——纯内存态
    }
    return map
  }

  const sessionStates = ref<Record<string, SessionStage>>(loadSessionStates())

  function setSessionStage(sessionId: string, stage: SessionStage): void {
    // 相同状态不重复设置（连续 tool_start 保持 tool——不触发图标切换动画）
    if (sessionStates.value[sessionId] === stage) return
    sessionStates.value[sessionId] = stage
    try {
      if (stage === 'idle') localStorage.removeItem(STAGE_KEY(sessionId))
      else localStorage.setItem(STAGE_KEY(sessionId), stage)
    } catch {
      // 忽略——内存态仍有效
    }
  }

  function sessionStage(sessionId: string): SessionStage {
    return sessionStates.value[sessionId] ?? 'idle'
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
    sessionStage,
    setSessionStage,

    // streaming chunks
    getConvPendingBuffer,
    getActiveStreamingConvId,
    clearConvChunks,

    // Actions
    sendMessage,
    submitClarify,
    resolveApproval,
    resolveAutoApprove,
    stopProcessing,
    clearMessages,
    resetLocalState,
    $reset,
    // API
    loadMessagesFromApi,
    loadOlderMessages,
    listByConversationRaw,
    listByConversation,
    deleteConversation,
  }
})
