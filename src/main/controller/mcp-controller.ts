/**
 * mcp-controller.ts — MCP 服务器管理 IPC controller（class 形式）
 *
 * 复刻 tinker-agent 工具中心的管理接口（本地版）：
 * MCP 服务器配置 CRUD + 状态查询 + 环境信息。
 * 分层：controller → service（McpToolCenter，core 模块即 service 层）。
 * IPC 前缀：tool-center:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */

import { handleTrusted } from '../security/ipc-guard'
import * as nodeOs from 'os'
import * as nodeFs from 'fs'
import type { McpToolCenter } from '../core/tool/mcp-tool-center'
import type { McpServerConfig, ToolCenterState } from '../core/tool/types'
import type { ClientEnvInfo } from '../core/tool/types'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { McpServerConfigDTO } from './types'

/** MCP 控制器 */
export class McpController {
  constructor(private readonly mcpCenter: McpToolCenter) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('tool-center:initialize', () => this.initializeToolCenter())
    handleTrusted('tool-center:recheck-mcp', () => this.recheckMcp())
    handleTrusted('tool-center:get-state', () => this.getToolCenterState())
    handleTrusted('tool-center:get-mcp-configs', () => this.listMcpConfigs())
    handleTrusted('tool-center:upsert-mcp-server', (_event, config) => this.upsertMcpServer(config))
    handleTrusted('tool-center:remove-mcp-server', (_event, name) => this.removeMcpServer(name))
    handleTrusted('tool-center:collect-env', () => this.collectClientEnv())
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 初始化工具中心：连接 MCP 服务器 + 发现工具（首次发现后持久化） */
  private async initializeToolCenter(): Promise<ApiResponse<ToolCenterState>> {
    try {
      await this.mcpCenter.initDb()
      return ok(await this.mcpCenter.initialize())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 仅重连 MCP 服务器 */
  private async recheckMcp(): Promise<ApiResponse<ToolCenterState>> {
    try {
      return ok(await this.mcpCenter.recheckMcp())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询工具中心当前状态 */
  private getToolCenterState(): ApiResponse<ToolCenterState> {
    return ok(this.mcpCenter.getState())
  }

  /** 查询 MCP 服务器配置列表 */
  private listMcpConfigs(): ApiResponse<McpServerConfig[]> {
    return ok(this.mcpCenter.getMcpServerConfigs())
  }

  /** 添加/更新 MCP 服务器 */
  private async upsertMcpServer(config: McpServerConfigDTO): Promise<ApiResponse<ToolCenterState>> {
    try {
      return ok(await this.mcpCenter.upsertMcpServer(config))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 删除 MCP 服务器 */
  private async removeMcpServer(name: string): Promise<ApiResponse<ToolCenterState>> {
    try {
      return ok(await this.mcpCenter.removeMcpServer(name))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 收集客户端环境信息（OS 版本 / 架构 / shell / 家目录） */
  private collectClientEnv(): ApiResponse<ClientEnvInfo> {
    const platform = process.platform
    const release = nodeOs.release()
    const arch = process.arch

    const shell = platform === 'win32' ? 'cmd' : (process.env.SHELL || 'unknown')
    const homeDir = nodeOs.homedir()
    const pathFormat = 'native'

    let os: string = platform
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
        macVer = (process as unknown as { getSystemVersion?: () => string }).getSystemVersion?.()
      } catch { /* fallback */ }
      if (macVer) {
        os = `macOS ${macVer}`
      } else {
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
        const paths = [
          '/etc/os-release', '/usr/lib/os-release',
          '/etc/lsb-release', '/etc/redhat-release', '/etc/debian_version',
        ]
        for (const p of paths) {
          if (!nodeFs.existsSync(p)) continue
          const content = nodeFs.readFileSync(p, 'utf-8')
          const m = content.match(/^PRETTY_NAME="?(.+?)"?$/m)
          if (m) { os = m[1]; break }
          const m2 = content.match(/^DISTRIB_DESCRIPTION="?(.+?)"?$/m)
          if (m2) { os = m2[1]; break }
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

    if (arch === 'arm64') os += ', ARM'
    else if (arch === 'x64') os += ', x64'

    return ok({
      os,
      arch,
      clientType: 'desktop-app',
      shell,
      homeDir,
      pathFormat,
    })
  }
}
