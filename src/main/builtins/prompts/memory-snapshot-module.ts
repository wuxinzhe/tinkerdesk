/**
 * memory-snapshot-module.ts — 记忆快照模块
 *
 * MemorySnapshotModule:
 * When the memory tool is available, reads persisted memory entries and
 * injects them into the context.
 */
import type {ConversationContext} from '../../core/prompt/types'
import {HandlebarsPresetModule} from './preset-module'
import type {PromptRenderer} from '../../core/prompt/renderer'
import {TOOL_MEMORY} from '../../core/constants'

/** 记忆快照模块 */
export class MemorySnapshotModule extends HandlebarsPresetModule {
  readonly id = 'memory-snapshot'

  constructor(
    renderer: PromptRenderer,
    private readonly readAll: (profile: string) => string[]
  ) {
    super(renderer)
  }

  override shouldLoad(ctx: ConversationContext): boolean {
    return ctx.toolNames?.includes(TOOL_MEMORY) ?? false
  }

  override loadPrompt(ctx: ConversationContext): string | null {
    try {
      const entries = this.readAll(ctx.profile)
      if (entries.length === 0) {
        return null
      }
      return entries.join('\n§\n')
    } catch {
      return null
    }
  }
}
