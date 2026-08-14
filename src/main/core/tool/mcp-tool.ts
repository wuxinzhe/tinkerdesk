/**
 * tool/mcp-tool.ts — MCP tool (IAgentTool-isomorphic implementation)
 *
 * MCP tools are isomorphic with built-in tools: registered into the unified
 * ToolManager registry, satisfying the IAgentTool interface (getSchema / execute / check).
 * execute forwards internally to the unified MCP executor (mcpManager),
 * routing tool requests per server.
 */
import type { McpManager } from './mcp-manager'
import type { ToolContext } from '../loop/types'
import type { IAgentTool } from './types'
import { TOOL_TYPE_MCP } from './types'
import { ToolResult } from './tool-result'
import { ToolSchema } from './tool-schema'

/** MCP 工具实例（一个 MCP 工具 = 一个注册项） */
export class McpTool implements IAgentTool {
  /** 工具名：mcp_{serverName}_{toolName}（唯一性命名，路由依据是 toolType 非前缀） */
  readonly name: string
  /** 所属 MCP 服务器名 */
  readonly serverName: string
  /** MCP 服务器内工具名 */
  readonly toolName: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>

  constructor(
    serverName: string,
    toolName: string,
    description: string,
    inputSchema: Record<string, unknown>,
    private readonly manager: McpManager
  ) {
    this.serverName = serverName
    this.toolName = toolName
    this.description = description
    this.inputSchema = inputSchema
    this.name = `mcp_${serverName}_${toolName}`
  }

  /** 工具 Schema（toolType = mcp，ToolManager 据此路由） */
  getSchema(): ToolSchema {
    const parameters = this.inputSchema?.properties
      ? { type: 'object', ...this.inputSchema }
      : { type: 'object', properties: {}, required: [] }
    const schema = new ToolSchema(this.name, this.description, parameters)
    schema.toolType = TOOL_TYPE_MCP
    return schema
  }

  /** 执行：转发给 MCP 统一执行器（按服务器路由工具请求） */
  async execute(ctx: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.manager.executeTool(this.toolName, ctx.toolCall.arguments)
      const text = (result.content ?? []).map((c) => c.text ?? '').join('\n')
      return ToolResult.sync(text || '（MCP 工具无返回内容）')
    } catch (e) {
      return ToolResult.sync(`错误：MCP 工具执行失败 ${this.name}: ${(e as Error).message}`)
    }
  }

  /** 可用性检测：服务器是否已连接（连接后由注册中心生成实例，恒可用） */
  check(): boolean {
    return true
  }
}
