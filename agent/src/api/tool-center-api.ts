/**
 * tool-center-api.ts — 数据层
 * 主进程 ToolCenter 的 IPC 桥接封装
 */
import type { ToolCenterState, McpServerConfig } from '@/defines/api/tool-center-types'
import type { ClientEnvInfo } from '@/defines/api/client-env-types'

class DesktopToolCenterApi {
  private get api() { return (window as any).api?.toolCenter }

  async initialize(): Promise<ToolCenterState> {
    return this.api?.initialize() ?? { builtin: [], mcpServers: [], allAvailable: [], updatedAt: '' }
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

  async upsertMcpServer(config: McpServerConfig): Promise<ToolCenterState> {
    return this.api?.upsertMcpServer(config) ?? this.emptyState()
  }

  async removeMcpServer(name: string): Promise<ToolCenterState> {
    return this.api?.removeMcpServer(name) ?? this.emptyState()
  }

  private emptyState(): ToolCenterState {
    return { builtin: [], mcpServers: [], allAvailable: [], updatedAt: '' }
  }
}

class WebToolCenterApi {
  async initialize(): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], allAvailable: [], updatedAt: new Date().toISOString() }
  }
  async getState(): Promise<ToolCenterState> { return { builtin: [], mcpServers: [], allAvailable: [], updatedAt: '' } }
  async collectEnv(): Promise<ClientEnvInfo> {
    return { os: '', clientType: '', shell: '', homeDir: '', pathFormat: '' }
  }
  async getMcpConfigs(): Promise<McpServerConfig[]> { return [] }
  async upsertMcpServer(_config: McpServerConfig): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], allAvailable: [], updatedAt: '' }
  }
  async removeMcpServer(_name: string): Promise<ToolCenterState> {
    return { builtin: [], mcpServers: [], allAvailable: [], updatedAt: '' }
  }
}

export function getToolCenterApi(): DesktopToolCenterApi | WebToolCenterApi {
  if ((window as any).api?.toolCenter) {
    return new DesktopToolCenterApi()
  }
  return new WebToolCenterApi()
}
