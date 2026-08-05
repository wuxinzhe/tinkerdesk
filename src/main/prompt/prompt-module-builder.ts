/**
 * prompt-module-builder.ts — 提示词模块构建管线
 *
 * 复刻 showing-agent PromptModuleBuilder：
 * - 动态模块：按 AgentMode 的 moduleList 顺序渲染（运行时模块每次实时渲染）
 * - 静态模块：从 SQLite 查询用户自定义模块（本地版简化）
 * - 缓存：内存 Map（替代 Redis + PG 两层，本地单用户）
 */
import type {IDynamicPromptModule, PromptContext, PromptModuleEntry} from './types'
import type {PromptManager} from './prompt-manager'
import type {SessionRepository} from '../repository/session-repository'
import {nowDb, nowIso, nowTs, todayDate} from '../utils/time'

/** 静态模块（用户自定义，存 SQLite） */
export interface StaticPromptModule {
  id: string
  content: string
  enabled: boolean
  sortOrder: number
}

/** 静态模块仓库接口（由上层注入，对接 SQLite） */
export interface IStaticPromptModuleRepository {
  findByProfile(profile: string): StaticPromptModule[]
}

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
  ) {}

  /** 构建完整 system prompt（session 部分 + 运行时部分） */
  buildSystemPrompt(ctx: PromptContext): string {
    const sessionId = ctx.sessionId

    // 0) 运行时模块始终重新渲染（os/date 每次更新）
    const runtimePrompt = this.buildRuntimePrompt(ctx)

    // 1) 先查内存缓存
    let sessionPrompt = this.promptCache.get(sessionId)
    if (sessionPrompt === undefined) {
      // 2) 再查 SQLite（持久化层），命中时回填内存缓存
      const session = this.sessionRepository.findById(sessionId)
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
  buildContextMap(ctx: PromptContext): Record<string, unknown> {
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
  private buildSessionPrompt(ctx: PromptContext): string {
    const dynamicPart = this.buildFromModules(ctx, this.getModuleList())
    const staticPart = this.buildStaticModules(ctx)
    if (!staticPart) {
      return dynamicPart
    }
    return dynamicPart ? `${dynamicPart}\n\n${staticPart}` : staticPart
  }

  /** 仅渲染运行时模块（不进入缓存） */
  private buildRuntimePrompt(ctx: PromptContext): string {
    return this.buildFromModules(ctx, PromptModuleBuilder.RUNTIME_MODULE_IDS)
  }

  /** 按模块 ID 列表依次渲染并拼接 */
  private buildFromModules(ctx: PromptContext, moduleIds: string[]): string {
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
  private buildStaticModules(ctx: PromptContext): string {
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

  /** 获取 AgentMode 的模块列表（本地版默认：全部已注册模块） */
  private getModuleList(): string[] {
    return this.promptManager.getModuleIds()
  }
}
