<template>
  <div class="sa-page-hero">
    <div class="sa-page-hero__icon" :style="{ background: gradient }">
      <span v-html="icon"></span>
    </div>
    <div class="sa-page-hero__text">
      <h1 class="sa-page-hero__title">{{ title }}</h1>
      <p v-if="desc" class="sa-page-hero__desc">{{ desc }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SaPageHero.vue — L3 页头（iOS Settings 风格：彩色渐变图标徽章 + 标题）
 * 所有 L3 页统一使用——icon 传白色 SVG 字符串，gradient 传 CSS 渐变。
 */
interface SaPageHeroProps {
  /** 白色 SVG 图标（stroke=currentColor） */
  icon: string
  /** CSS 渐变，如 'linear-gradient(135deg, var(--tk-accent) 0%, #0055cc 100%)' */
  gradient: string
  title: string
  desc?: string
}

defineProps<SaPageHeroProps>()
</script>

<style scoped>
.sa-page-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}
.sa-page-hero__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
}
.sa-page-hero__icon :deep(svg) {
  display: block;
}
.sa-page-hero__title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: var(--tk-text-primary);
  letter-spacing: -0.5px;
  line-height: 1.1;
}
.sa-page-hero__desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--tk-text-tertiary);
}

/* ── 自适应：手机压缩 hero（图标/标题/间距） ── */
@media (max-width: 767px) {
  .sa-page-hero {
    gap: 12px;
    margin-bottom: 20px;
  }
  .sa-page-hero__icon {
    width: 44px;
    height: 44px;
    border-radius: 13px;
  }
  .sa-page-hero__icon :deep(svg) {
    width: 20px;
    height: 20px;
  }
  .sa-page-hero__title {
    font-size: 20px;
    letter-spacing: -0.3px;
  }
  .sa-page-hero__desc {
    font-size: 12px;
  }
}

/* 平板（768–1023px）：图标微缩 */
@media (min-width: 768px) and (max-width: 1023px) {
  .sa-page-hero__icon {
    width: 50px;
    height: 50px;
  }
}
</style>
