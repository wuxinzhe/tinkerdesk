/**
 * use-mobile.ts — 响应式手机模式检测 composable
 *
 * 基于 window.matchMedia('(max-width: 767px)') 监听视图宽度变化。
 * 与 WorkspaceView 的 viewMode 检测不同：此处只检查窄屏阈值，
 * 不涉及 tablet/desktop 三态判断。
 *
 * 用法：
 *   const isMobile = useMobile()
 *   watch(isMobile, (v) => { ... })
 */

import { ref, onMounted, onUnmounted } from 'vue'

const MOBILE_QUERY = '(max-width: 767px)'

/** 响应式的 isMobile ref，窗口缩放时自动更新 */
export function useMobile() {
  const isMobile = ref(false)

  let mql: MediaQueryList | null = null
  let handler: ((e: MediaQueryListEvent) => void) | null = null

  onMounted(() => {
    mql = window.matchMedia(MOBILE_QUERY)
    isMobile.value = mql.matches

    handler = (e: MediaQueryListEvent) => {
      isMobile.value = e.matches
    }
    mql.addEventListener('change', handler)
  })

  onUnmounted(() => {
    if (mql && handler) {
      mql.removeEventListener('change', handler)
    }
  })

  return isMobile
}
