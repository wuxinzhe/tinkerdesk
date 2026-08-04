/**
 * read-terminal.ts — 客户端工具
 *
 * 一比一复刻 Hermes read_terminal_tool（桌面语义适配）：
 * - Hermes 读 GUI xterm.js 面板；客户端读后台进程输出缓冲（用 session_id 定位）
 * - 字段对齐：{total_lines, start, end, text} + status
 * - start_line 0-indexed（0 = 最旧）；省略 → 最近 200 行
 * - not_found → {status:"not_found", error}
 */
import { BaseTool } from '../index'
import { processRegistry } from '../common/process-registry'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import { redactSensitiveText } from '../common/redact'
import type { ReadTerminalParams } from '@/defines/tools/params'

const DEFAULT_COUNT = 200

export class ReadTerminalTool extends BaseTool<ReadTerminalParams> {
  readonly id = 'desktop_showing_read_terminal'
  readonly name = '终端输出读取'
  readonly description = '读取后台进程的输出（支持分页）'
  readonly category = 'execution'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_read_terminal',
        description: 'Read buffered output from a background process (mirrors the terminal pane of a background run). '
          + 'Returns JSON: {total_lines, start, end, text}. '
          + 'Call with no start_line/count to get the most recent 200 lines. '
          + 'To page through scrollback, pass start_line (0 = oldest line) and count; valid lines are [0, total_lines).',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Process session ID (from terminal background output)'
            },
            start_line: {
              type: 'integer',
              description: '0-indexed first line (0 = oldest). Omit for the most recent output.',
              minimum: 0
            },
            count: {
              type: 'integer',
              description: `Lines to read from start_line. Default: ${DEFAULT_COUNT}.`,
              minimum: 1
            }
          },
          required: ['session_id']
        }
      },
      toolType: 'desktop',
      emoji: '📋'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: ReadTerminalParams): Promise<ToolResult> {
    const session = processRegistry.get(params.session_id)
    if (!session) {
      return { ok: false, data: JSON.stringify({ status: 'not_found', error: `No process with ID ${params.session_id}` }), error: 'process not found' }
    }

    const fullText = session.stdout + (session.stderr ? '\n' + session.stderr : '')
    // 对齐 Python splitlines()：兼容 CRLF
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
    return { ok: true, data: JSON.stringify(d) }
  }
}

/** 单例实例 */
export const readTerminalTool = new ReadTerminalTool()
