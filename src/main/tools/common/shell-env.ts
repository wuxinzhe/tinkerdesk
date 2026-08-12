/**
 * shell-env.ts — Shell 方言环境探测与 spawn 构建（terminal 工具 + process-registry 共用）
 *
 * 内置 shell provider（cmd / bash / powershell）：
 * - cmd：Windows 原生——恒可用——启动时 chcp 65001 切 UTF-8（防中文乱码）
 * - bash：win32 靠 git-bash（which bash 探测）/ darwin/linux 原生
 * - powershell：win32 原生（schema 枚举可选）
 */
import { execFileSync } from 'child_process'

export type TerminalShell = 'cmd' | 'bash' | 'powershell'

/** 各 shell 语法提示（注入动态 schema 描述——LLM 生成命令时看到） */
export const SHELL_HINTS: Record<TerminalShell, string> = {
  cmd: 'cmd (Windows 原生): dir/type/echo/findstr——反斜杠路径 C:\\xxx——环境变量 %VAR%——多行连接用 ^',
  bash: 'bash (POSIX): ls/cat/grep/echo——/c/xxx 路径——环境变量 $VAR——管道 | 和 && 可用',
  powershell: 'powershell: Get-ChildItem/Get-Content——对象管道——cmdlet 命名 Verb-Noun',
}

/** 探测可执行文件是否存在（where / which） */
function shellExists(name: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

/** 检测当前机器可用的 shell（cmd Windows 恒有——bash 装 git 才有 / 非 Windows 原生） */
export function detectAvailableShells(): TerminalShell[] {
  if (process.platform === 'win32') {
    const shells: TerminalShell[] = ['cmd']
    if (shellExists('bash')) shells.push('bash')
    return shells
  }
  return ['bash']
}

/** 解析 shell 参数（'auto' 或未指定 → 探测链第一个可用） */
export function resolveShell(shell?: string): TerminalShell {
  if (shell === 'cmd' || shell === 'bash' || shell === 'powershell') return shell
  const available = detectAvailableShells()
  return available[0] ?? (process.platform === 'win32' ? 'cmd' : 'bash')
}

/** 构建 spawn 参数（cmd 先 chcp 65001 切 UTF-8——统一 utf8 解码防中文乱码） */
export function buildShellSpawn(shell: TerminalShell, cmd: string): { command: string; args: string[] } {
  if (shell === 'cmd') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', `chcp 65001 >nul & ${cmd}`] }
  }
  if (shell === 'powershell') {
    return { command: 'powershell.exe', args: ['-NoProfile', '-Command', cmd] }
  }
  return { command: 'bash', args: ['-lc', cmd] }
}
