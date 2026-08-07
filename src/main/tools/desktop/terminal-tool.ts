/**
 * desktop/terminal-tool.ts — 终端工具
 *
 * 复刻 tinker-agent-ui tools/desktop/terminal（对齐 Hermes terminal_tool 本地语义）：
 * - 参数：command/background/timeout/workdir/pty/notify_on_complete/watch_patterns
 * - timeout 单位秒，默认 15s，前台最大 600s（超出拒绝并建议 background）
 * - 破坏性命令检测 → status: blocked
 * - background 返回 session_id，用 process/read_terminal/close_terminal 管理
 * - 返回 JSON 字符串 {output, session_id, pid, exit_code, error, status, hint}
 */
import { spawn, type ChildProcess } from 'child_process'
import { BaseTool } from '../base-tool'
import { processRegistry } from '../common/process-registry'
import { getShellExec } from '../../utils/shell-utils'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { TerminalParams } from './types'

/** 工具名（对齐 @AgentTool(name)） */
export const TOOL_NAME = 'desktop_tinker_terminal'

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

/** 终端工具 */
export class TerminalTool extends BaseTool {
  constructor(renderer: PromptRenderer) {
    // BaseTool 构造需要 renderer + toolName（schema 从 .hbs 加载）
    super(renderer, TOOL_NAME)
  }

  /** 可用性检测：shell 是否可用 */
  check(): Promise<boolean> {
    return new Promise((resolve) => {
      let child: ChildProcess
      if (process.platform === 'win32') {
        child = spawn('echo ok', { timeout: 3000, shell: 'cmd.exe' })
      } else {
        const { command, prefix } = getShellExec()
        child = spawn(command, [...prefix, 'echo ok'], { timeout: 3000 })
      }
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
    })
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as TerminalParams
    const cmd = params.command

    // 参数校验（对齐 Hermes：command 必须是字符串）
    if (typeof cmd !== 'string') {
      const errJson = JSON.stringify({ output: '', exit_code: -1, error: `Invalid command: expected string, got ${typeof cmd}`, status: 'error' })
      return ToolResult.sync(errJson)
    }

    // notify 与 watch 互斥（对齐 Hermes）
    if (params.notify_on_complete && params.watch_patterns && params.watch_patterns.length > 0) {
      const errJson = JSON.stringify({ output: '', exit_code: -1, error: 'notify_on_complete and watch_patterns are mutually exclusive — set one, not both.', status: 'error' })
      return ToolResult.sync(errJson)
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
        return ToolResult.sync(errJson)
      }
    }

    // 前台超时上限（对齐 Hermes：>600s 拒绝并建议 background）
    const timeoutSec = params.timeout ?? DEFAULT_TIMEOUT
    if (!params.background && timeoutSec > FOREGROUND_MAX_TIMEOUT) {
      const errJson = JSON.stringify({
        error: `Foreground timeout ${timeoutSec}s exceeds the maximum of ${FOREGROUND_MAX_TIMEOUT}s. Use background=true with notify_on_complete=true for long-running commands.`
      })
      return ToolResult.sync(errJson)
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
      let child: ChildProcess
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
      // Windows cmd 输出 GBK——用 TextDecoder gbk 流式解码（避免中文乱码）
      const stdoutDecoder = process.platform === 'win32' ? new TextDecoder('gbk') : null
      const stderrDecoder = process.platform === 'win32' ? new TextDecoder('gbk') : null
      const flushDecoders = (): void => {
        if (stdoutDecoder) stdout += stdoutDecoder.decode()
        if (stderrDecoder) stderr += stderrDecoder.decode()
      }
      const finish = (data: Record<string, unknown>) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(ToolResult.sync(JSON.stringify(data)))
      }
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, KILL_GRACE_MS)
        flushDecoders()
        finish({ output: stdout + (stderr ? '\n' + stderr : ''), exit_code: -1, error: `Command timed out after ${timeoutSec}s` })
      }, timeoutMs)

      child.stdout?.on('data', (data: Buffer) => {
        stdout += stdoutDecoder ? stdoutDecoder.decode(data, { stream: true }) : data.toString()
      })
      child.stderr?.on('data', (data: Buffer) => {
        stderr += stderrDecoder ? stderrDecoder.decode(data, { stream: true }) : data.toString()
      })

      child.on('close', (code) => {
        flushDecoders()
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
    return ToolResult.sync(JSON.stringify(resultData))
  }
}
