/**
 * desktop/close-terminal-tool.ts — 关闭终端视图工具
 *
 * Close-terminal tool: closes the read-only terminal view of a background process, **without killing the process**
 * - 语义：关闭后台进程的只读终端视图，**不杀进程**
 * - 进程输出继续缓冲，随时可用 process/read_terminal 查询
 * - process_id 必填；会话不存在不视为错误
 */
import type { ToolCheckResult } from '../../core/tool/types'
import { BaseTool } from './base-tool'
import { processRegistry } from './common/process-registry'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { CloseTerminalParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_close_terminal'

/** 关闭终端视图工具 */
export class CloseTerminalTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): ToolCheckResult {
    return { ok: true };
    }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as CloseTerminalParams
    const pid = (params.process_id ?? '').trim()
    if (!pid) {
      const err = 'process_id is required (the background process whose tab to close).'
      return ToolResult.sync(JSON.stringify({ error: err }))
    }

    // 语义：只关视图不杀进程；会话已结束/已修剪也能关 tab（缺失 session 不是错误）
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
    return ToolResult.sync(JSON.stringify(d))
  }
}
