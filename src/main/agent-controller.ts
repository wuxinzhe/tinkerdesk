/**
 * agent-controller.ts — 本地 Agent controller 层
 *
 * 本地客户端的 controller：IPC 接口即对外暴露的接口（无 HTTP controller）。
 * 对应 showing-agent StompController 的职责，映射 AgentLoop 事件：
 *   agent:chat           → chat（onUserMessage）
 *   agent:toolResult     → onToolResult
 *   agent:approval       → onApproval
 *   agent:revoke         → revoke
 *   agent:interrupt      → interrupt（stop）
 *   agent:clearAll       → clearAll
 *
 * 流式 token 通过 agent:token 事件推送；最终响应以 MessageVO 返回（同源）。
 */
import { ipcMain, webContents } from 'electron'
import type { AgentSendRequest, AgentStreamEvent } from '../defines/api/agent-api-types'
import type { AgentLoop } from './loop/agent-loop'
import { nowIso } from './utils/time'

/** 注册 Agent controller（bootstrap 后调用） */
export function registerAgentController(agentLoop: AgentLoop): void {
  // ── 用户消息入口（onUserMessage）──
  ipcMain.handle('agent:chat', async (event, req: AgentSendRequest & { onApproval?: (toolCall: unknown) => Promise<boolean> }) => {
    
    const senderId = event.sender.id

    // 流式回调 → 推送 token 到发起窗口
    const onToken = (chunk: { text: string; reasoning: string; toolCallArgs: string; isFinish: boolean; finishReason?: string }) => {
      const evt: AgentStreamEvent = {
        text: chunk.text || undefined,
        reasoning: chunk.reasoning || undefined,
        toolCallArgs: chunk.toolCallArgs || undefined,
        isFinish: chunk.isFinish,
        finishReason: chunk.finishReason,
      }
      webContents.fromId(senderId)?.send('agent:token', evt)
    }

    // 审批回调：渲染层通过 agent:approval IPC 答复（promise 挂起）
    const onApprovalRequest = (toolCall: { id: string; name: string; arguments?: unknown }, reason?: string) => {
      webContents.fromId(senderId)?.send('agent:approvalRequest', { toolCallId: toolCall.id, name: toolCall.name, arguments: toolCall.arguments, reason })
      return new Promise<boolean>((resolve) => {
        // 挂起：等待渲染层调用 agent:approval IPC 恢复
        // 通过一次性 listener 关联 toolCallId
        const handler = (_event: Electron.IpcMainEvent, payload: { toolCallId: string; approved: boolean }) => {
          if (payload.toolCallId === toolCall.id) {
            ipcMain.removeListener('agent:approval', handler)
            resolve(payload.approved)
          }
        }
        ipcMain.on('agent:approval', handler)
      })
    }

    const result = await agentLoop.chat({
      sessionId: req.sessionId,
      profile: 'default',
      connectId: 'local',
      yolo: false,
      onToken,
      onApprovalRequest,
    }, req.content)

    // 返回统一的 MessageVO（同源）
    return {
      id: undefined,
      sessionId: result.sessionId,
      conversationId: result.conversationId,
      role: 'assistant',
      content: result.response.text,
      reasoningContent: result.response.reasoningContent,
      finishReason: result.response.finishReason,
      messageType: 'assistant_text',
      createdAt: nowIso(),
    }
  })

  // ── 工具结果回调（onToolResult）：UI/扩展工具异步返回 ──
  ipcMain.handle('agent:toolResult', (_event, payload: { sessionId: string; toolCallId: string; result: string }) => {
    return { ok: agentLoop.onToolResult(payload.sessionId, payload.toolCallId, payload.result) }
  })

  // ── 审批响应回调（onApproval）：用户同意/拒绝 ──
  ipcMain.handle('agent:approval', (_event, payload: { sessionId: string; toolCallId: string; approved: boolean }) => {
    return { ok: agentLoop.onApproval(payload.sessionId, payload.toolCallId, payload.approved) }
  })

  // ── 撤回消息（onRevoke）──
  ipcMain.handle('agent:revoke', (_event, payload: { sessionId: string; messageId: string }) => {
    return { ok: agentLoop.revoke(payload.sessionId, payload.messageId) }
  })

  // ── 中断对话（onInterrupt / stop）──
  ipcMain.handle('agent:interrupt', (_event, sessionId: string) => {
    return { ok: agentLoop.interrupt(sessionId) }
  })

  // ── 清理会话状态（clearAll）──
  ipcMain.handle('agent:clearAll', (_event, sessionId: string) => {
    agentLoop.clearAll(sessionId)
    return { ok: true }
  })
}
