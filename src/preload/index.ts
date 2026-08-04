import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // ── Window Controls ──
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Tools
  detectTools: () => ipcRenderer.invoke('detect-tools'),
  executeTool: (id: string, params: any) => ipcRenderer.invoke(`tool:${id}`, params),

  // Tool 链路日志（主进程转发，CDP 控制台可见）
  onToolLog: (callback: (line: string) => void) => {
    const handler = (_event: any, line: string) => callback(line)
    ipcRenderer.on('tool:log', handler)
    return () => ipcRenderer.removeListener('tool:log', handler)
  },

  // Tool Center
  toolCenter: {
    initialize: () => ipcRenderer.invoke('tool-center:initialize'),
    recheckMcp: () => ipcRenderer.invoke('tool-center:recheck-mcp'),
    getState: () => ipcRenderer.invoke('tool-center:get-state'),
    getMcpConfigs: () => ipcRenderer.invoke('tool-center:get-mcp-configs'),
    upsertMcpServer: (config: any) => ipcRenderer.invoke('tool-center:upsert-mcp-server', config),
    removeMcpServer: (name: string) => ipcRenderer.invoke('tool-center:remove-mcp-server', name),
    executeMcpTool: (toolName: string, args: Record<string, unknown>) => ipcRenderer.invoke('tool-center:execute-mcp-tool', toolName, args),
    collectEnv: () => ipcRenderer.invoke('tool-center:collect-env'),
  },

  // Auto-update
  checkForUpdates: (manual = false) => ipcRenderer.invoke('update:check', manual),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Update event listeners
  onUpdateStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  onUpdateProgress: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('update:progress', handler)
    return () => ipcRenderer.removeListener('update:progress', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
