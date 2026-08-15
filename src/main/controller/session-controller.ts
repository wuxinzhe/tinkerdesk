/**
 * session-controller.ts — 会话 IPC controller（class 形式）
 *
 * SessionController (local single-user, no userId):
 * Session list / create / rename / YOLO query & toggle.
 * Layering: controller → service (SessionService), never touches repository directly.
 * IPC prefix: session:*
 *
 * Structure: register() only binds ipcMain.handle; logic lives in
 * named methods with fully typed params/returns.
 */

import { handleTrusted } from '../security/ipc-guard'
import type { SessionService } from '../service/session-service'
import { MemoryStore } from '../service/memory-store'
import type { AgentConfigService } from '../service/agent-config-service'
import type { ModelConfigService } from '../service/model-config-service'
import type { CompactionService } from '../service/compaction-service'
import { SCENE_CHAT, SCENE_SUMMARY } from '../core/llm/types'
import type { SessionEntity } from '../repository/types'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { SessionListItemVO, CreateSessionRequestDTO, UpdateSessionRequestDTO, ListSessionsQueryDTO } from './types'

/** 单次查询最大条数限制 */
const MAX_LIMIT = 200

/** SessionEntity → SessionListItemVO */
export function toSessionListItemVO(e: SessionEntity): SessionListItemVO {
  const ts = e.startedAt ? new Date(e.startedAt).getTime() : 0
  return {
    id: e.id,
    title: e.title || '新对话',
    createdAt: ts,
    updatedAt: ts,
    profile: e.profile || 'default',
    status: 'idle',
    yolo: e.yolo,
    reasoningDepth: e.reasoningDepth,
    notifyOnComplete: e.notifyOnComplete,
  }
}

/** 会话 controller */
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly memoryStore?: MemoryStore,
    private readonly agentConfigService?: AgentConfigService,
    private readonly modelConfigService?: ModelConfigService,
    private readonly compactionService?: CompactionService,
  ) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('session:list', (_event, payload) => this.listSessions(payload))
    handleTrusted('session:create', (_event, payload) => this.createSession(payload))
    handleTrusted('session:update', (_event, payload) => this.renameSession(payload))
    handleTrusted('session:set-reasoning-depth', (_event, payload) => this.setReasoningDepth(payload))
    handleTrusted('session:get-reasoning-depth', (_event, payload) => this.getReasoningDepth(payload))
    handleTrusted('session:set-notify-complete', (_event, payload) => this.setNotifyComplete(payload))
    handleTrusted('session:getYolo', (_event, payload) => this.getYolo(payload))
    handleTrusted('session:toggleYolo', (_event, payload) => this.toggleYolo(payload))
    handleTrusted('session:context-stats', (_event, payload) => this.contextStats(payload))
    handleTrusted('session:compact', (_event, payload) => this.compactSession(payload))
    handleTrusted('session:stats', (_event, payload) => this.getStats(payload))
    handleTrusted('dashboard:get', (_event, payload) => this.getDashboard(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询会话列表（按 profile 限定 + 分页） */
  private listSessions(payload: ListSessionsQueryDTO): ApiResponse<SessionListItemVO[]> {
    const profile = payload?.profile ?? 'default'
    const limit = Math.min(payload?.limit ?? 20, MAX_LIMIT)
    const offset = payload?.offset ?? 0
    const entities = this.sessionService.listSessions(profile, limit, offset)
    return ok(entities.map(toSessionListItemVO))
  }

  /** 创建会话 */
  private createSession(payload: CreateSessionRequestDTO): ApiResponse<SessionListItemVO> {
    const profile = payload?.profile ?? 'default'
    const title = payload?.title ?? ''
    const entity = this.sessionService.create(profile, title)
    return ok(toSessionListItemVO(entity))
  }

  /** 重命名会话标题（profile 限定） */
  private renameSession(payload: UpdateSessionRequestDTO): ApiResponse<null> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    this.sessionService.updateTitle(payload.sessionId, payload.title, payload.profile)
    return ok(null)
  }

  /** 设置推理深度（per-session——'' / low / medium / high） */
  private setReasoningDepth(payload: { profile: string; sessionId: string; reasoningDepth: string }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    const updated = this.sessionService.updateReasoningDepth(payload.sessionId, payload.reasoningDepth, payload.profile)
    return ok(updated)
  }

  /** 查询推理深度（per-session——'' / low / medium / high） */
  private getReasoningDepth(payload: { profile: string; sessionId: string }): ApiResponse<string> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    return ok(session.reasoningDepth ?? 'medium')
  }

  /** 设置回复提醒（per-session——对话完成时播放提醒音效） */
  private setNotifyComplete(payload: { profile: string; sessionId: string; enabled: boolean }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    const updated = this.sessionService.updateNotifyOnComplete(payload.sessionId, Boolean(payload.enabled), payload.profile)
    return ok(updated)
  }

  /** 查询会话 YOLO 状态（profile 限定） */
  private getYolo(payload: { profile: string; sessionId: string }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    return ok(session.yolo)
  }

  /** 切换会话 YOLO 模式（profile 限定） */
  private toggleYolo(payload: { profile: string; sessionId: string }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    const newYolo = this.sessionService.toggleYolo(payload.sessionId, session.profile)
    return ok(newYolo)
  }

  /** 上下文容量（当前 tokens + 模型上限——chat-input 压缩面板显示用） */
  private contextStats(payload: { profile: string; sessionId: string }): ApiResponse<{ currentTokens: number; maxTokens: number }> {
    try {
      const session = this.sessionService.findById(payload.sessionId, payload.profile)
      if (!session) {
        return fail('会话不存在')
      }
      const mainConfigs = this.modelConfigService?.resolveForScene(payload.profile, SCENE_CHAT) ?? []
      const maxTokens = mainConfigs[0]?.contextLimit ?? 0
      return ok({ currentTokens: session.currentContextTokens ?? 0, maxTokens })
    } catch (e) {
      return fail(e instanceof Error ? e.message : '读取上下文容量失败')
    }
  }

  /** 手动压缩指定会话（profile + sessionId 必传） */
  private async compactSession(payload: { profile: string; sessionId: string }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    try {
      const session = this.sessionService.findById(payload.sessionId, payload.profile)
      if (!session) {
        return fail('会话不存在')
      }
      if (!this.compactionService || !this.modelConfigService || !this.agentConfigService) {
        return fail('压缩服务未就绪')
      }
      const mainConfigs = this.modelConfigService.resolveForScene(payload.profile, SCENE_CHAT)
      const mainConfig = mainConfigs[0]
      if (!mainConfig) {
        return fail('未找到主聊天模型配置')
      }
      const agentConfig = this.agentConfigService.get(payload.profile)
      const compressConfigs = this.modelConfigService.resolveForScene(payload.profile, SCENE_SUMMARY)
      const compressConfig = compressConfigs[0] ?? mainConfig
      const okResult = await this.compactionService.compact(
        payload.sessionId,
        payload.profile,
        mainConfig.contextLimit,
        agentConfig?.tailRatio ?? 0.5,
        compressConfig,
      )
      return ok({ success: okResult, message: okResult ? '压缩完成' : '无可压缩内容（上下文大头可能为 system prompt/工具 schema）' })
    } catch (e) {
      return fail(e instanceof Error ? e.message : '压缩失败')
    }
  }

  /** 数据面板整合接口（只读——一次性给前端全部读数） */
  private getDashboard(payload: { profile: string; sessionId: string }): ApiResponse<unknown> {
    try {
      const profile = payload.profile
      const session = this.sessionService.findById(payload.sessionId, profile)

      // 上下文窗口总量（模型配置第一个）
      let contextLimit = 0
      let modelName = ''
      if (this.modelConfigService) {
        const configs = this.modelConfigService.resolveAll(profile)
        const main = configs[0]
        if (main) {
          contextLimit = main.contextLimit ?? 0
          modelName = main.modelName ?? ''
        }
      }

      // 压缩阈值（agent_config；保护阈值 0.2 下限 / 0.85 上限——只读展示）
      let thresholdPercent = 0
      if (this.agentConfigService) {
        try {
          thresholdPercent = this.agentConfigService.get(profile).thresholdPercent ?? 0
        } catch {
          thresholdPercent = 0
        }
      }

      // 命中率 + 总消耗（会话累积）
      const input = session?.inputTokens ?? 0
      const cacheRead = session?.cacheReadTokens ?? 0
      const hitRate = input > 0 ? Math.min(cacheRead / input, 1) : 0

      // memory 占用（两个记忆：memory + user——总量在 agentConfig，当前值实时计算）
      let memoryChars = 0
      let memoryEntries = 0
      let memoryMaxChars = 0
      let userChars = 0
      let userEntries = 0
      let userMaxChars = 0
      if (this.memoryStore && profile) {
        const memEntries = this.memoryStore.readAll(MemoryStore.TARGET_MEMORY, profile)
        memoryEntries = memEntries.length
        memoryChars = memEntries.reduce((sum, e) => sum + e.length, 0)
        const usrEntries = this.memoryStore.readAll(MemoryStore.TARGET_USER, profile)
        userEntries = usrEntries.length
        userChars = usrEntries.reduce((sum, e) => sum + e.length, 0)
      }
      if (this.agentConfigService && profile) {
        try {
          const cfg = this.agentConfigService.get(profile)
          memoryMaxChars = cfg.memoryMaxChars ?? 0
          userMaxChars = cfg.userMaxChars ?? 0
        } catch {
          memoryMaxChars = 0
          userMaxChars = 0
        }
      }

      return ok({
        model: modelName,
        // 上下文窗口（三层）
        contextLimit,
        currentContextTokens: session?.currentContextTokens ?? 0,
        contextUsedPercent: contextLimit > 0 ? Math.min((session?.currentContextTokens ?? 0) / contextLimit, 1) : 0,
        // 压缩阈值（只读——游标展示位置）
        thresholdPercent,
        // 会话统计
        hitRate,
        totalTokens: (session?.inputTokens ?? 0) + (session?.outputTokens ?? 0),
        promptTokens: input,
        durationMs: session?.totalDurationMs ?? 0,
        iterations: session?.totalIterations ?? 0,
        llmRequests: session?.totalLlmRequests ?? 0,
        rounds: session?.messageCount ?? 0,
        // memory（两个 tag：memory + user）
        memoryChars,
        memoryEntries,
        memoryMaxChars,
        memoryPercent: memoryMaxChars > 0 ? Math.min(memoryChars / memoryMaxChars, 1) : 0,
        userChars,
        userEntries,
        userMaxChars,
        userPercent: userMaxChars > 0 ? Math.min(userChars / userMaxChars, 1) : 0,
      })
    } catch (e) {
      return fail((e as Error).message ?? '面板数据获取失败')
    }
  }

  /** 会话统计（数据面板：平均命中率 + memory 占用） */
  private getStats(payload: { profile: string; sessionId: string }): ApiResponse<unknown> {
    try {
      const session = this.sessionService.findById(payload.sessionId, payload.profile)
      const input = session?.inputTokens ?? 0
      const cacheRead = session?.cacheReadTokens ?? 0
      // 会话平均命中率 = Σ缓存命中 / Σ输入
      const hitRate = input > 0 ? Math.min(cacheRead / input, 1) : 0

      // memory 占用（MemoryStore 文件 + agent_configs 上限）
      let memoryChars = 0
      let memoryEntries = 0
      let memoryMaxChars = 0
      if (this.memoryStore && payload.profile) {
        const entries = this.memoryStore.readAll(MemoryStore.TARGET_USER, payload.profile)
        memoryEntries = entries.length
        memoryChars = entries.reduce((sum, e) => sum + e.length, 0)
      }
      if (this.agentConfigService && payload.profile) {
        try {
          memoryMaxChars = this.agentConfigService.get(payload.profile).memoryMaxChars ?? 0
        } catch {
          memoryMaxChars = 0
        }
      }

      return ok({
        // 当前主对话场景主模型（切换后立即反映——dashboard 模型名）
        model: this.modelConfigService
          ? this.modelConfigService.resolveForScene(payload.profile, 'main_conversation')[0]?.modelName ?? ''
          : '',
        hitRate,
        promptTokens: input,
        // 会话总 token 消耗（输入 + 输出）
        totalTokens: (session?.inputTokens ?? 0) + (session?.outputTokens ?? 0),
        // 会话累计统计
        durationMs: session?.totalDurationMs ?? 0,
        iterations: session?.totalIterations ?? 0,
        llmRequests: session?.totalLlmRequests ?? 0,
        rounds: session?.messageCount ?? 0,
        memoryChars,
        memoryEntries,
        memoryMaxChars,
        memoryPercent: memoryMaxChars > 0 ? Math.min(memoryChars / memoryMaxChars, 1) : 0,
      })
    } catch (e) {
      return fail((e as Error).message ?? '统计获取失败')
    }
  }
}
