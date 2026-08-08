/**
 * prompt-module-builder.ts — 提示词模块构建管线
 *
 * 复刻 tinker-agent PromptModuleBuilder：
 * - 动态模块：按 AgentMode 的 moduleList 顺序渲染（运行时模块每次实时渲染）
 * - 静态模块：从 SQLite 查询用户自定义模块（本地版简化）
 * - 缓存：内存 Map（替代 Redis + PG 两层，本地单用户）
 */
import type { SessionRepository } from '../../repository/session-repository'
import { todayDate } from '../../utils/time'
import type { PromptManager } from './prompt-manager'
import type { ConversationContext, IStaticPromptModuleRepository } from './types'

export type { IStaticPromptModuleRepository, StaticPromptModule } from './types'

/** 提示词模块构建器 */
export class PromptModuleBuilder {
  /** 运行时模块 ID（不进入缓存，每次实时渲染） */
  private static readonly RUNTIME_MODULE_IDS = ['runtime-environment', 'system-context']

  /** 内存缓存：sessionId → sessionPrompt（替代 Redis） */
  private readonly promptCache = new Map<string, string>()

  constructor(
    private readonly promptManager: PromptManager,
    private readonly sessionRepository: SessionRepository,
    private readonly staticModuleRepo: IStaticPromptModuleRepository
  ) { }

  /** 构建完整 system prompt（入参直接为 ConversationContext，不构造中间对象） */
  buildSystemPrompt(ctx: ConversationContext): string {
    const sessionId = ctx.sessionId

    // 0) 运行时模块：同一天内缓存（os 固定、date 当天一致）——整串缓存保 LLM prompt 缓存热；
    //    跨天自动重建（date 更新）。避免每个 chunk 轮次都重渲染导致上游 prompt 缓存失效。
    const runtimePrompt = this.getRuntimePromptCached(ctx)

    // 0.5) delegate 子代理：ephemeral 覆盖优先（不走 DB 缓存）
    if (ctx.ephemeralSystemPrompt) {
      return `${ctx.ephemeralSystemPrompt}\n\n${runtimePrompt}`
    }

    // 1) 先查内存缓存
    let sessionPrompt = this.promptCache.get(sessionId)
    if (sessionPrompt === undefined) {
      // 2) 再查 SQLite（持久化层），命中时回填内存缓存
      const session = this.sessionRepository.findById(sessionId, ctx.profile)
      sessionPrompt = session?.systemPrompt ?? ''

      if (!sessionPrompt) {
        // 3) 都没有 → 构建（不含运行时模块）并持久化
        sessionPrompt = this.buildSessionPrompt(ctx)
        this.sessionRepository.updateSystemPrompt(sessionId, sessionPrompt, ctx.profile)
      }
      this.promptCache.set(sessionId, sessionPrompt)
    }

    return sessionPrompt ? `${sessionPrompt}\n\n${runtimePrompt}` : runtimePrompt
  }

  /** 重置指定会话的 system prompt 缓存（内存 + SQLite 两层清除） */
  invalidateSessionCache(sessionId: string, profile: string): void {
    this.promptCache.delete(sessionId)
    this.sessionRepository.updateSystemPrompt(sessionId, '', profile)
  }

  /** 重置 profile 下所有已缓存的会话 */
  invalidateProfileCache(profile: string): void {
    const ids = this.sessionRepository.findSessionIdsWithCache(profile)
    for (const sessionId of ids) {
      this.promptCache.delete(sessionId)
      this.sessionRepository.updateSystemPrompt(sessionId, '', profile)
    }
  }

  /** 构建 Handlebars 上下文变量映射 */
  buildContextMap(ctx: ConversationContext): Record<string, unknown> {
    const map: Record<string, unknown> = {
      profile: ctx.profile,
      sessionId: ctx.sessionId,
      date: todayDate(),
    }
    const env = ctx.clientEnv
    if (env) {
      map.os = env.os
      map.arch = env.arch
      map.clientType = env.clientType
      map.shell = env.shell
      map.homeDir = env.homeDir
      map.pathFormat = env.pathFormat
    }
    return map
  }

  // ── 私有方法 ─────────────────────────────────────────────────────

  /** 构建会话提示词（动态模块 + 静态模块） */
  private buildSessionPrompt(ctx: ConversationContext): string {
    const dynamicPart = this.buildFromModules(ctx, this.getModuleList(ctx))
    const staticPart = this.buildStaticModules(ctx)
    if (!staticPart) {
      return dynamicPart
    }
    return dynamicPart ? `${dynamicPart}\n\n${staticPart}` : staticPart
  }

  /** 仅渲染运行时模块（不进入缓存） */
  private buildRuntimePrompt(ctx: ConversationContext): string {
    return this.buildFromModules(ctx, PromptModuleBuilder.RUNTIME_MODULE_IDS)
  }

  /** 运行时模块缓存（按日期：同一天复用——os 固定/date 当天一致；跨天重建更新日期） */
  private runtimeCache = new Map<string, string>()

  private getRuntimePromptCached(ctx: ConversationContext): string {
    const today = todayDate()
    let p = this.runtimeCache.get(today)
    if (p === undefined) {
      p = this.buildRuntimePrompt(ctx)
      // 只保留最近 2 天（避免长期运行日期键无限增长）
      if (this.runtimeCache.size >= 2) {
        const oldest = this.runtimeCache.keys().next().value
        if (oldest !== undefined) this.runtimeCache.delete(oldest)
      }
      this.runtimeCache.set(today, p)
    }
    return p
  }

  /** 按模块 ID 列表依次渲染并拼接 */
  private buildFromModules(ctx: ConversationContext, moduleIds: string[]): string {
    const parts: string[] = []
    for (const entry of this.promptManager.getModulesByOrder(moduleIds)) {
      if (!entry.module.shouldLoad(ctx)) {
        continue
      }
      try {
        const rendered = entry.module.loadPrompt(ctx)
        if (rendered && rendered.trim() !== '') {
          parts.push(rendered)
        }
      } catch (e) {
        console.warn(`模块 ${entry.id} 渲染异常: ${(e as Error).message}`)
      }
    }
    return parts.join('\n\n').trim()
  }

  /** 渲染用户自定义静态模块（本地版：从注入的仓库查，无 Handlebars 内联编译） */
  private buildStaticModules(ctx: ConversationContext): string {
    const parts: string[] = []
    const modules = this.staticModuleRepo.findByProfile(ctx.profile)
    for (const m of modules) {
      if (!m.enabled || !m.content || m.content.trim() === '') {
        continue
      }
      // 本地版：静态模块内容直接拼接（无 Handlebars 模板变量，如需支持可后续接入）
      parts.push(m.content.trim())
    }
    return parts.join('\n\n').trim()
  }

  /**
   * 获取模块列表：优先 AgentMode.getModuleList()（模式决定渲染顺序），
   * 兜底全部已注册模块。
   */
  private getModuleList(ctx: ConversationContext): string[] {
    const modeList = ctx.agentMode?.getModuleList()
    return modeList && modeList.length > 0 ? modeList : this.promptManager.getModuleIds()
  }
}
