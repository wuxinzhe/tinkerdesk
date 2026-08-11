/**
 * computer-use/cua-driver-client.ts — cua-driver MCP 客户端（基于 tinkerdesk StdioTransport）
 *
 * cua-driver 是外部独立程序（trycua 项目——Rust 实现，Windows/macOS/Linux）：
 *   cua-driver mcp   ← stdio 传输的 MCP 服务
 * 安装（Windows PowerShell）：
 *   irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex
 *
 * 本客户端是 StdioTransport 之上的薄封装：路径解析 + start_session 会话态 + 工具名缓存。
 * computer_use 工具持有它（按会话隔离——对齐 hermes per-session backend）。
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { StdioTransport } from '../../core/tool/mcp-stdio-transport'
import type { McpCallResult } from '../../core/tool/types'

/** cua-driver 不可用 */
export class CuaDriverUnavailableError extends Error {
  constructor(hint: string) {
    super(`cua-driver 不可用: ${hint}`)
    this.name = 'CuaDriverUnavailableError'
  }
}

/** 解析 cua-driver 可执行文件：PATH → 用户本地安装位置（Windows 官方安装目录） */
export function resolveCuaDriverCmd(): string | null {
  // 1. PATH
  const pathCmd = process.env.PATH?.split(';').map((p) => `${p}\\cua-driver.exe`).find((p) => existsSync(p))
  if (pathCmd) return pathCmd
  // 2. 常见安装位置
  const home = process.env.USERPROFILE ?? ''
  const localAppData = process.env.LOCALAPPDATA ?? `${home}\\AppData\\Local`
  const candidates = [
    `${home}\\.local\\bin\\cua-driver.exe`,
    `${localAppData}\\Programs\\Cua\\cua-driver\\bin\\cua-driver.exe`,
    `${localAppData}\\Programs\\cua-driver\\bin\\cua-driver.exe`,
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/** cua-driver MCP 客户端（StdioTransport 薄封装——每实例一个子进程 + 会话） */
export class CuaDriverClient {
  private transport: StdioTransport | null = null
  private sessionId: string | null = null
  private toolNames = new Set<string>()

  /** 检查 cua-driver 是否可用（PATH + 官方安装位置） */
  static async isAvailable(): Promise<boolean> {
    return resolveCuaDriverCmd() !== null
  }

  /** 启动 cua-driver mcp 子进程 + 握手（initialize + tools/list） */
  async start(): Promise<void> {
    if (this.transport?.connected) return
    const cmd = resolveCuaDriverCmd()
    if (!cmd) {
      throw new CuaDriverUnavailableError('未找到 cua-driver——请安装（PowerShell: irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex）')
    }
    const transport = new StdioTransport()
    await transport.connect({ name: 'cua-driver', transport: 'stdio', command: cmd, args: ['mcp'], enabled: true })
    this.transport = transport
    const tools = await transport.listTools()
    for (const t of tools) {
      this.toolNames.add(t.name)
    }
  }

  /** 开启 cua-driver 会话（start_session——后续 call_tool 自动带 session） */
  async startSession(): Promise<string> {
    const sid = `tinker-${randomUUID().slice(0, 8)}`
    await this.callRaw('start_session', { session: sid })
    this.sessionId = sid
    return sid
  }

  /** 结束会话 */
  async endSession(): Promise<void> {
    if (this.sessionId) {
      try {
        await this.callRaw('end_session', { session: this.sessionId })
      } catch {
        // 会话可能已结束——忽略
      }
      this.sessionId = null
    }
  }

  /** 调用 cua-driver 工具（自动合并 session 参数）——返回 MCP 结果 */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const merged: Record<string, unknown> = { ...args }
    if (this.sessionId && name !== 'start_session' && name !== 'end_session') {
      merged.session = this.sessionId
    }
    return this.callRaw(name, merged)
  }

  /** 原始 tools/call（isError 时抛错） */
  private async callRaw(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    if (!this.transport) throw new CuaDriverUnavailableError('cua-driver 未启动')
    const res = await this.transport.callTool(name, args)
    if (res.isError) {
      const text = this.extractText(res)
      throw new Error(`cua-driver ${name} 失败: ${text || '未知错误'}`)
    }
    return res
  }

  /** 从 MCP 结果提取文本（content 数组拼接） */
  extractText(res: McpCallResult): string {
    const parts: string[] = []
    for (const c of res.content ?? []) {
      if (c.type === 'text' && c.text) parts.push(c.text)
    }
    return parts.join('\n')
  }

  /** 工具能力判断 */
  hasTool(name: string): boolean {
    return this.toolNames.has(name)
  }

  /** 关闭子进程 */
  stop(): void {
    this.sessionId = null
    if (this.transport) {
      try {
        this.transport.close()
      } catch {
        // 已关闭
      }
      this.transport = null
    }
  }
}
