/**
 * process.ts — 客户端工具
 *
 * 一比一复刻 Hermes process_tool（process_registry.py，逐行核对）：
 * - 8 个 action：list/poll/log/wait/kill/write/submit/close
 * - session_id 强制转字符串（模型可能发整数）
 * - not_found → {status:"not_found", error}；已退出 → {status:"already_exited", ...}
 * - poll：output_preview = 合并输出最后 1000 字符；exited 时带 exit_code/completion_reason/termination_source
 * - log：offset==0 → 最后 N 行（默认 200）；showing 是 "N lines" 字符串；无 truncated 字段
 * - wait：默认 180s clamp；timeout 无 exit_code，output 最后 1000 字符，timeout_note 必填
 * - kill 成功 → {status:"killed", completion_reason:"killed", termination_source, output}
 * - close → {status:"ok", message:"stdin closed"}
 * - list：command[:200]，含 cwd/started_at(ISO)/output_preview(-200)
 * - 输出脱敏（对齐 _redact_process_result）
 */
import { BaseTool } from '../index'
import { processRegistry } from '../common/process-registry'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'
import { redactSensitiveText } from '../common/redact'

import type { ProcessParams } from '@/defines/tools/params'

const WAIT_DEFAULT_TIMEOUT = 180
const LOG_DEFAULT_LIMIT = 200

/** 合并 stdout+stderr（对齐 Hermes 的 session.output_buffer 语义） */
function mergedOutput(session: { stdout: string; stderr: string }): string {
  return session.stdout + (session.stderr ? '\n' + session.stderr : '')
}

// ── 工具类 ──

export class ProcessTool extends BaseTool<ProcessParams> {
  readonly id = 'desktop_showing_process'
  readonly name = '进程管理'
  readonly description = '管理后台进程（配合 terminal background=true）'
  readonly category = 'execution'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_process',
        description: 'Manage background processes started with terminal(background=true). '
          + "Actions: 'list' (show all), 'poll' (check status + new output), "
          + "'log' (full output with pagination), 'wait' (block until done or timeout), "
          + "'kill' (terminate), 'write' (send raw stdin data without newline), "
          + "'submit' (send data + Enter, for answering prompts), 'close' (close stdin/send EOF).",
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'poll', 'log', 'wait', 'kill', 'write', 'submit', 'close'],
              description: 'Action to perform on background processes'
            },
            session_id: {
              type: 'string',
              description: "Process session ID (from terminal background output). Required for all actions except 'list'."
            },
            data: {
              type: 'string',
              description: "Text to send to process stdin (for 'write' and 'submit' actions)"
            },
            timeout: {
              type: 'integer',
              description: "Max seconds to block for 'wait' action. Returns partial output on timeout.",
              minimum: 1
            },
            offset: {
              type: 'integer',
              description: "Line offset for 'log' action (default: last 200 lines)"
            },
            limit: {
              type: 'integer',
              description: "Max lines to return for 'log' action",
              minimum: 1
            }
          },
          required: ['action']
        }
      },
      toolType: 'desktop',
      emoji: '⚙️'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: ProcessParams): Promise<ToolResult> {
    const action = params.action

    // session_id 强制转字符串（对齐 Hermes：模型可能发整数）
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
    return { ok: false, data: JSON.stringify({ error }), error }
  }

  /** 脱敏输出（对齐 Hermes _redact_process_result：output/output_preview/command） */
  private redact(d: Record<string, unknown>): Record<string, unknown> {
    if (typeof d['output'] === 'string' && d['output']) d['output'] = redactSensitiveText(d['output'] as string)
    if (typeof d['output_preview'] === 'string' && d['output_preview']) d['output_preview'] = redactSensitiveText(d['output_preview'] as string)
    if (typeof d['command'] === 'string' && d['command']) d['command'] = redactSensitiveText(d['command'] as string)
    return d
  }

  /** list → {"processes": [...]}（对齐 list_sessions 字段） */
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
    return { ok: true, data: JSON.stringify({ processes }) }
  }

  /** poll → {session_id, command, status, pid, uptime_seconds, output_preview(-1000)}；exited 加 exit_code 等 */
  private actionPoll(sessionId: string): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return { ok: false, data: JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }), error: 'process not found' }
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
    return { ok: true, data: JSON.stringify(this.redact(d)) }
  }

  /** log：offset==0 → 最后 N 行；showing 是 "N lines" 字符串（对齐 read_log） */
  private actionLog(sessionId: string, offset?: number, limit?: number): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return { ok: false, data: JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }), error: 'process not found' }
    }
    const fullText = mergedOutput(session)
    // 对齐 Python splitlines()：兼容 CRLF（Windows cmd echo 输出 \r\n）
    const lines = fullText.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    const totalLines = lines.length
    const lim = limit ?? LOG_DEFAULT_LIMIT
    // 对齐 Hermes：offset==0（或未传）→ 最后 N 行；offset>0 → 从 offset 开始
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
      showing: `${selected.length} lines`
    }
    return { ok: true, data: JSON.stringify(this.redact(d)) }
  }

  /** wait：默认 180s clamp；timeout → 无 exit_code + timeout_note 必填 */
  private actionWait(sessionId: string, timeout?: number): Promise<ToolResult> {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return Promise.resolve({ ok: false, data: JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }), error: 'process not found' })
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
      return Promise.resolve({ ok: true, data: JSON.stringify(this.redact(d)) })
    }

    return new Promise((resolve) => {
      // 对齐 Hermes wait：clamp 到默认值（180s），timeout_note 记录 clamp
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
        resolve({ ok: false, data: JSON.stringify(this.redact(d)), error: `wait timed out after ${effective}s` })
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
          resolve({ ok: true, data: JSON.stringify(this.redact(d)) })
        }
      }, 500)
    })
  }

  /** kill → 成功 {status:"killed", session_id, completion_reason:"killed", termination_source, output} */
  private actionKill(sessionId: string): ToolResult {
    const session = processRegistry.get(sessionId)
    if (!session) {
      return { ok: false, data: JSON.stringify({ status: 'not_found', error: `No process with ID ${sessionId}` }), error: 'process not found' }
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
      return { ok: true, data: JSON.stringify(this.redact(d)) }
    }
    processRegistry.kill(sessionId)
    const d = {
      status: 'killed',
      session_id: sessionId,
      completion_reason: 'killed',
      termination_source: 'process.kill',
      output: mergedOutput(session).slice(-2000)
    }
    return { ok: true, data: JSON.stringify(this.redact(d)) }
  }

  /** write → {status:"ok", bytes_written} / not_found / already_exited */
  private actionWrite(sessionId: string, data: string): ToolResult {
    const ok = processRegistry.write(sessionId, data)
    if (!ok) {
      const session = processRegistry.get(sessionId)
      const d = session?.done
        ? { status: 'already_exited', error: 'Process has already finished' }
        : { status: 'not_found', error: `No process with ID ${sessionId}` }
      return { ok: false, data: JSON.stringify(d), error: 'write failed' }
    }
    return { ok: true, data: JSON.stringify({ status: 'ok', bytes_written: Buffer.byteLength(data, 'utf-8') }) }
  }

  /** submit = write(data + "\n")（对齐 Hermes submit_stdin） */
  private actionSubmit(sessionId: string, data: string): ToolResult {
    return this.actionWrite(sessionId, data + '\n')
  }

  /** close → {status:"ok", message:"stdin closed"}（对齐 close_stdin） */
  private actionClose(sessionId: string): ToolResult {
    const ok = processRegistry.closeStdin(sessionId)
    if (!ok) {
      const session = processRegistry.get(sessionId)
      const d = session?.done
        ? { status: 'already_exited', error: 'Process has already finished' }
        : { status: 'not_found', error: `No process with ID ${sessionId}` }
      return { ok: false, data: JSON.stringify(d), error: 'close failed' }
    }
    return { ok: true, data: JSON.stringify({ status: 'ok', message: 'stdin closed' }) }
  }
}

/** 单例实例 */
export const processTool = new ProcessTool()
