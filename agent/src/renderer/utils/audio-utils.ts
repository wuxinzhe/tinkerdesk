/**
 * audio-utils.ts — 音效播放工具
 *
 * 用于播放提示音（如 LLM 消息到达通知）。
 * 通过 HTML5 Audio 播放，兼容浏览器和 Electron 环境。
 */

/** 通知音路径（public/audio/ 目录，打包后位于根路径） */
const NOTIFICATION_SOUND = '/audio/notification.mp3'

let audioCache: HTMLAudioElement | null = null

/**
 * 播放 LLM 消息到达提示音。
 * 缓存 Audio 实例避免重复创建。
 */
export function playMessageNotification(): void {
  try {
    if (!audioCache) {
      audioCache = new Audio(NOTIFICATION_SOUND)
      audioCache.volume = 0.6
    }
    // 重置到开头再播放（防止连续触发时只放一次）
    audioCache.currentTime = 0
    audioCache.play().catch(() => {
      // 浏览器自动播放策略限制，静默忽略
    })
  } catch {
    // 静默忽略
  }
}
