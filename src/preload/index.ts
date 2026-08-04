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
  },

  // ── Agent 会话（本地 AgentLoop controller）──
  agent: {
    // 发送消息（onUserMessage），流式 token 通过 onToken 回调
    chat: (req: any, onToken?: (evt: any) => void) => {
      if (onToken) {
        const handler = (_event: any, evt: any) => onToken(evt)
        ipcRenderer.on('agent:token', handler)
        return ipcRenderer.invoke('agent:chat', req).finally(() => {
          ipcRenderer.removeListener('agent:token', handler)
        })
      }
      return ipcRenderer.invoke('agent:chat', req)
    },
    // 工具结果回调（UI/扩展工具异步返回）
    toolResult: (sessionId: string, toolCallId: string, result: string) =>
      ipcRenderer.invoke('agent:toolResult', {sessionId, toolCallId, result}),
    // 审批响应（用户同意/拒绝）
    approval: (sessionId: string, toolCallId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:approval', {sessionId, toolCallId, approved}),
    // 撤回消息
    revoke: (sessionId: string, messageId: string) =>
      ipcRenderer.invoke('agent:revoke', {sessionId, messageId}),
    // 中断对话（stop）
    interrupt: (sessionId: string) => ipcRenderer.invoke('agent:interrupt', sessionId),
    // 清理会话
    clearAll: (sessionId: string) => ipcRenderer.invoke('agent:clearAll', sessionId),
    // 监听审批请求（渲染层弹审批卡片）
    onApprovalRequest: (callback: (payload: any) => void) => {
      const handler = (_event: any, payload: any) => callback(payload)
      ipcRenderer.on('agent:approvalRequest', handler)
      return () => ipcRenderer.removeListener('agent:approvalRequest', handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
