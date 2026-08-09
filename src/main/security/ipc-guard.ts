import { ipcMain, type IpcMainInvokeEvent } from 'electron'

/**
 * IPC 调用来源校验（安全加固）
 *
 * 背景：sandbox:false + 无 CSP 时 renderer 一旦被 XSS，攻击面=全部 IPC 通道。
 * 这里给所有 ipcMain.handle 加 senderFrame 来源校验——只允许应用内部页面调用，
 * 注入到 renderer 的恶意脚本（iframe/外链/被 XSS 污染的上下文）无法调用任何通道。
 *
 * 校验规则：
 * - prod：senderFrame.url 必须是 file://（打包后 index.html 从本地文件加载）
 * - dev：senderFrame.url 必须是 vite dev server（localhost/127.0.0.1）
 * 其它来源一律拒绝（抛错）。
 */

/** dev 模式 vite dev server 端口（electron-vite 默认 5173） */
const DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173'])

/** 是否可信 renderer 来源 */
export function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderFrame = event.senderFrame
  if (!senderFrame) return false
  const url = senderFrame.url
  if (!url) return false
  // 打包后：file:// 本地加载
  if (url.startsWith('file://')) return true
  // dev：vite dev server
  try {
    return DEV_ORIGINS.has(new URL(url).origin)
  } catch {
    return false
  }
}

/** 断言可信来源（不可信直接抛错——handler 不会执行） */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    const url = event.senderFrame?.url ?? 'unknown'
    throw new Error(`IPC 拒绝未授权调用来源: ${url}`)
  }
}

/** 带来源校验的 handle（替代 ipcMain.handle——所有通道统一走校验） */
export function handleTrusted(channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event)
    return handler(event, ...args)
  })
}
