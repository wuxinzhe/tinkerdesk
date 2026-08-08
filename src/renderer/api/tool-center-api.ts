/**
 * tool-center-api.ts — 数据层
 * 主进程 ToolCenter 的 IPC 桥接封装
 */
import type { ToolCenterState, McpServerConfig } from '@/renderer/api/types'
import type { ClientEnvInfo } from './types'
import '@/renderer/api/types'

export type { ToolCenterState, McpServerConfig, McpServerState, McpDiscoveredTool, RegisteredTool, CheckedTool } from '@/renderer/api/types'

class DesktopToolCenterApi {
  private get api() { return window.api?.toolCenter }

  async initialize(): Promise<ToolCenterState> {
    return this.api?.initialize() ?? { builtin: [], mcpServers: [], updatedAt: '' }
  }

  async recheckMcp(): Promise<ToolCenterState> {
    return this.api?.recheckMcp() ?? this.emptyState()
  }

  async collectEnv(): Promise<ClientEnvInfo> {
    return this.api!.collectEnv()
  }

  async getState(): Promise<ToolCenterState> {
    return this.api?.getState() ?? this.emptyState()
  }

  async getMcpConfigs(): Promise<McpServerConfig[]> {
    return this.api?.getMcpConfigs() ?? []
  }

  async upsertMcpServer(config: McpServerConfig): Promise<void> {
    await this.api?.upsertMcpServer(config)
  }

  async removeMcpServer(name: string): Promise<void> {
    await this.api?.removeMcpServer(name)
  }

  private emptyState(): ToolCenterState {
    return { builtin: [], mcpServers: [], updatedAt: '' }
  }
}

class WebToolCenterApi {
  async initialize(): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], updatedAt: new Date().toISOString() }
  }
  async getState(): Promise<ToolCenterState> { return { builtin: [], mcpServers: [], updatedAt: '' } }
  async collectEnv(): Promise<ClientEnvInfo> {
    return { os: '', arch: '', clientType: '', shell: '', homeDir: '', pathFormat: '' }
  }
  async getMcpConfigs(): Promise<McpServerConfig[]> { return [] }
  async upsertMcpServer(_config: McpServerConfig): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], updatedAt: '' }
  }
  async removeMcpServer(_name: string): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], updatedAt: '' }
  }
}

export function getToolCenterApi(): DesktopToolCenterApi | WebToolCenterApi {
  if (window.api?.toolCenter) {
    return new DesktopToolCenterApi()
  }
  return new WebToolCenterApi()
}
