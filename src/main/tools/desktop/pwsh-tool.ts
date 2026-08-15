/**
 * desktop/pwsh-tool.ts — Windows PowerShell 终端工具
 *
 * Windows-only terminal tool (check() gates the platform):
 * - PowerShell dialect: C:\... native paths, $env:NAME variables, cmdlets (Get-ChildItem)
 * - shell is pinned to powershell.exe -NoProfile -Command — UTF-8 decoding is uniform,
 *   no cmd GBK / bash UTF-8 dual-encoding issue
 * - Reuses the bash TerminalTool execution pipeline (background/timeout/guardrails)
 *   with the shell parameter overridden.
 */
import { BaseTool } from '../base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import { ToolSchema } from '../../core/tool/tool-schema'
import { TerminalTool } from './terminal-tool'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_pwsh'

/** PowerShell 终端工具（仅 Windows——check 平台门控） */
export class PwshTool extends BaseTool {
  /** 复用 bash 终端的执行管线（background/timeout/破坏性检测） */
  private readonly terminal = new TerminalTool(this.renderer)

  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  /** 平台门控：仅 Windows 可用（Unix 上 PowerShell 不存在——灰色展示原因） */
  check(): boolean | { ok: boolean; reason: string } {
    return process.platform === 'win32'
      ? true
      : { ok: false, reason: 'PowerShell 工具仅支持 Windows——请使用 terminal（bash）工具' }
  }

  /** 动态 Schema：PowerShell 方言描述（路径/变量/退出码语义教给模型） */
  getToolSchema(): ToolSchema {
    const base = this.terminal.getToolSchema()
    const description =
      'Execute a command in the Windows PowerShell terminal (pwsh.exe -NoProfile -Command). ' +
      'PowerShell dialect: use native Windows paths (C:\\...), $env:NAME environment variables, and cmdlets (Get-ChildItem, Get-Content). ' +
      'A killed process settles as exit code 1 without a signal marker — treat a bare exit 1 after an interruption as termination, not command failure. ' +
      'Foreground (default): blocks until done, returns full output. Background (background=true): spawns a persistent process, returns session_id immediately; manage it with process/read_terminal/close_terminal.'
    const schema = new ToolSchema(TOOL_NAME, description, base.parameters)
    schema.toolType = base.toolType
    schema.emoji = base.emoji
    return schema
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    // shell 固定 powershell——覆盖模型可能传入的任何 shell 值
    const args = (ctx.toolCall.arguments ?? {}) as Record<string, unknown>
    ctx = { ...ctx, toolCall: { ...ctx.toolCall, arguments: { ...args, shell: 'powershell' } } }
    return this.terminal.execute(ctx)
  }
}
