/**
 * confirm.ts — 全局确认弹窗的命令式调用（Promise 风格）
 *
 * 用法：
 *   import { confirm } from '@/renderer/api/confirm'
 *   const ok = await confirm({ title: '卸载插件？', message: '…', confirmText: '卸载', destructive: true })
 *   if (!ok) return
 *
 * 依赖全局组件 ConfirmModal（App.vue 挂载，监听 'global-confirm' 事件）。
 */
export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 确认按钮红色（危险操作） */
  destructive?: boolean
}

/** 弹出确认弹窗，返回用户是否确认 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent('global-confirm', {
        detail: { ...options, resolve },
      }),
    )
  })
}
