/**
 * desktop/process-tool.ts — 进程管理工具
 *
 * Process tool:
 * - 8 个 action：list/poll/log/wait/kill/write/submit/close
 * - session_id 强制转字符串（模型可能发整数）
 * - not_found → {status:"not_found", error}；已退出 → {status:"already_exited", ...}
 * - 输出脱敏
 */
import { BaseTool } from './base-tool'
import { processRegistry } from './common/process-registry'
import { redactSensitiveText } from '../utils/redact'
import { ToolResult } from '../core/tool/tool-result'
import type { PromptRenderer } from '../core/prompt/renderer'
import type { ToolContext } from '../core/loop/types'
import type { ProcessParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_process'

const WAIT_DEFAULT_TIMEOUT = 180
const LOG_DEFAULT_LIMIT = 200

/** 合并 stdout+stderr */
function mergedOutput(session: { stdout: string; stderr: string }): string {
  return session.stdout + (session.stderr ? '\n' + session.stderr : '')
}

/** 进程管理工具 */
export class ProcessTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return true
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as ProcessParams
    const action = params.action

    // session_id 强制转字符串
    const sessionId = params.session_id != null ? String(params.session_id) : ''

    switch (action) {
      case 'list':
        return this.actionList()
      case 'poll':
        return this.actionPoll(sessionId)
      case 'log':
        return this.actionLog(sessionId, params.offset, params.limit)
      case 'wait':
        return this.actionWait(sessionId, params.timeout)
      case 'kill':
        return this.actionKill(sessionId)
      case 'write': {
        if (!sessionId) return this.sessionRequired('write')
        return this.actionWrite(sessionId, params.data ?? '')
      }
      case 'submit': {
        if (!sessionId) return this.sessionRequired('submit')
        return this.actionSubmit(sessionId, params.data ?? '')
      }
      case 'close': {
        if (!sessionId) return this.sessionRequired('close')
        return this.actionClose(sessionId)
      }
      default:
        return this.err(`Unknown process action: ${action}. Use: list, poll, log, wait, kill, write, submit, close`)
    }
  }

  private sessionRequired(action: string): ToolResult {
    return this.err(`session_id is required for ${action}`)
  }

  private err(error: string): ToolResult {
    return ToolResult.sync(JSON.stringify({ error }))
  }

  /** 脱敏输出 */
  private redact(d: Record<string, unknown>): Record<string, unknown> {
    if (typeof d['output'] === 'string' && d['output']) d['output'] = redactSensitiveText(d['output'] as string)
    if (typeof d['output_preview'] === 'string' && d['output_preview']) d['output_preview'] = redactSensitiveText(d['output_preview'] as string)
    if (typeof d['command'] === 'string' && d['command']) d['command'] = redactSensitiveText(d['command'] as string)
    return d
  }

  /** list → {"processes": [...]} */
  private actionList(): ToolResult {
    const sessions = processRegistry.list()
    const processes = sessions.map(s => {
      const entry: Record<string, unknown> = {
        session_id: s.id,
        command: s.command.slice(0, 200),
        cwd: s.cwd,
        pid: s.pid,
        started_at: new Date(s.startTime).toISOString().slice(0, 19),
        uptime_seconds: Math.floor(((s.endTime ?? Date.now()) - s.startTime) / 1000),
        status: s.done ? 'exited' : 'running',
        output_preview: mergedOutput(s).slice(-200)
      }
      if (s.done) {
        entry['exit_code'] = s.exitCode
        entry['completion_reason'] = 'exited'
      }
      return entry
    })
    return ToolResult.sync(JSON.stringify({ processes }))
  }

  /** poll → {session_id, command, status, pid, uptime_seconds, output_preview(-1000)}；exited 加 exit_code 等 */
  private actionPoll(sessionId: string): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return ToolResult.sync(JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }))
    }
    const d: Record<string, unknown> = {
      session_id: session.id,
      command: session.command,
      status: session.done ? 'exited' : 'running',
      pid: session.pid,
      uptime_seconds: Math.floor(((session.endTime ?? Date.now()) - session.startTime) / 1000),
      output_preview: mergedOutput(session).slice(-1000)
    }
    if (session.done) {
      d['exit_code'] = session.exitCode
      d['completion_reason'] = 'exited'
      d['termination_source'] = 'process_exit'
    }
    return ToolResult.sync(JSON.stringify(this.redact(d)))
  }

  /** log：offset==0 → 最后 N 行；tinker 是 "N lines" 字符串 */
  private actionLog(sessionId: string, offset?: number, limit?: number): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return ToolResult.sync(JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }))
    }
    const fullText = mergedOutput(session)
    // splitlines() 语义：兼容 CRLF（Windows cmd echo 输出 \r\n）
    const lines = fullText.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const totalLines = lines.length
    const lim = limit ?? LOG_DEFAULT_LIMIT
    // offset==0（或未传）→ 最后 N 行；offset>0 → 从 offset 开始
    let selected: string[]
    if ((offset ?? 0) === 0 && lim > 0) {
      selected = lines.slice(-lim)
    } else {
      selected = lines.slice((offset ?? 0), (offset ?? 0) + lim)
    }
    const d = {
      session_id: session.id,
      command: session.command,
      status: session.done ? 'exited' : 'running',
      output: selected.join('\n'),
      total_lines: totalLines,
      tinker: `${selected.length} lines`
    }
    return ToolResult.sync(JSON.stringify(this.redact(d)))
  }

  /** wait：默认 180s clamp；timeout → 无 exit_code + timeout_note 必填 */
  private actionWait(sessionId: string, timeout?: number): Promise<ToolResult> {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return Promise.resolve(ToolResult.sync(JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` })))
    }
    if (session.done) {
      const d = {
        status: 'exited',
        command: session.command,
        exit_code: session.exitCode,
        completion_reason: 'exited',
        termination_source: 'process_exit',
        output: mergedOutput(session).slice(-2000)
      }
      return Promise.resolve(ToolResult.sync(JSON.stringify(this.redact(d))))
    }

    return new Promise((resolve) => {
      // ：clamp 到默认值（180s），timeout_note 记录 clamp
      const maxTimeout = WAIT_DEFAULT_TIMEOUT
      const requested = timeout ?? maxTimeout
      let timeoutNote: string | null = null
      let effective: number
      if (requested > maxTimeout) {
        effective = maxTimeout
        timeoutNote = `Requested wait of ${requested}s was clamped to configured limit of ${maxTimeout}s`
      } else {
        effective = requested
      }

      const timer = setTimeout(() => {
        const s = processRegistry.get(session.id)
        const d: Record<string, unknown> = {
          status: 'timeout',
          command: s?.command,
          output: s ? mergedOutput(s).slice(-1000) : ''
        }
        d['timeout_note'] = timeoutNote ?? `Waited ${effective}s, process still running`
        resolve(ToolResult.sync(JSON.stringify(this.redact(d))))
      }, effective * 1000)

      const check = setInterval(() => {
        const s = processRegistry.get(session.id)
        if (!s || s.done) {
          clearInterval(check)
          clearTimeout(timer)
          const d: Record<string, unknown> = {
            status: 'exited',
            command: s?.command,
            exit_code: s?.exitCode ?? -1,
            completion_reason: 'exited',
            termination_source: 'process_exit',
            output: s ? mergedOutput(s).slice(-2000) : ''
          }
          if (timeoutNote) d['timeout_note'] = timeoutNote
          resolve(ToolResult.sync(JSON.stringify(this.redact(d))))
        }
      }, 500)
    })
  }

  /** kill → 成功 {status:"killed", session_id, completion_reason:"killed", termination_source, output} */
  private actionKill(sessionId: string): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return ToolResult.sync(JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }))
    }
    if (session.done) {
      const d = {
        status: 'already_exited',
        command: session.command,
        exit_code: session.exitCode,
        completion_reason: 'exited',
        termination_source: 'process_exit',
        output: mergedOutput(session).slice(-2000)
      }
      return ToolResult.sync(JSON.stringify(this.redact(d)))
    }
    processRegistry.kill(sessionId)
    const d = {
      status: 'killed',
      session_id: sessionId,
      completion_reason: 'killed',
      termination_source: 'process.kill',
      output: mergedOutput(session).slice(-2000)
    }
    return ToolResult.sync(JSON.stringify(this.redact(d)))
  }

  /** write → {status:"ok", bytes_written} / not_found / already_exited */
  private actionWrite(sessionId: string, data: string): ToolResult {
    const ok = processRegistry.write(sessionId, data)
    if (!ok) {
      const session = processRegistry.get(sessionId)
      const d = session?.done
        ? { status: 'already_exited', error: 'Process has already finished' }
        : { status: 'not_found', error: `No process with ID ${sessionId}` }
      return ToolResult.sync(JSON.stringify(d))
    }
    return ToolResult.sync(JSON.stringify({ status: 'ok', bytes_written: Buffer.byteLength(data, 'utf-8') }))
  }

  /** submit = write(data + "\n") */
  private actionSubmit(sessionId: string, data: string): ToolResult {
    return this.actionWrite(sessionId, data + '\n')
  }

  /** close → {status:"ok", message:"stdin closed"} */
  private actionClose(sessionId: string): ToolResult {
    const ok = processRegistry.closeStdin(sessionId)
    if (!ok) {
      const session = processRegistry.get(sessionId)
      const d = session?.done
        ? { status: 'already_exited', error: 'Process has already finished' }
        : { status: 'not_found', error: `No process with ID ${sessionId}` }
      return ToolResult.sync(JSON.stringify(d))
    }
    return ToolResult.sync(JSON.stringify({ status: 'ok', message: 'stdin closed' }))
  }
}
