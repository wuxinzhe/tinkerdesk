/**
 * desktop/read-terminal-tool.ts — 终端输出读取工具
 *
 * Read-terminal tool:
 * - 读后台进程输出缓冲（用 session_id 定位）
 * - 字段对齐：{total_lines, start, end, text} + status
 * - start_line 0-indexed（0 = 最旧）；省略 → 最近 200 行
 */
import { BaseTool } from '../base-tool'
import { processRegistry } from '../common/process-registry'
import { redactSensitiveText } from '../../utils/redact'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { ReadTerminalParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_read_terminal'

const DEFAULT_COUNT = 200

/** 终端输出读取工具 */
export class ReadTerminalTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as ReadTerminalParams
    const session = processRegistry.get(params.session_id)
    if (!session) {
      return ToolResult.sync(JSON.stringify({ status: 'not_found', error: `No process with ID ${params.session_id}` }))
    }

    const fullText = session.stdout + (session.stderr ? '\n' + session.stderr : '')
    // splitlines() 语义：兼容 CRLF
    const lines = fullText.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const totalLines = lines.length
    const startLine = params.start_line ?? Math.max(0, totalLines - DEFAULT_COUNT)
    const count = params.count ?? DEFAULT_COUNT
    const end = Math.min(totalLines, startLine + count)
    const slice = lines.slice(startLine, end)

    const d = {
      total_lines: totalLines,
      start: startLine,
      end,
      text: redactSensitiveText(slice.join('\n')),
      status: session.done ? 'exited' : 'running',
      exit_code: session.exitCode
    }
    return ToolResult.sync(JSON.stringify(d))
  }
}
