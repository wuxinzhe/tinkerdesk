/**
 * tool-center/index.ts — 工具注册中心公共入口
 *
 * 对外暴露 DesktopToolCenter 单例 + IPC handlers。
 * 渲染进程通过 IPC 调用此模块。
 */
import { ipcMain } from 'electron'
import { DesktopToolCenter } from './desktop-center'
import type { McpServerConfig, ToolCenterState } from '@/defines/tools/center-types'
import type { ClientEnvInfo } from '@/defines/api/client-env-types'

let _center: DesktopToolCenter | null = null

export function getToolCenter(): DesktopToolCenter {
  if (!_center) {
    _center = new DesktopToolCenter()
  }
  return _center
}

/** 注册 IPC handlers（在 app.whenReady 中调用） */
export function registerToolCenterHandlers(): void {
  const center = getToolCenter()

  // 初始化数据库 + 检测全部工具
  ipcMain.handle('tool-center:initialize', async (): Promise<ToolCenterState> => {
    await center.initDb()
    return center.initialize()
  })

  // 仅重检 MCP
  ipcMain.handle('tool-center:recheck-mcp', async (): Promise<ToolCenterState> => {
    return center.recheckMcp()
  })

  // 获取当前状态
  ipcMain.handle('tool-center:get-state', async (): Promise<ToolCenterState> => {
    return center.getState()
  })

  // 获取 MCP 服务器配置列表
  ipcMain.handle('tool-center:get-mcp-configs', async (): Promise<McpServerConfig[]> => {
    return center.getMcpServerConfigs()
  })

  // 添加/更新 MCP 服务器
  ipcMain.handle('tool-center:upsert-mcp-server', async (_event, config: McpServerConfig): Promise<ToolCenterState> => {
    return center.upsertMcpServer(config)
  })

  // 删除 MCP 服务器
  ipcMain.handle('tool-center:remove-mcp-server', async (_event, name: string): Promise<ToolCenterState> => {
    return center.removeMcpServer(name)
  })

  // 执行 MCP 工具
  ipcMain.handle('tool-center:execute-mcp-tool', async (_event, toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    return center.executeMcpTool(toolName, args)
  })

  // 收集客户端环境信息
  ipcMain.handle('tool-center:collect-env', async (): Promise<ClientEnvInfo> => {
    const nodeOs = await import('os')
    const platform = process.platform
    const release = nodeOs.release()
    const arch = process.arch

    // 桌面端 terminal 工具根据平台自动选择 shell，因此 shell/路径格式要与实际执行的 shell 一致
    const shell = platform === 'win32' ? 'cmd' : (process.env.SHELL || 'unknown')
    const homeDir = nodeOs.homedir()
    const pathFormat = platform === 'win32' ? 'native' : 'native'

    // 构建带版本的操作系统描述
    let os: string
    if (platform === 'win32') {
      const build = parseInt(release.split('.')[2] || '0')
      if (build >= 22000) os = `Windows 11 (build ${build})`
      else if (build >= 10240) os = `Windows 10 (build ${build})`
      else if (release.startsWith('6.3')) os = 'Windows 8.1'
      else if (release.startsWith('6.2')) os = 'Windows 8'
      else if (release.startsWith('6.1')) os = 'Windows 7'
      else os = `Windows (${release})`
    } else if (platform === 'darwin') {
      let macVer: string | undefined
      try {
        // Electron 主进程专用 API，返回 "14.2.1" 格式
        macVer = (process as any).getSystemVersion?.()
      } catch { /* fallback */ }
      if (macVer) {
        os = `macOS ${macVer}`
      } else {
        // Darwin → macOS 版本映射
        const darwinMajor = parseInt(release.split('.')[0] || '0')
        const darwinMap: Record<number, string> = {
          24: '15 Sequoia', 23: '14 Sonoma', 22: '13 Ventura',
          21: '12 Monterey', 20: '11 Big Sur', 19: '10.15 Catalina',
          18: '10.14 Mojave', 17: '10.13 High Sierra', 16: '10.12 Sierra',
          15: '10.11 El Capitan', 14: '10.10 Yosemite', 13: '10.9 Mavericks',
          12: '10.8 Mountain Lion', 11: '10.7 Lion', 10: '10.6 Snow Leopard',
        }
        os = darwinMap[darwinMajor]
          ? `macOS ${darwinMap[darwinMajor]}`
          : `macOS (Darwin ${release})`
      }
    } else if (platform === 'linux') {
      try {
        const fs = await import('fs')
        const paths = [
          '/etc/os-release', '/usr/lib/os-release',
          '/etc/lsb-release', '/etc/redhat-release', '/etc/debian_version',
        ]
        for (const p of paths) {
          if (!fs.existsSync(p)) continue
          const content = fs.readFileSync(p, 'utf-8')
          // os-release 或 lsb-release → PRETTY_NAME / DISTRIB_DESCRIPTION
          const m = content.match(/^PRETTY_NAME="?(.+?)"?$/m)
          if (m) { os = m[1]; break }
          const m2 = content.match(/^DISTRIB_DESCRIPTION="?(.+?)"?$/m)
          if (m2) { os = m2[1]; break }
          // redhat-release → 第一行即版本名
          // debian_version → 文件内容仅为版本号 "10.13"
          const firstLine = content.split('\n')[0].trim()
          if (firstLine) {
            os = p.endsWith('debian_version') ? `Debian ${firstLine}` : firstLine
            break
          }
        }
      } catch { /* fallback */ }
      if (!os) os = `Linux (kernel ${release})`
    } else {
      os = platform
    }

    // 架构后缀（Intel Mac vs Apple Silicon 等）
    if (arch === 'arm64') os += ', ARM'
    else if (arch === 'x64') os += ', x64'

    return {
      os,
      arch,
      clientType: 'desktop-app',
      shell,
      homeDir,
      pathFormat,
    }
  })
}
