<template>
  <section class="sa-section">
    <div v-if="title || $slots.title" class="sa-section__header">
      <h3 class="sa-section__title">{{ title }}</h3>
      <slot name="title" />
    </div>
    <p v-if="subtitle" class="sa-section__subtitle">{{ subtitle }}</p>
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
  margin-bottom: 24px;
}
.sa-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sa-section__title {
  margin: 0;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--sa-text-tertiary, #aeaeb2);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  user-select: none;
}
.sa-section__subtitle {
  margin: 0 0 12px;
  padding: 0 4px;
  font-size: 13px;
  color: var(--sa-text-tertiary, #aeaeb2);
  line-height: 1.5;
}
.sa-section__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.sa-section__body--card {
  background: var(--sa-bg-primary, #ffffff);
  border: 1px solid var(--sa-border-light, #e8e8ed);
  border-radius: 8px;
  overflow: hidden;
}
</style>
