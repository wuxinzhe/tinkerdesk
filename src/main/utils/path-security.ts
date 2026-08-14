/**
 * utils/path-security.ts — 路径安全守卫工具
 *
 * Path-security helpers:
 * - checkSensitivePath: sensitive system-path guard (Windows + Unix)
 * - rejectV4aTraversal：V4A patch 头部 .. traversal 拒绝
 * 被 patch-tool / write-file-tool 共享。
 */
import { resolve } from 'path'

// ── 敏感路径守卫──

const SENSITIVE_PATH_PREFIXES = [
  'C:\\Windows\\', 'C:\\Program Files\\', 'C:\\Program Files (x86)\\',
  'C:\\ProgramData\\', 'C:\\Users\\Default\\',
  '/etc/', '/boot/', '/usr/lib/systemd/', '/private/etc/', '/private/var/'
]

const SENSITIVE_EXACT_PATHS = new Set([
  'C:\\Windows\\System32\\drivers\\etc\\hosts',
  'C:\\pagefile.sys', 'C:\\hiberfil.sys', 'C:\\swapfile.sys',
  '/var/run/docker.sock', '/run/docker.sock'
])

/** Windows 盘符根（C:\ 或 C:/） */
export function isWindowsDriveRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p)
}

/**
 * 敏感路径检查：命中敏感前缀/精确路径/盘符根 → 返回拒绝原因；安全返回 null。
 * _check_sensitive_path（统一用 resolve 规范化）。
 */
export function checkSensitivePath(filepath: string): string | null {
  const normalized = resolve(filepath)
  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
      return `Refusing to write to sensitive system path: ${filepath}\nUse the terminal tool if you need to modify system files.`
    }
  }
  if (SENSITIVE_EXACT_PATHS.has(normalized)) {
    return `Refusing to write to sensitive system path: ${filepath}\nUse the terminal tool if you need to modify system files.`
  }
  if (isWindowsDriveRoot(normalized)) {
    return `Refusing to write to a drive root: ${filepath}`
  }
  return null
}

/**
 * V4A 头部 .. traversal 拒绝：
 * 路径包含 '..' 段 → 返回拒绝原因；安全返回 null。
 */
export function rejectV4aTraversal(v4aPath: string): string | null {
  if (v4aPath.split(/[\\/]/).includes('..')) {
    return (
      `V4A patch header contains '..' traversal: ${JSON.stringify(v4aPath)}. `
      + "Use the agent's cwd-relative path (no '..') or an absolute path in "
      + "'*** Update File:' / '*** Add File:' / '*** Delete File:' / '*** Move File:' headers."
    )
  }
  return null
}
