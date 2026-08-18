/**
 * user-profile-module.ts — 用户画像模块
 *
 * UserProfileModule:
 * When the memory tool is available, reads user-profile entries
 * (target='user') from MemoryStore and concatenates them as a prompt block.
 * Entry separator (\n§\n).
 */
import type {ConversationContext} from '../../core/prompt/types'
import {PromptModuleBase} from './prompt-module-base'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {TOOL_MEMORY} from '../../core/constants'
import type {MemoryStore} from '../../service/memory-store'

/** 用户画像模块 */
export const PROMPT_USER_PROFILE = 'user-profile'

export class UserProfileModule extends PromptModuleBase {
  readonly id = PROMPT_USER_PROFILE

  /** memory 工具默认查询的条目类型：用户画像 */
  private static readonly TARGET_USER = 'user'

  constructor(
    renderer: PromptRenderer,
    private readonly memoryStore: MemoryStore
  ) {
    super(renderer)
  }

  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes(TOOL_MEMORY) ?? false
  }

  override loadPrompt(ctx: ConversationContext): string | null {
    try {
      const entries = this.memoryStore.readAll(UserProfileModule.TARGET_USER, ctx.profile)
      if (entries.length === 0) {
        return null
      }
      return entries.join('\n§\n')
    } catch {
      return null
    }
  }
}
