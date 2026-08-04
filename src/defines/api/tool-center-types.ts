/** ToolCenter API 类型定义 */

export interface CheckedTool {
  id: string; name: string; description: string; category: string
  source: 'builtin'; available: boolean; reason?: string
  schema: any
}

export interface McpServerConfig {
  name: string; transport: 'stdio' | 'http'
  command?: string; args?: string[]; url?: string; enabled: boolean
}

export interface McpDiscoveredTool {
  name: string; description: string; inputSchema: Record<string, unknown>
}

export interface McpServerState extends McpServerConfig {
  connected: boolean; lastCheck: string | null; error?: string
  tools: McpDiscoveredTool[]
}

export interface RegisteredTool {
  id: string; name: string; description: string; category: string
  available: boolean; schema: any
}

export interface ToolCenterState {
  builtin: CheckedTool[]
  mcpServers: McpServerState[]
  allAvailable: RegisteredTool[]
  updatedAt: string
}
