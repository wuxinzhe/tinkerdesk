/**
 * notification-utils.ts — 全局通知/错误提示统一入口
 *
 * 不再使用 naive-ui 的 notification（n-notification-provider 已废弃）。
 * 所有提示统一派发 window 'global-tip' 事件 → GlobalTipToast（App.vue 全局组件）：
 *   - showInfoToast  → type: 'tip'   （普通通知，浅色样式）
 *   - showErrorToast → type: 'error' （错误提示，红色样式）
 * 两种类型共用队列，弹出时按类型区分 UI。
 */

interface ErrorNotification {
  /** 错误码，如 LLM_FAILED、SERVER_BUSY、EVENT_ERROR、MSG_TOO_LARGE */
  code: string
  /** 用户友好的错误描述（可能较长） */
  message: string
}

/**
 * 显示一个全局错误提示（红色样式，进入 GlobalTipToast 队列）。
 * 长消息截断展示，完整内容由组件 word-break 处理。
 */
export function showErrorToast(err: ErrorNotification): void {
  const { code, message } = err
  window.dispatchEvent(new CustomEvent('global-tip', {
    detail: { type: 'error', code, message: sanitizeErrorMessage(message) }
  }))
}

/**
 * 显示一个普通通知提示（浅色样式，进入 GlobalTipToast 队列）。
 * 与 main 的 agent:queueTip 出口（ElectronEventSender.sendTips）同一队列。
 */
export function showInfoToast(message: string): void {
  if (!message) return
  window.dispatchEvent(new CustomEvent('global-tip', {
    detail: { type: 'tip', message }
  }))
}

/**
 * 对内部错误信息做裁剪，只展示用户友好的部分。
 */
function sanitizeErrorMessage(message: string): string {
  // JDBC/SQL 类错误 — 只取简短描述
  if (message.startsWith('PreparedStatementCallback')) {
    return '服务内部错误，请稍后重试'
  }
  return message
}
