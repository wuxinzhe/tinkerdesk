/**
 * user-profile-module.ts — 用户画像模块
 *
 * 复刻 showing-agent UserProfileModule：
 * 注入用户画像信息（本地单用户版：profile 标识 + 客户端类型）。
 */
import type {PromptContext} from '../types'
import type {PromptRenderer} from '../renderer'

/** 用户画像模块 */
export class UserProfileModule {
  readonly id = 'user-profile'

  constructor(private readonly renderer: PromptRenderer) {}

  shouldLoad(_ctx: PromptContext): boolean {
    return true
  }

  loadPrompt(ctx: PromptContext): string | null {
    const profile = ctx.profile || 'default'
    const ctxMap: Record<string, unknown> = {
      profile,
      clientType: ctx.clientEnv?.clientType ?? '',
    }
    const compiled = this.renderer.compileInline(
      'You are assisting user (profile: {{profile}}, client: {{clientType}}).'
    )
    if (!compiled) {
      return null
    }
    const result = compiled(ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
