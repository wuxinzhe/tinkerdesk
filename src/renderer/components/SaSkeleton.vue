<template>
  <!-- 矩形占位 -->
  <div
    v-if="variant === 'rect'"
    class="sa-skeleton sa-skeleton--rect"
    :style="{ width, height, borderRadius: radius }"
  />
  <!-- 圆形占位 -->
  <div
    v-else-if="variant === 'circle'"
    class="sa-skeleton sa-skeleton--circle"
    :style="{ width: circleSize, height: circleSize }"
  />
  <!-- 多行文本占位 -->
  <div v-else-if="variant === 'text'" class="sa-skeleton-text">
    <div
      v-for="i in textLines"
      :key="i"
      class="sa-skeleton sa-skeleton--rect sa-skeleton--line"
      :class="{ 'sa-skeleton--line-last': i === textLines }"
      :style="{
        width: i === textLines && lastLineWidth ? lastLineWidth : '100%',
        height: lineHeight,
      }"
    />
  </div>
</template>

<script setup lang="ts">
interface SaSkeletonProps {
  variant?: 'rect' | 'circle' | 'text'
  /** rect 宽度，默认 100% */
  width?: string
  /** rect 高度 */
  height?: string
  /** rect 圆角，默认 6px */
  radius?: string
  /** circle 尺寸，默认 35px */
  circleSize?: string
  /** text 行数，默认 1 */
  textLines?: number
  /** 最后一行的宽度百分比，默认 60% */
  lastLineWidth?: string
  /** text 行高，默认 12px */
  lineHeight?: string
}

withDefaults(defineProps<SaSkeletonProps>(), {
  variant: 'rect',
  width: '100%',
  height: '16px',
  radius: '6px',
  circleSize: '35px',
  textLines: 1,
  lastLineWidth: '60%',
  lineHeight: '12px',
})
</script>

<style scoped>
.sa-skeleton {
  display: block;
  background: var(--sa-skeleton-bg, var(--sa-border, #e8e8ed));
  border-radius: 6px;
  animation: sa-skeleton-shimmer 1.5s ease-in-out infinite;
}

.sa-skeleton--rect {
  /* size controlled via inline style */
}

.sa-skeleton--circle {
  border-radius: 50%;
}

/* ── 文本行容器 ── */
.sa-skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.sa-skeleton--line {
  border-radius: 4px;
}

/* ── Shimmer 动画 ── */
@keyframes sa-skeleton-shimmer {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}
</style>
