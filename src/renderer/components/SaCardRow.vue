<template>
  <div class="sa-card-row" @click="$emit('click')">
    <!-- Avatar / icon -->
    <div v-if="$slots.prepend || avatar" class="sa-card-row__prepend">
      <slot name="prepend">
        <img v-if="typeof avatar === 'string'" :src="avatar" alt="" class="sa-card-row__avatar-img" />
        <div v-else class="sa-card-row__avatar-icon"><slot name="avatar-fallback" /></div>
      </slot>
    </div>

    <!-- Body: title + meta + description -->
    <div class="sa-card-row__body">
      <div class="sa-card-row__top">
        <span class="sa-card-row__title">{{ title }}</span>
        <SaBadge v-if="badge" :variant="badgeVariant" :text="badge" />
      </div>
      <div v-if="meta || $slots.meta" class="sa-card-row__meta">
        <slot name="meta"><span>{{ meta }}</span></slot>
      </div>
      <div v-if="description && !$slots.default" class="sa-card-row__desc">{{ description }}</div>
      <div v-else-if="$slots.default" class="sa-card-row__extra">
        <slot />
      </div>
    </div>

    <!-- Actions -->
    <div v-if="$slots.actions" class="sa-card-row__actions" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SaBadge from './SaBadge.vue'
import type { SaBadgeVariant } from './SaBadge.vue'

interface SaCardRowProps {
  avatar?: string
  title?: string
  meta?: string
  description?: string
  badge?: string
  badgeVariant?: SaBadgeVariant
}

withDefaults(defineProps<SaCardRowProps>(), {
  badgeVariant: 'default',
})

defineEmits<{ click: [] }>()
</script>

<style scoped>
.sa-card-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  /* emil：指定属性 + 强 ease-out；行间分隔线（iOS 分组列表风格） */
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  user-select: none;
}
.sa-card-row:not(:last-child) {
  border-bottom: 1px solid var(--tk-border-light);
}
.sa-card-row:active {
  transform: scale(0.99);
}
@media (hover: hover) and (pointer: fine) {
  .sa-card-row:hover {
    background: var(--tk-bg-secondary);
  }
}
/* 自适应：手机压缩行高 */
@media (max-width: 767px) {
  .sa-card-row {
    padding: 10px 12px;
  }
}
/* ── Prepend (avatar/icon) ── */
.sa-card-row__prepend {
  flex-shrink: 0;
}
.sa-card-row__avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
}
.sa-card-row__avatar-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 12px;
}
/* ── Body ── */
.sa-card-row__body {
  flex: 1;
  min-width: 0;
}
.sa-card-row__top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.sa-card-row__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sa-card-row__meta {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}
.sa-card-row__desc {
  font-size: 11px;
  color: var(--tk-text-secondary);
  line-height: 1.4;
}
.sa-card-row__extra {
  font-size: 12px;
  color: var(--tk-text-primary);
}
/* ── Actions ── */
.sa-card-row__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>
