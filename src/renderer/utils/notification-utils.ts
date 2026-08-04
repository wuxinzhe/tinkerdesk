/**
 * notification-utils.ts — 全局错误气泡提示 & 信息通知
 *
 * 使用 Naive UI 的 createDiscreteApi，可在 Pinia store / 非组件代码中直接调用。
 * 两种类型：
 *   - Error 弹窗：红色、永久显示、带关闭按钮、长消息可展开查看详情
 *   - Tips 弹窗：灰色、3 秒自动消失、轻量提示
 */
import { createDiscreteApi } from 'naive-ui'
import { h } from 'vue'

const { notification, dialog } = createDiscreteApi(['notification', 'dialog'])

interface ErrorNotification {
  /** 错误码，如 LLM_FAILED、SERVER_BUSY、EVENT_ERROR、MSG_TOO_LARGE */
  code: string
  /** 用户友好的错误描述（可能较长） */
  message: string
}

/** 通知体最大字符数，超出则在通知体截断，可通过「查看详情」展开 */
const MAX_BODY_LENGTH = 120

/**
 * 显示一个全局错误弹窗。
 * - 红色、左上角固定、不会自动消失
 * - 消息超过 120 字时，通知体显示截断版本，附加「查看详情」按钮弹出完整内容
 * - 同一错误码只显示一条，后续同码错误会覆盖更新
 */
export function showErrorToast(err: ErrorNotification): void {
  const { code, message } = err
  const displayMessage = sanitizeErrorMessage(message)
  const isLong = message.length > MAX_BODY_LENGTH

  notification.create({
    type: 'error',
    title: code,
    content: displayMessage,
    duration: 0,                    // 不自动消失，用户手动关闭
    keepAliveOnHover: true,
    closable: true,
    placement: 'top-left',
    action: isLong
    ? () =>
      h(
        'button',
        {
          style: {
            padding: '4px 12px',
            fontSize: '12px',
            color: '#e88080',
            background: 'transparent',
            border: '1px solid #e88080',
            borderRadius: '4px',
            cursor: 'pointer'
          },
          onClick: () => {
            dialog.info({
              title: `错误详情 — ${code}`,
              content: message,
              positiveText: '关闭',
              maskClosable: true,
              style: { maxHeight: '60vh', overflow: 'auto' }
            })
          }
        },
        '查看详情'
      )
    : undefined
  })
}

/**
 * 显示一个短暂的信息提示（如"消息已入队"）。
 * 3 秒后自动消失，不需要用户操作。
 */
export function showInfoToast(message: string): void {
  notification.create({
    type: 'info',
    title: '',
    content: message,
    duration: 3000,
    keepAliveOnHover: false,
    closable: true,
    placement: 'top-left'
  })
}

/**
 * 对内部错误信息做裁剪，只展示用户友好的部分。
 * SQL 异常、堆栈等细节只保留在「查看详情」对话框中。
 */
function sanitizeErrorMessage(message: string): string {
  // JDBC/SQL 类错误 — 只取简短描述
  if (message.startsWith('PreparedStatementCallback')) {
    return '服务内部错误，请稍后重试'
  }
  // 超出长度截断
  if (message.length > MAX_BODY_LENGTH) {
    return message.substring(0, MAX_BODY_LENGTH) + '…'
  }
  return message
}
