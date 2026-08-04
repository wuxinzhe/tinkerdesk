/**
 * tool-registry.ts — 统一工具注册中心（服务层）
 *
 * 合并 renderer/tools/registry.ts 和 main/tools/manifest.ts 的功能。
 * 运行在 renderer 进程，管理三类工具：
 *
 *   1. UI 工具 — 直接管理 BaseTool 实例（clarify 等）
 *   2. 扩展桥接器 — ExternalToolBridge 实例（Chrome Extension 等）
 *   3. 桌面工具 — 通过 IPC 接收主进程的元数据，执行时委托 IPC
 *
 * 对外提供统一的 getAllSchemas() / getAllDefinitions() / execute() 接口。
 */
import { BaseTool } from '@/defines/tools/base-tool'
import type { ToolSchema, ToolDefinition } from '@/defines/tools/base-tool'
import type { ExternalToolBridge } from '@/tools/ui/bridge'
import type { DesktopToolMeta } from '@/defines/tools/registry-types'

export class ToolRegistry {
  private uiTools: BaseTool[] = []
  private bridges: ExternalToolBridge[] = []
  private desktopTools: DesktopToolMeta[] = []
  private changeCallback: ((schemas: ToolSchema[]) => void) | null = null

  // ── 内置共享工具注册 ──

  /** @deprecated 改用 registerSharedTool */
  registerUiTool(tool: BaseTool): void {
    this.registerSharedTool(tool)
  }

  /**
   * 注册双端通用内置工具（如 read_tool_result）。
   * 工具代码不依赖 Electron IPC，web 和 desktop 共享。
   */
  registerSharedTool(tool: BaseTool): void {
    this.uiTools.push(tool)
    this.notifyChanged()
  }

  // ── 扩展桥接器注册 ──

  registerBridge(bridge: ExternalToolBridge): void {
    this.bridges = this.bridges.filter(b => b.name !== bridge.name)
    this.bridges.push(bridge)
    this.notifyChanged()
  }

  unregisterBridge(name: string): void {
    this.bridges = this.bridges.filter(b => b.name !== name)
    this.notifyChanged()
  }

  // ── 桌面工具元数据 ──

  /** 从主进程接收桌面工具元数据（替换旧列表） */
  setDesktopTools(tools: DesktopToolMeta[]): void {
    this.desktopTools = tools
    this.notifyChanged()
  }

  // ── 变更回调 ──

  /** 注册 schema 变更回调 */
  onSchemasChanged(cb: (schemas: ToolSchema[]) => void): void {
    this.changeCallback = cb
  }

  private notifyChanged(): void {
    if (this.changeCallback) {
      this.changeCallback(this.getAllSchemas())
    }
  }

  // ── 查询 ──

  /** 获取所有工具 schema（用于路由匹配） */
  getAllSchemas(): ToolSchema[] {
    const result: ToolSchema[] = []

    // UI 工具
    for (let i = 0; i < this.uiTools.length; i++) {
      result.push(this.uiTools[i].getSchema())
    }

    // 扩展桥接器
    for (let i = 0; i < this.bridges.length; i++) {
      result.push(...this.bridgeToToolSchemas(this.bridges[i]))
    }

    // 桌面工具
    for (let i = 0; i < this.desktopTools.length; i++) {
      result.push(this.desktopTools[i].schema)
    }

    return result
  }

  /** 获取所有工具定义（含可用性检测） */
  getAvailableDefinitions(): ToolDefinition[] {
    const result: ToolDefinition[] = []

    for (let i = 0; i < this.uiTools.length; i++) {
      const tool = this.uiTools[i]
      const avail = tool.checkAvailability()
      const isAvailable = avail instanceof Promise ? true : avail.available
      if (isAvailable) {
        result.push(tool.getDefinition())
      }
    }

    for (let i = 0; i < this.bridges.length; i++) {
      result.push(...this.bridgeToDefinitions(this.bridges[i]))
    }

    for (let i = 0; i < this.desktopTools.length; i++) {
      result.push(this.metaToDefinition(this.desktopTools[i]))
    }

    return result
  }

  /** 获取完整定义列表（不含可用性过滤） */
  getAllDefinitions(): ToolDefinition[] {
    const result: ToolDefinition[] = []

    for (let i = 0; i < this.uiTools.length; i++) {
      result.push(this.uiTools[i].getDefinition())
    }
    for (let i = 0; i < this.bridges.length; i++) {
      result.push(...this.bridgeToDefinitions(this.bridges[i]))
    }
    for (let i = 0; i < this.desktopTools.length; i++) {
      result.push(this.metaToDefinition(this.desktopTools[i]))
    }

    return result
  }

  /** 检查工具是否存在（任意来源） */
  hasHandler(name: string): boolean {
    for (let i = 0; i < this.uiTools.length; i++) {
      if (this.uiTools[i].id === name) return true
    }
    for (let i = 0; i < this.desktopTools.length; i++) {
      if (this.desktopTools[i].id === name) return true
    }
    for (let i = 0; i < this.bridges.length; i++) {
      const schemas = this.bridges[i].getSchemas()
      for (let j = 0; j < schemas.length; j++) {
        if (schemas[j].name === name) return true
      }
    }
    return false
  }

  /** 获取指定名称的 UI 工具实例 */
  getUiTool(name: string): BaseTool | undefined {
    for (let i = 0; i < this.uiTools.length; i++) {
      if (this.uiTools[i].id === name) return this.uiTools[i]
    }
    return undefined
  }

  // ── 执行 ──

  /**
   * 执行工具。
   * UI 工具 → 直接执行
   * 扩展桥接器 → 委托执行
   * 桌面工具 → 返回 false（由调用方走 IPC）
   *
   * @returns true 表示已处理，false 表示无匹配 handler
   */
  execute(
    name: string,
    toolCallId: string,
    args: Record<string, unknown>,
    sendToolResult: (toolCallId: string, result: string) => void
  ): boolean {
    // 1) UI 工具
    for (let i = 0; i < this.uiTools.length; i++) {
      if (this.uiTools[i].id === name) {
        this.uiTools[i].execute(args, { toolCallId, sendToolResult })
        return true
      }
    }

    // 2) 扩展桥接器
    for (let i = 0; i < this.bridges.length; i++) {
      const bridge = this.bridges[i]
      const schemas = bridge.getSchemas()
      for (let j = 0; j < schemas.length; j++) {
        if (schemas[j].name === name) {
          bridge.execute(toolCallId, name, args).then(res => {
            sendToolResult(toolCallId, res.ok ? (res.data ?? '') : `Error: ${res.error ?? 'unknown'}`)
          })
          return true
        }
      }
    }

    // 3) 桌面工具 — 由调用方通过 IPC 执行
    for (let i = 0; i < this.desktopTools.length; i++) {
      if (this.desktopTools[i].id === name) return false
    }

    return false
  }

  // ── 内部辅助 ──

  private bridgeToToolSchemas(bridge: ExternalToolBridge): ToolSchema[] {
    const schemas = bridge.getSchemas()
    const result: ToolSchema[] = []
    for (let i = 0; i < schemas.length; i++) {
      const s = schemas[i]
      result.push({
        type: 'function' as const,
        function: {
          name: s.name,
          description: s.description,
          parameters: (s.parameters ?? { type: 'object', properties: {}, required: [] }) as any
        },
        toolType: s.toolType ?? 'extension'
      })
    }
    return result
  }

  private bridgeToDefinitions(bridge: ExternalToolBridge): ToolDefinition[] {
    const schemas = bridge.getSchemas()
    const result: ToolDefinition[] = []
    for (let i = 0; i < schemas.length; i++) {
      const s = schemas[i]
      result.push({
        id: s.name,
        name: s.name,
        description: s.description,
        category: 'extension',
        schema: {
          type: 'function' as const,
          function: {
            name: s.name,
            description: s.description,
            parameters: (s.parameters ?? { type: 'object', properties: {}, required: [] }) as any
          },
          toolType: s.toolType ?? 'extension'
        },
        serverName: bridge.name
      })
    }
    return result
  }

  private metaToDefinition(meta: DesktopToolMeta): ToolDefinition {
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      schema: meta.schema
    }
  }
}

/** 全局单例 */
export const toolRegistry = new ToolRegistry()
