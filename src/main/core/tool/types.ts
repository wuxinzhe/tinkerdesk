/**
 * types.ts — Agent tool system unified type definitions
 *
 * Type definitions (interfaces/type aliases) only; class implementations live
 * in separate files:
 * - ToolSchema → tool-schema.ts
 * - ToolResult → tool-result.ts
 */
import type {ToolCall} from '../llm/types'
import type {ToolSchema} from './tool-schema'
import type {ToolResult} from './tool-result'
import type {ToolContext} from '../loop/types'
import type { ToolManager } from './tool-manager'
import type { Installer } from '../installer/installer'

// ── ToolFunction（ToolFunction） ─────────────────────────

/** OpenAI function-calling 格式中的 function 对象 */
export interface ToolFunction {
  /** 工具名称 */
  name: string
  /** 工具功能描述 */
  description: string
  /** 参数 JSON Schema 对象 */
  parameters: Record<string, unknown> | null
}

// ── ToolCall（ToolCall，复用项目已有定义） ────────────────

export type {ToolCall}

// ── IAgentTool（IAgentTool） ─────────────────────────────

/** Agent 工具 SPI 接口（所有工具需实现） */
export interface IAgentTool {
  /** 获取工具的 Schema 定义（用于向 LLM 描述工具）。动态工具（如 terminal/pwsh 按平台）在内部自行判断环境生成。 */
  getSchema(): ToolSchema
  /** 执行工具调用，返回字符串结果（将直接发送给 LLM）。入参 = loop 的 ToolContext。 */
  execute(ctx: ToolContext): Promise<ToolResult>
  /** 可用性检测（注册时调用；不可用工具不入池）。同步返回 ToolCheckResult：ok=false 时 reason 展示给用户。 */
  check?(): ToolCheckResult
}

/** 工具可用性检测结果（check 可返回——reason 给管理页 tps-tool-error 展示） */
export interface ToolCheckResult {
  ok: boolean
  /** 不可用原因（ok=false 时展示给用户） */
  reason?: string
}

// ── 工具类型常量 ─────

// ── 工具注册元信息（@AgentTool 注解） ────────────────────

/** 工具元信息 */
export interface AgentToolMeta {
  /** 工具名（全局唯一，不区分大小写） */
  name: string
  /** 展示用 emoji（可选） */
  emoji?: string
}

/** 工具注册项：元信息 + 实现 */
export interface AgentToolRegistration {
  meta: AgentToolMeta
  tool: IAgentTool
  /** 注册来源：'builtin'（框架内置——bootstrap 传入）｜'external'（外置安装——ToolCenter.load 扫 tools/） */
  source?: 'builtin' | 'external'
}

// ── ToolCenter 类型（外置工具包中心） ──

/** ToolCenter 构造依赖 */
export interface ToolCenterDeps {
  toolManager: ToolManager
  /** 分步安装器（与 provider 扩展共用——工具/扩展/app 走分步安装链路） */
  installer: Installer
  /** 代码内置工具（工程 src/main/tools 的所有工具——启动经 ToolCenter 校验后注册） */
  builtin?: AgentToolRegistration[]
}

/** 外置工具包 manifest（tinkerdesk-tool-* 包内 manifest.json 结构） */
export interface ToolPackageManifest {
  id: string
  entry?: string
  apiVersion?: number
  kind?: string
  tool?: { name?: string; displayName?: string; description?: string; categories?: string[] }
  assetDeps?: Array<{ name: string; dest: string; optional?: boolean; sizeMB?: number }>
}

