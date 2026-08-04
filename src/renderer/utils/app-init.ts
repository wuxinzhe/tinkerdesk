/**
 * app-init.ts — Application Host 级别初始化
 *
 * 在 App.vue 的 setup 中调用 setupAppHost()，完成：
 *   1. 注册全局错误处理器（onerror + unhandledrejection）
 *   2. 注册键盘快捷键（Ctrl+Shift+D 切换 debug 模式）
 *   3. 返回 consent 状态信号，供 UI 层弹窗
 *
 * 用法：
 *   import { setupAppHost } from '@/renderer/utils/app-init'
 *   const { needsConsent, consentError } = setupAppHost()
 */

import { log } from './logger'
import { errorReporter } from './error-reporter'
import { ref } from 'vue'
import { toolRegistry } from '@/services/registry/tool-registry'
import { readIndexDbTool } from '@/tools/shared/read-indexdb'

// ── 全局状态（响应式，供 UI 绑定）──

/** 是否需要用户同意错误上报 */
export const needsConsent = ref(false)

/** 待展示的错误摘要（用于 consent 弹窗文案） */
export const consentErrorSummary = ref('')

// ── 初始化 ──

export function setupAppHost() {
  log.info('AppHost', '初始化 Application Host')

  // ── 1. 全局错误处理器 ──

  window.onerror = (message, source, lineno, colno, error) => {
    const msg = typeof message === 'string' ? message : String(message)
    const detail = error?.message || msg
    errorReporter.capture('crash', detail, {
      source: source || '',
      line: String(lineno ?? ''),
      col: String(colno ?? ''),
    })
    _checkConsent(detail)

    // 返回 true 阻止默认浏览器错误弹窗
    return true
  }

  window.onunhandledrejection = (event) => {
    const reason = event.reason
    const msg = reason?.message || reason?.toString() || String(reason)
    errorReporter.capture('unhandledrejection', msg)
    _checkConsent(msg)
  }

  // ── 2. 键盘快捷键 ──

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
      e.preventDefault()
      log.toggle()
    }
  })

  // ── 3. 注册内置共享工具 ──
  toolRegistry.registerSharedTool(readIndexDbTool)
  log.info('AppHost', 'Shared tools registered')

  log.info('AppHost', 'Application Host 初始化完成')

  return {
    needsConsent,
    consentErrorSummary,
  }
}

// ── 内部 ──

function _checkConsent(errorMessage: string) {
  if (errorReporter.needsConsent && !needsConsent.value) {
    needsConsent.value = true
    consentErrorSummary.value = errorMessage.slice(0, 120)
  }
}

/** 用户响应 consent 后调用 */
export function resolveConsent(agreed: boolean) {
  errorReporter.setConsent(agreed)
  needsConsent.value = false
  consentErrorSummary.value = ''
}
