/**
 * user-profile-module.ts — 用户画像模块
 *
 * UserProfileModule:
 * When the memory tool is available, reads user-profile entries
 * (target='user') from MemoryStore and concatenates them as a prompt block.
 * Entry separator (\n§\n).
 */
import type {ConversationContext} from '../../core/prompt/types'
import {HandlebarsPresetModule} from './preset-module'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {TOOL_MEMORY} from '../../core/constants'
import type {MemoryStore} from '../../service/memory-store'

/** 用户画像模块 */
export class UserProfileModule extends HandlebarsPresetModule {
  readonly id = 'user-profile'

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
