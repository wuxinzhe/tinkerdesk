<template>
  <div class="sa-form-actions">
    <slot name="prepend" />

    <button
      v-if="primaryText"
      class="sa-form-actions__btn sa-form-actions__btn--primary"
      :disabled="primaryDisabled"
      @click="$emit('primary')"
    >
      {{ primaryLoading ? primaryLoadingText || '保存中…' : primaryText }}
    </button>

    <button
      v-if="cancelText"
      class="sa-form-actions__btn sa-form-actions__btn--subtle"
      :disabled="cancelDisabled"
      @click="$emit('cancel')"
    >
      {{ cancelText }}
    </button>

    <button
      v-if="dangerText"
      class="sa-form-actions__btn sa-form-actions__btn--danger"
      :disabled="dangerDisabled"
      @click="$emit('danger')"
    >
      {{ dangerText }}
    </button>

    <slot name="append" />
  </div>
</template>

<script setup lang="ts">
interface SaFormActionsProps {
  primaryText?: string
  primaryLoading?: boolean
  primaryLoadingText?: string
  primaryDisabled?: boolean
  cancelText?: string
  cancelDisabled?: boolean
  dangerText?: string
  dangerDisabled?: boolean
}

withDefaults(defineProps<SaFormActionsProps>(), {
  primaryText: '保存',
  cancelText: '取消',
})

defineEmits<{
  primary: []
  cancel: []
  danger: []
}>()
</script>

<style scoped>
.sa-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  align-items: center;
}
.sa-form-actions__btn {
  all: unset;
  cursor: pointer;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.sa-form-actions__btn:disabled { opacity: 0.5; cursor: default; }
.sa-form-actions__btn--primary {
  background: var(--sa-accent, #007aff);
  color: #fff;
}
.sa-form-actions__btn--subtle {
  color: var(--sa-text-primary, #1d1d1f);
  border: 1px solid var(--sa-border, #d2d2d7);
}
.sa-form-actions__btn--danger {
  margin-left: auto;
  color: var(--sa-destructive, #ff3b30);
  border: 1px solid var(--sa-destructive, #ff3b30);
}
</style>
