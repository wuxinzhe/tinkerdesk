/**
 * useTypewriter.ts — 打字机式平滑渲染 composable
 *
 * 解决 LLM SSE 推流不均匀（150~900ms/包、每包 1~11 字符）导致的"一跳一跳"：
 * 原始文本（raw）按到达实时更新；本平滑器以固定节奏（charsPerTick / tickMs）
 * 逐步吐出显示文本（displayed），包间隙也能持续流动，视觉连续。
 *
 * 用法：
 *   const raw = computed(() => store.buffer)
 *   const { displayed, fastForward } = useTypewriter(raw)
 *   watch(isStreaming, (v) => { if (!v) fastForward() })  // 流式结束快进到完整
 */
import { ref, watch, onUnmounted, type Ref } from 'vue'

interface TypewriterOptions {
  /** 每 tick 吐出字符数 */
  charsPerTick?: number
  /** tick 间隔（ms） */
  tickMs?: number
}

export function useTypewriter(raw: Ref<string>, opts: TypewriterOptions = {}) {
  const charsPerTick = opts.charsPerTick ?? 2
  const tickMs = opts.tickMs ?? 30
  const displayed = ref('')
  let shown = 0
  let timer: ReturnType<typeof setInterval> | null = null

  /** 开始/重启平滑（raw 有新内容时由 watch 触发） */
  function start(): void {
    if (timer) return
    timer = setInterval(() => {
      shown = Math.min(shown + charsPerTick, raw.value.length)
      displayed.value = raw.value.slice(0, shown)
      // 吐完当前内容 → 暂停，等 watch 检测到新内容再重启
      if (shown >= raw.value.length) {
        if (timer) clearInterval(timer)
        timer = null
      }
    }, tickMs)
  }

  watch(raw, (val) => {
    // 新内容到达且当前已暂停 → 重启平滑
    if (val.length > shown) start()
  }, { immediate: true })

  /** 快进：立即显示全部（流式结束 / 用户点击跳过时调用） */
  function fastForward(): void {
    if (timer) clearInterval(timer)
    timer = null
    shown = raw.value.length
    displayed.value = raw.value
  }

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { displayed, fastForward }
}
