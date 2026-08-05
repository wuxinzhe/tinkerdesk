/**
 * base-tool.ts — 工具抽象基类
 *
 * 复刻 showing-agent BaseTool：
 * 构造时从 tool-schemas/{name}.hbs 模板加载并缓存 ToolSchema，
 * 子类无需重复实现 getSchema()。
 */
import {readFileSync} from 'fs'
import {join} from 'path'
import type {PromptRenderer} from '../prompt/renderer'
import type {IAgentTool, ToolExecutionContext} from './types'
import {ToolResult} from './tool-result'
import {ToolSchema} from './tool-schema'

/** 工具 Schema 模板目录 */
const SCHEMA_DIR = join(__dirname, '..', '..', 'resources', 'tool-schemas')

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

  abstract execute(ctx: ToolExecutionContext): Promise<ToolResult>

  /** 从 .hbs 模板加载 ToolSchema */
  private loadSchema(toolName: string): ToolSchema {
    try {
      const file = join(SCHEMA_DIR, `${toolName}.hbs`)
      const source = readFileSync(file, 'utf-8')
      const json = JSON.parse(source)
      return ToolSchema.fromJson(json)
    } catch (e) {
      throw new Error(`工具 Schema 模板加载失败: ${toolName} — ${(e as Error).message}`)
    }
  }
}
