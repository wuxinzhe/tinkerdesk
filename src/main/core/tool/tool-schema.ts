/**
 * tool-schema.ts — Tool schema class
 *
 * ToolSchema: the tool object in OpenAI function calling.
 */
import type { ToolFunction, ToolType } from './types'

/** 工具 Schema 定义 */
export class ToolSchema {
  /** 工具类型，固定为 "function" */
  readonly type = 'function'
  /** 工具函数定义（名称、描述、参数） */
  readonly function: ToolFunction
  /** 工具类型分类：builtin = 内建；mcp = MCP 统一执行器；client = 客户端工具 */
  toolType: ToolType = 'builtin'
  /** 展示用 emoji 图标，默认 ⚡ */
  emoji = '⚡'
  /** 是否支持 provider 模式（扩展可接入 + 工具管理页显示设置按钮）——默认 false */
  supportsProvider = false

  constructor(name: string, description: string, parameters: Record<string, unknown> | null) {
    this.function = { name, description, parameters }
  }

  /** 工具名称（序列化时作为顶层字段） */
  get name(): string {
    return this.function.name
  }

  /** 工具描述（序列化时作为顶层字段） */
  get description(): string {
    return this.function.description
  }

  /** 参数 Schema（序列化时作为顶层字段） */
  get parameters(): Record<string, unknown> | null {
    return this.function.parameters
  }

  setEmoji(emoji: string | null | undefined): void {
    if (emoji && emoji.trim() !== '') {
      this.emoji = emoji
    }
  }

  /** 序列化为 OpenAI function calling 格式（传给 LLM） */
  toFunctionCallingFormat(): Record<string, unknown> {
    return {
      type: 'function',
      function: {
        name: this.function.name,
        description: this.function.description,
        parameters: this.function.parameters ?? {},
      },
    }
  }

  /** 从 JSON 对象创建 ToolSchema（客户端注册格式） */
  static fromJson(json: Record<string, unknown>): ToolSchema {
    const name = String(json.name ?? '')
    const description = String(json.description ?? '')
    const parameters = (json.parameters as Record<string, unknown> | null) ?? null
    const schema = new ToolSchema(name, description, parameters)
    if (json.emoji !== undefined) {
      schema.setEmoji(String(json.emoji))
    }
    // 工具类型分类（模板里已有 toolType 字段，如 "server"）
    if (json.toolType !== undefined) {
      schema.toolType = json.toolType as ToolType
    }
    // 支持 provider 模式（模板里可选声明）
    if (json.supportsProvider !== undefined) {
      schema.supportsProvider = json.supportsProvider === true || json.supportsProvider === 'true'
    }
    return schema
  }
}
