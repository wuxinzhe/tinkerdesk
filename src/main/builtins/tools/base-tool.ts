/**
 * base-tool.ts — 工具抽象基类
 *
 * BaseTool:
 * loads and caches the ToolSchema from the tool-schemas/{name}.hbs template
 * at construction; subclasses don't reimplement getSchema().
 */
import { readFileSync } from 'fs'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import { resolveResource } from '../../utils/resources-path'
import { ToolResult } from '../../core/tool/tool-result'
import { ToolSchema } from '../../core/tool/tool-schema'
import type { IAgentTool } from '../../core/tool/types'

/** 工具抽象基类 */
export abstract class BaseTool implements IAgentTool {
  protected readonly schema: ToolSchema
  protected readonly renderer: PromptRenderer

  constructor(renderer: PromptRenderer, toolName: string) {
    this.renderer = renderer
    this.schema = this.loadSchema(toolName)
  }

  getSchema(): ToolSchema {
    return this.schema
  }

  abstract execute(ctx: ToolContext): Promise<ToolResult>

  /** 从 .hbs 模板加载 ToolSchema */
  private loadSchema(toolName: string): ToolSchema {
    try {
      const file = resolveResource('tool-schemas', `${toolName}.hbs`)
      const source = readFileSync(file, 'utf-8')
      const json = JSON.parse(source)
      return ToolSchema.fromJson(json)
    } catch (e) {
      throw new Error(`工具 Schema 模板加载失败: ${toolName} — ${(e as Error).message}`, { cause: e })
    }
  }
}
