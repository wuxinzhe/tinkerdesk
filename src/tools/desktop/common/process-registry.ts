/**
 * process-registry.ts — 后台进程注册表
 *
 * 管理通过 terminal(background=true) 启动的进程的生命周期。
 * 提供输出缓冲、状态查询、强制终止等能力。
 * 进程注册表为全局单例，由 process / read_terminal / close_terminal 工具共享。
 */
import { spawn } from 'child_process'
import type { ProcessSession, SpawnOptions } from '@/defines/tools/params'
import { getShellExec } from './shell-utils'

// ── 常量 ──

const MAX_OUTPUT_BYTES = 200_000  // 200KB 滚动输出缓冲
const KILL_GRACE_MS = 3000        // SIGTERM 后等 3s 再 SIGKILL

// ── 进程注册表 ──

class ProcessRegistry {
  private sessions = new Map<string, ProcessSession>()
  private idCounter = 0

  /** 启动一个后台进程并注册。返回 session_id。 */
  spawn(opts: SpawnOptions): string {
    const id = `proc_${Date.now()}_${++this.idCounter}`
    const cwd = opts.cwd ?? process.cwd()

    let child: import('child_process').ChildProcess
    if (process.platform === 'win32') {
      child = spawn(opts.command, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: opts.timeout,
        shell: 'cmd.exe',
      })
    } else {
      const { command, prefix } = getShellExec()
      child = spawn(command, [...prefix, opts.command], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: opts.timeout,
      })
    }

    const session: ProcessSession = {
      id, command: opts.command, cwd,
      pid: child.pid ?? null,
      startTime: Date.now(), endTime: null,
      done: false, exitCode: null,
      stdout: '', stderr: '',
      process: child
    }

    child.stdout?.on('data', (data: Buffer) => {
      session.stdout = this.appendBuffered(session.stdout, data.toString())
    })

    child.stderr?.on('data', (data: Buffer) => {
      session.stderr = this.appendBuffered(session.stderr, data.toString())
    })

    child.on('close', (code) => {
      session.done = true
      session.exitCode = code
      session.endTime = Date.now()
      session.process = null
    })

    child.on('error', (err) => {
      session.done = true
      session.exitCode = -1
      session.endTime = Date.now()
      session.stderr = this.appendBuffered(session.stderr, `Error: ${err.message}\n`)
      session.process = null
    })

    this.sessions.set(id, session)
    return id
  }

  /** 获取会话，不存在返回 null */
  get(id: string): ProcessSession | null {
    return this.sessions.get(id) ?? null
  }

  /** 列出所有会话 */
  list(): ProcessSession[] {
    return Array.from(this.sessions.values())
  }

  /** 向进程发送 stdin 数据（不带换行） */
  write(id: string, data: string): boolean {
    const session = this.sessions.get(id)
    if (!session || !session.process || session.done) return false
    session.process.stdin?.write(data)
    return true
  }

  /** 向进程发送 stdin 数据 + 换行（用于回应提示） */
  submit(id: string, data: string): boolean {
    return this.write(id, data + '\n')
  }

  /** 关闭 stdin（发送 EOF） */
  closeStdin(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session || !session.process || session.done) return false
    session.process.stdin?.end()
    return true
  }

  /** 终止进程: SIGTERM → KILL_GRACE_MS → SIGKILL */
  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session || session.done) return
    const child = session.process
    if (!child) return

    child.kill('SIGTERM')
    setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* 可能已经退出 */ }
    }, KILL_GRACE_MS)
  }

  /** 移除会话（已结束的才能移除） */
  remove(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    if (!session.done) {
      this.kill(id)
      // 标记为强制移除
      session.done = true
      session.exitCode = session.exitCode ?? -1
      session.endTime = Date.now()
    }
    return this.sessions.delete(id)
  }

  /** 滚动输出缓冲：超过 MAX_OUTPUT_BYTES 时裁剪前半部分 */
  private appendBuffered(existing: string, incoming: string): string {
    const combined = existing + incoming
    if (combined.length <= MAX_OUTPUT_BYTES) return combined
    // 保留后半部分
    return combined.slice(combined.length - MAX_OUTPUT_BYTES)
  }
}

/** 全局单例 */
export const processRegistry = new ProcessRegistry()
