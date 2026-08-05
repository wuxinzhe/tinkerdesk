/**
 * system-context-module.ts — 系统上下文模块
 *
 * 复刻 showing-agent SystemContextModule：
 * 渲染 context.hbs（Session ID / 日期 / 模型名）。
 */
import type {PromptContext} from '../types'
import type {PromptRenderer} from '../renderer'
import {HandlebarsPresetModule} from './preset-module'

/** 系统上下文模块 */
export class SystemContextModule extends HandlebarsPresetModule {
  readonly id = 'system-context'
  constructor(renderer: PromptRenderer) {
    super(renderer)
  }

  override loadPrompt(ctx: PromptContext): string | null {
    const ctxMap: Record<string, unknown> = {
      sessionId: ctx.sessionId,
      date: new Date().toISOString().slice(0, 10),
    }
    const modelName = ctx.modelName
    if (modelName && String(modelName).trim() !== '') {
      ctxMap.modelName = modelName
    }
    const result = this.renderer.render('context', ctxMap)
    return result && result.trim() !== '' ? result : null
  }
}
