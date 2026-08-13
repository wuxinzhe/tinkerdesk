/**
 * agent-local.ts — 本地 TinkerAgent 实现（IPC 通信）
 *
 * AgentApi 的本地实现：通过 preload 暴露的 electron API 调用主进程 TinkerAgent controller。
 * 渲染层用同一套 AgentApi 接口，切换 local/remote 只需换工厂函数。
 */
import type {
  AgentApi,
  AgentApprovalRequest,
  AgentIpcApi,
  AgentMessageVO,
  AgentSendRequest,
  AgentStreamEvent,
  AgentToolResultRequest,
} from '@/renderer/api/types'

/** 本地 TinkerAgent 实现 */
export class AgentLocal implements AgentApi {
  private messageCbs: Array<(msg: AgentMessageVO) => void> = []

  constructor(private readonly api: AgentIpcApi) {}

  /** 发送消息（onUserMessage）：流式 token 通过回调 + 消息事件广播 */
  async chat(req: AgentSendRequest, onToken?: (evt: AgentStreamEvent) => void): Promise<AgentMessageVO> {
    const msg = await this.api.chat(req, onToken)
    this.broadcastMessage(msg)
    return msg
  }

  /** 工具结果回调 */
  async toolResult(req: AgentToolResultRequest): Promise<{ok: boolean}> {
    return this.api.toolResult(req)
  }

  /** 审批响应 */
  async approval(req: AgentApprovalRequest): Promise<{ok: boolean}> {
    return this.api.approval(req)
  }

  /** 本轮对话自动批准 */
  async autoApprove(conversationId: string): Promise<{ok: boolean}> {
    return this.api.autoApprove(conversationId)
  }

  /** 撤回消息 */
  async revoke(profile: string, sessionId: string, messageId: string): Promise<{ok: boolean}> {
    return this.api.revoke(profile, sessionId, messageId)
  }

  /** 中断对话 */
  async interrupt(profile: string, sessionId: string): Promise<{ok: boolean}> {
    return this.api.interrupt(profile, sessionId)
  }

  async interruptNoPending(profile: string, sessionId: string): Promise<{ok: boolean}> {
    return this.api.interruptNoPending(profile, sessionId)
  }

  /** 清理会话 */
  async clearAll(profile: string, sessionId: string): Promise<{ok: boolean}> {
    return this.api.clearAll(profile, sessionId)
  }

  /** 统一路由消息入口（route = '{一级}:{二级}'——客户端自行解析分发） */
  onRouteMessage(cb: (payload: { route?: string; sessionId?: string; data?: unknown }) => void): () => void {
    return this.api.onRouteMessage(cb)
  }

  /** 监听消息事件 */
  onMessage(cb: (msg: AgentMessageVO) => void): void {
    this.messageCbs.push(cb)
  }

  private broadcastMessage(msg: AgentMessageVO): void {
    for (const cb of this.messageCbs) {
      cb(msg)
    }
  }
}

/** 工厂：创建本地 AgentApi（走 preload 暴露的 window.api.agent） */
export function createLocalAgentApi(): AgentApi {
  const api = (window as unknown as {api?: {agent?: AgentIpcApi}}).api?.agent
  if (!api) {
    throw new Error('本地 Agent IPC 不可用（window.api.agent 未暴露）')
  }
  return new AgentLocal(api)
}
