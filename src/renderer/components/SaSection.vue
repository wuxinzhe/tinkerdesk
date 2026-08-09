<template>
  <section class="sa-section">
    <div v-if="title || $slots.title" class="sa-section__header">
      <h3 class="sa-section__title">
        {{ title }}
      </h3>
      <slot name="title" />
    </div>
    <p v-if="subtitle" class="sa-section__subtitle">
      {{ subtitle }}
    </p>
    <div v-if="$slots.toolbar" class="sa-section__toolbar">
      <slot name="toolbar" />
    </div>
    <div class="sa-section__body" :class="{ 'sa-section__body--card': card }">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
interface SaSectionProps {
  title?: string
  subtitle?: string
  /** 套卡片样式（border-radius + bg + border） */
  card?: boolean
}

withDefaults(defineProps<SaSectionProps>(), {
  card: true,
})
</script>

<style scoped>
.sa-section {
  margin-bottom: 28px;
}
.sa-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 2px;
}
.sa-section__title {
  margin: 0;
  padding: 0;
  /* emil：现代分组标题——常规大小写 + 清晰层级（替代大写小标签） */
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-text-primary);
  letter-spacing: 0;
  text-transform: none;
  user-select: none;
}
.sa-section__subtitle {
  margin: 2px 0 12px;
  padding: 0 2px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
  line-height: 1.5;
}
.sa-section__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.sa-section__body--card {
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影（浮起而非框住）+ 极淡边框 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
  overflow: hidden;
}

/* 自适应：手机压缩间距 */
@media (max-width: 767px) {
  .sa-section {
    margin-bottom: 20px;
  }
}
</style>
