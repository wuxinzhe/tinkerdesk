<template>
  <div class="sa-form-group">
    <label v-if="label || $slots.label" class="sa-form-group__label">
      <slot name="label">{{ label }}</slot>
      <span v-if="required" class="sa-form-group__required">*</span>
    </label>
    <div class="sa-form-group__control">
      <slot />
    </div>
    <p v-if="error" class="sa-form-group__error">{{ error }}</p>
    <p v-if="hint && !error" class="sa-form-group__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
interface SaFormGroupProps {
  label?: string
  required?: boolean
  error?: string
  hint?: string
}

defineProps<SaFormGroupProps>()
</script>

<style scoped>
.sa-form-group {
  margin-bottom: 12px;
}
.sa-form-group__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
  margin-bottom: 4px;
}
.sa-form-group__required {
  color: var(--tk-destructive);
  margin-left: 2px;
}
.sa-form-group__error {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--tk-destructive);
}
.sa-form-group__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}
</style>
