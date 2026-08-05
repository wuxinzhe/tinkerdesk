/**
 * ipc-handlers.ts — 主进程
 * 注册所有工具的 IPC handler。
 *
 * 工具执行链路日志（关键节点）：
 * - 入口：tool.id + 入参摘要（脱敏：长字符串只打长度，对象/数组只打规模）
 * - 出口：ok/error + 耗时 ms + data 长度 + 前 300 字符预览
 * - 异常：THREW + 错误消息（不再吞掉异常）
 */
import { ipcMain, BrowserWindow } from 'electron'
import { allDesktopTools } from '../tools/desktop/manifest'
import type { BaseTool } from '../tools/desktop/index'
import {nowDb, nowIso, nowTs, todayDate} from './utils/time'

/** 工具链路日志：主进程 console + 转发到所有 renderer（CDP 控制台可见） */
function logTool(line: string): void {
  console.log(line)
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('tool:log', line)
    }
  } catch {
    // 窗口尚未就绪时忽略转发失败，主进程日志仍在
  }
}

/**
 * 入参脱敏摘要：
 * - 字符串 ≤120 字符打印完整，否则只打长度（防密钥/大内容泄漏）
 * - 数组/对象只打规模
 * - 数值/布尔打原值
 */
function summarizeParams(params: unknown): string {
  if (params === null || params === undefined) return String(params)
  if (typeof params !== 'object') {
    const s = String(params)
    return s.length > 300 ? `"<str len=${s.length}>"` : JSON.stringify(s)
  }
  const obj = params as Record<string, unknown>
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) {
      parts.push(`${k}=null`)
    } else if (typeof v === 'string') {
      parts.push(v.length > 120 ? `${k}="<str len=${v.length}>"` : `${k}="${v}"`)
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${v}`)
    } else if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length} items]`)
    } else {
      parts.push(`${k}={object}`)
    }
  }
  return `{${parts.join(', ')}}`
}

/** 出参摘要：ok/error + data 长度 + 前 300 字符预览 */
function summarizeResult(result: { ok: boolean; data?: string; error?: string }): string {
  const parts: string[] = []
  if (!result.ok && result.error) {
    parts.push(`error="${result.error.length > 300 ? result.error.slice(0, 300) + '…' : result.error}"`)
  }
  if (result.data) {
    const preview = result.data.length > 300 ? result.data.slice(0, 300) + '…' : result.data
    parts.push(`data=<len=${result.data.length}> "${preview.replace(/\n/g, '\\n')}"`)
  }
  return parts.join(' ')
}

export function registerToolHandlers(): void {
  for (const tool of allDesktopTools) {
    ipcMain.handle(`tool:${tool.id}`, async (_event, params: unknown) => {
      const start = nowTs()
      //logTool(`[tool] => ${tool.id} params=${summarizeParams(params)}`)
      try {
        const result = await tool.execute(params)
        const ms = nowTs() - start
        //logTool(`[tool] <= ${tool.id} ok=${result.ok} ms=${ms} ${summarizeResult(result)}`)
        return result
      } catch (err: any) {
        const ms = nowTs() - start
        const msg = err instanceof Error ? err.message : String(err)
        //logTool(`[tool] <= ${tool.id} THREW ms=${ms} error=${msg}`)
        return { ok: false, error: msg }
      }
    })
  }
}

/** 返回所有已注册工具的定义（含 schema） */
export function getRegisteredTools(): ReturnType<BaseTool['getDefinition']>[] {
  return allDesktopTools.map(t => t.getDefinition())
}
