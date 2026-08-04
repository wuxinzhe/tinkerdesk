/**
 * close-terminal.ts — 客户端工具
 *
 * 一比一复刻 Hermes close_terminal_tool（桌面语义适配）：
 * - 语义：关闭后台进程的只读终端视图，**不杀进程**（对齐 Hermes 明确行为）
 * - 进程输出继续缓冲，随时可用 process/read_terminal 查询
 * - 进程_id 必填；会话不存在不视为错误（tab 仍可关）
 * - 返回 {status:"ok", closed, note}
 */
import { BaseTool } from '../index'
import { processRegistry } from '../common/process-registry'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import type { CloseTerminalParams } from '@/defines/tools/params'

export class CloseTerminalTool extends BaseTool<CloseTerminalParams> {
  readonly id = 'desktop_showing_close_terminal'
  readonly name = '关闭终端'
  readonly description = '关闭后台进程的终端视图（不杀进程）'
  readonly category = 'execution'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_close_terminal',
        description: 'Close the read-only terminal view for one of your background processes '
          + '(the views mirroring terminal(background=true) runs). '
          + 'This does NOT kill the process — it only drops the view; the output keeps buffering '
          + 'and remains available via process/read_terminal. '
          + 'Use it to tidy up when a background process\'s live terminal is no longer worth showing. '
          + 'To actually stop the process, use process(action=\'kill\') instead.',
        parameters: {
          type: 'object',
          properties: {
            process_id: {
              type: 'string',
              description: "The background process's session id (from terminal(background=true) output or process(action='list')) whose view should be closed."
            }
          },
          required: ['process_id']
        }
      },
      toolType: 'desktop',
      emoji: '🔌'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: CloseTerminalParams): Promise<ToolResult> {
    const pid = (params.process_id ?? '').trim()
    if (!pid) {
      const err = 'process_id is required (the background process whose tab to close).'
      return { ok: false, data: JSON.stringify({ error: err }), error: err }
    }

    // Hermes 语义：只关视图不杀进程；会话已结束/已修剪也能关 tab（缺失 session 不是错误）
    const session = processRegistry.get(pid)
    const d = {
      status: 'ok',
      closed: pid,
      note: (
        'Closed the read-only terminal view. The process was not killed; '
        + 'its output remains available via process/read_terminal and the session stays in the registry.'
      )
    }
    // 记录视图关闭标记（会话存在时）
    if (session) (session as unknown as Record<string, unknown>)['view_closed'] = true
    return { ok: true, data: JSON.stringify(d) }
  }
}

/** 单例实例 */
export const closeTerminalTool = new CloseTerminalTool()
