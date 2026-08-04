/**
 * write-file.ts — 客户端工具
 *
 * 一比一复刻 Hermes write_file_tool：
 * - 参数 path + content（对齐 Hermes，替代原 filePath）
 * - 敏感系统路径守卫（Windows 版：C:\Windows\ 等）
 * - read_file 行号内容拒绝（防止把 "N|content" 显示文本写进文件）
 * - 自动创建父目录，返回 bytes_written / dirs_created / resolved_path
 * - 返回 JSON 字符串（对齐 Hermes WriteResult.to_dict：null 字段过滤）
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname, normalize, sep } from 'path'
import { Buffer } from 'buffer'
import { BaseTool } from '../index'
import type { ToolResult, AvailabilityResult, ToolSchema } from '../index'

import type { WriteFileParams } from '@/defines/tools/params'

// ── 敏感路径守卫（对齐 Hermes _SENSITIVE_PATH_PREFIXES，Windows 化）──

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

function isWindowsDriveRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p)
}

function checkSensitivePath(filepath: string): string | null {
  const normalized = normalize(filepath)
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

// ── read_file 行号内容拒绝（对齐 Hermes _looks_like_read_file_line_numbered_content）──

function looksLikeReadFileLineNumberedContent(content: string): boolean {
  if (typeof content !== 'string') return false
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return false

  const numbered: number[] = []
  for (const line of lines) {
    const stripped = line.replace(/^\s+/, '')
    const sepIdx = stripped.indexOf('|')
    const prefix = sepIdx >= 0 ? stripped.slice(0, sepIdx) : ''
    if (sepIdx >= 0 && /^\d+$/.test(prefix)) {
      numbered.push(parseInt(prefix, 10))
    }
  }
  if (numbered.length < 2) return false
  if (numbered.length / lines.length < 0.6) return false

  let consecutivePairs = 0
  for (let i = 0; i < numbered.length - 1; i++) {
    if (numbered[i + 1] === numbered[i] + 1) consecutivePairs++
  }
  return consecutivePairs >= numbered.length - 1
}

// ── 工具类 ──

export class WriteFileTool extends BaseTool<WriteFileParams> {
  readonly id = 'desktop_showing_write_file'
  readonly name = '文件写入'
  readonly description = 'Write content to a file, completely replacing existing content. Creates parent directories automatically.'
  readonly category = 'file'

  getSchema(): ToolSchema {
    return {
      type: 'function',
      function: {
        name: 'desktop_showing_write_file',
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The absolute or relative path to the file to write'
            },
            content: {
              type: 'string',
              description: 'The content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      toolType: 'desktop',
      emoji: '📝'
    }
  }

  async checkAvailability(): Promise<AvailabilityResult> {
    return { available: true }
  }

  async execute(params: WriteFileParams): Promise<ToolResult> {
    const result: Record<string, unknown> = {}
    try {
      // 对齐 Hermes：path + content 必填
      const pathStr = (params.path ?? '').trim()
      if (!pathStr) {
        return { ok: false, error: 'path 不能为空' }
      }
      const content = params.content ?? ''

      // 敏感路径守卫（对齐 Hermes _check_sensitive_path）
      const sensitiveErr = checkSensitivePath(pathStr)
      if (sensitiveErr) {
        return { ok: false, error: sensitiveErr }
      }

      // read_file 行号内容拒绝（对齐 Hermes _is_internal_file_tool_content）
      if (looksLikeReadFileLineNumberedContent(content)) {
        return {
          ok: false,
          error: 'Refusing to write internal read_file display text as file content. '
            + 'Strip read_file line-number prefixes or reconstruct the intended file contents before writing.'
        }
      }

      const resolvedPath = resolve(pathStr)
      const dir = dirname(resolvedPath)
      let dirsCreated = false
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        dirsCreated = true
      }
      writeFileSync(resolvedPath, content, 'utf-8')

      // 对齐 Hermes WriteResult.to_dict + resolved_path/files_modified
      result['bytes_written'] = Buffer.byteLength(content, 'utf-8')
      result['dirs_created'] = dirsCreated
      result['resolved_path'] = resolvedPath
      result['files_modified'] = [resolvedPath]

      return { ok: true, data: JSON.stringify(result) }
    } catch (err: any) {
      return { ok: false, error: `写入文件失败: ${err.message}` }
    }
  }
}

/** 单例实例 */
export const writeFileTool = new WriteFileTool()
