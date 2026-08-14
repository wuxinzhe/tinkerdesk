/**
 * shell-utils.ts — Shell 工具函数
 *
 * tools/desktop/common/shell-utils.ts：
 * 根据运行平台返回适当的 shell 命令和参数。
 * 被 terminal 和 process-registry 共同使用。
 */
import type { ShellExec } from './types'

/** 根据平台返回对应的 shell 命令和前缀参数 */
export function getShellExec(): ShellExec {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', prefix: ['/c'] }
  }
  return { command: 'bash', prefix: ['-c'] }
}
