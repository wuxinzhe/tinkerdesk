/**
 * terminal.ts — 客户端工具
 *
 * 一比一复刻 Hermes terminal_tool（本地 backend 语义）：
 * - 参数：command/background/timeout/force/workdir/pty/notify_on_complete/watch_patterns
 * - timeout 单位秒（Hermes 语义），默认 15s，前台最大 600s（超出拒绝并建议 background）
 * - 破坏性命令检测 → {output:"", exit_code:-1, error, status:"blocked"}
 * - background 返回 "Background process started" + session_id/pid，无 notify 时 hint nudge
 * - notify_on_complete 与 watch_patterns 互斥校验
 * - 返回 JSON 字符串 {output, session_id, pid, exit_code, error, status, hint}
 */
import { spawn } from 'child_process'
import { BaseTool } from '../index'
import { processRegistry } from '../common/process-registry'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'

import type { TerminalParams } from '@/defines/tools/params'
import { getShellExec } from '../common/shell-utils'

// ── 常量（对齐 Hermes）──

const DEFAULT_TIMEOUT = 15          // 秒
const FOREGROUND_MAX_TIMEOUT = 600  // 秒
const KILL_GRACE_MS = 3000

// ── 破坏性命令检测 ──

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /rm\s+-[rf]+\s+\//,
  /rm\s+-[rf]+\s+.*~\//,
  /dd\s+if=/,
  /mkfs\./,
  /:\(\s*\{.*:.*\};/,
  /format\s+\w:.*\/fs:/i,
  /del\s+\/f\s+\/s/i,
  /rd\s+\/s\s+\/q/i,
  /shutdown\s+\/s/i,
]

// ── 平台 Shell 描述 ──

function getPlatformHint(): { shell: string; syntaxHint: string; cmdHint: string } {
  if (process.platform === 'win32') {
    return {
      shell: 'cmd.exe',
      syntaxHint: 'Use Windows-native syntax (dir, type, echo, findstr, tasklist).',
      cmdHint: 'The command to execute via cmd.exe. Use Windows-native syntax.'
    }
  }
  return {
    shell: 'bash',
    syntaxHint: 'Use standard Unix syntax (ls, cat, echo, grep, ps).',
    cmdHint: 'The command to execute via bash. Use standard Unix syntax.'
  }
}

// ── 工具类 ──

export class TerminalTool extends BaseTool<TerminalParams> {
  readonly id = 'desktop_showing_terminal'
  readonly name = '命令行'
  readonly description = '执行本机 shell 命令（支持前景/后台模式）'
  readonly category = 'execution'

  getSchema(): ToolSchema {
    const { shell, syntaxHint, cmdHint } = getPlatformHint()
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_terminal',
        description:
          `Execute a command in the configured terminal environment. ${syntaxHint} `
          + 'Foreground (default): blocks until done, returns full output. '
          + 'Background (background=true): spawns a persistent process, returns session_id immediately; '
          + 'manage it with process/read_terminal/close_terminal. '
          + 'Use process(action=list) to see all background sessions.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: cmdHint
            },
            background: {
              type: 'boolean',
              description: 'Whether to run in background (default: false)',
              default: false
            },
            timeout: {
              type: 'integer',
              description: `Command timeout in seconds (default: ${DEFAULT_TIMEOUT}, foreground max: ${FOREGROUND_MAX_TIMEOUT})`
            },
            workdir: {
              type: 'string',
              description: 'Working directory for this command (uses process cwd if not set)'
            },
            pty: {
              type: 'boolean',
              description: 'If True, use pseudo-terminal for interactive CLI tools (not supported on desktop client; ignored)',
              default: false
            },
            notify_on_complete: {
              type: 'boolean',
              description: 'If True and background=True, you will be notified when the process exits. MUTUALLY EXCLUSIVE with watch_patterns.',
              default: false
            },
            watch_patterns: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of strings to watch for in background output. MUTUALLY EXCLUSIVE with notify_on_complete — set one, not both.'
            }
          },
          required: ['command']
        }
      },
      toolType: 'desktop',
      emoji: '💻'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return new Promise((resolve) => {
      let child: import('child_process').ChildProcess
      if (process.platform === 'win32') {
        child = spawn('echo ok', { timeout: 3000, shell: 'cmd.exe' })
      } else {
        const { command, prefix } = getShellExec()
        child = spawn(command, [...prefix, 'echo ok'], { timeout: 3000 })
      }
      child.on('error', () => resolve({ available: false, reason: `shell 不可用` }))
      child.on('close', (code) => {
        resolve(code === 0
          ? { available: true }
          : { available: false, reason: `shell 退出码 ${code}` }
        )
      })
    })
  }

  async execute(params: TerminalParams): Promise<ToolResult> {
    const cmd = params.command

    // 参数校验（对齐 Hermes：command 必须是字符串）
    if (typeof cmd !== 'string') {
      const errJson = JSON.stringify({ output: '', exit_code: -1, error: `Invalid command: expected string, got ${typeof cmd}`, status: 'error' })
      return { ok: false, data: errJson, error: 'invalid command' }
    }

    // notify 与 watch 互斥（对齐 Hermes）
    if (params.notify_on_complete && params.watch_patterns && params.watch_patterns.length > 0) {
      const errJson = JSON.stringify({ output: '', exit_code: -1, error: 'notify_on_complete and watch_patterns are mutually exclusive — set one, not both.', status: 'error' })
      return { ok: false, data: errJson, error: 'mutually exclusive params' }
    }

    // 破坏性命令检测 → status: blocked
    for (const pattern of DESTRUCTIVE_PATTERNS) {
      if (pattern.test(cmd)) {
        const errJson = JSON.stringify({
          output: '',
          exit_code: -1,
          error: `Command denied: matched dangerous pattern ${pattern.source}. Rephrase the command.`,
          status: 'blocked'
        })
        return { ok: false, data: errJson, error: 'dangerous command blocked' }
      }
    }

    // 前台超时上限（对齐 Hermes：>600s 拒绝并建议 background）
    const timeoutSec = params.timeout ?? DEFAULT_TIMEOUT
    if (!params.background && timeoutSec > FOREGROUND_MAX_TIMEOUT) {
      const errJson = JSON.stringify({
        error: `Foreground timeout ${timeoutSec}s exceeds the maximum of ${FOREGROUND_MAX_TIMEOUT}s. Use background=true with notify_on_complete=true for long-running commands.`
      })
      return { ok: false, data: errJson, error: 'timeout exceeds foreground max' }
    }

    if (params.background) {
      return this.executeBackground(cmd, timeoutSec, params.workdir, params.notify_on_complete, params.watch_patterns)
    }
    return this.executeForeground(cmd, timeoutSec, params.workdir)
  }

  /** 前景模式：等待执行完毕，返回 {output, exit_code, error} */
  private executeForeground(cmd: string, timeoutSec: number, workdir?: string): Promise<ToolResult> {
    const timeoutMs = timeoutSec * 1000
    const cwd = workdir ?? process.cwd()
    return new Promise((resolve) => {
      let child: import('child_process').ChildProcess
      if (process.platform === 'win32') {
        child = spawn(cmd, {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: timeoutMs,
          shell: 'cmd.exe'
        })
      } else {
        const { command, prefix } = getShellExec()
        child = spawn(command, [...prefix, cmd], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: timeoutMs
        })
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      const finish = (data: Record<string, unknown>) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: data['exit_code'] === 0, data: JSON.stringify(data), error: data['exit_code'] === 0 ? undefined : String(data['error'] ?? '') })
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, KILL_GRACE_MS)
        finish({ output: stdout + (stderr ? '\n' + stderr : ''), exit_code: -1, error: `Command timed out after ${timeoutSec}s` })
      }, timeoutMs)

      child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

      child.on('close', (code) => {
        finish({ output: stdout + (stderr ? '\n' + stderr : ''), exit_code: code ?? -1, error: null })
      })

      child.on('error', (err) => {
        finish({ output: '', exit_code: -1, error: err.message })
      })
    })
  }

  /** 后台模式：注册到进程注册表并立即返回 session_id + nudge hint（对齐 Hermes） */
  private executeBackground(cmd: string, timeoutSec: number, workdir?: string, notifyOnComplete?: boolean, watchPatterns?: string[]): ToolResult {
    const sessionId = processRegistry.spawn({ command: cmd, timeout: timeoutSec * 1000, cwd: workdir })
    const session = processRegistry.get(sessionId)!

    const resultData: Record<string, unknown> = {
      output: 'Background process started',
      session_id: sessionId,
      pid: session.pid,
      exit_code: 0,
      error: null
    }
    if (notifyOnComplete) resultData['notify_on_complete'] = true
    if (watchPatterns && watchPatterns.length > 0) resultData['watch_patterns'] = watchPatterns
    if (!notifyOnComplete && !(watchPatterns && watchPatterns.length > 0)) {
      resultData['hint'] = (
        'background=true without notify_on_complete=true means this process runs SILENTLY — you will not be told when it exits. '
        + 'If this is a bounded task (test suite, build, CI poller, deploy, anything with a defined end), you almost certainly wanted '
        + 'notify_on_complete=true so the system pings you on exit. Re-launch with notify_on_complete=true, or call '
        + "process(action='poll') / process(action='wait') yourself to learn the outcome. "
        + 'Only ignore this hint for genuine long-lived processes that never exit (servers, watchers, daemons).'
      )
    }
    return { ok: true, data: JSON.stringify(resultData) }
  }
}

/** 单例实例 */
export const terminalTool = new TerminalTool()
