<template>
  <div class="mcp-form">
    <SaFormGroup label="名称" required class="mcp-form__group">
      <input v-model="form.name" placeholder="如 my-tools" class="mcp-input" />
    </SaFormGroup>
    <SaFormGroup label="传输方式" required class="mcp-form__group">
      <select v-model="form.transport" class="mcp-input" @change="$emit('transport-change', form.transport)">
        <option value="stdio">stdio（子进程）</option>
        <option value="http">HTTP</option>
      </select>
    </SaFormGroup>
    <template v-if="form.transport === 'stdio'">
      <SaFormGroup label="命令" required class="mcp-form__group">
        <input v-model="form.command" placeholder="npx / node / python" class="mcp-input" />
      </SaFormGroup>
      <SaFormGroup label="参数" class="mcp-form__group">
        <input v-model="form.argsStr" placeholder="--arg1 value1 --arg2 value2" class="mcp-input" />
      </SaFormGroup>
    </template>
    <template v-else>
      <SaFormGroup label="URL" required class="mcp-form__group">
        <input v-model="form.url" placeholder="https://..." class="mcp-input" />
      </SaFormGroup>
    </template>

    <!-- 底部操作区 -->
    <div class="mcp-form__actions">
      <slot />
    </div>

    <p v-if="errorMessage" class="mcp-form__error">{{ errorMessage }}</p>
  </div>
</template>

<script setup lang="ts">
import { SaFormGroup } from '@/renderer/components'

defineProps<{
  form: {
    name: string
    transport: 'stdio' | 'http'
    command: string
    argsStr: string
    url: string
  }
  errorMessage?: string
}>()

defineEmits<{
  'transport-change': [transport: 'stdio' | 'http']
}>()
</script>

<style scoped>
.mcp-form {
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 清除 SaFormGroup 自身 margin，用 gap 控制 */
.mcp-form :deep(.sa-form-group) {
  margin-bottom: 0;
}

.mcp-form__group {
  flex: 1;
  min-width: 0;
}

.mcp-input {
  display: block;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  background: var(--sa-bg-primary, #fff);
  color: var(--sa-text-primary, #1d1d1f);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.mcp-input:focus {
  border-color: var(--sa-accent, #007aff);
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.10);
}

.mcp-input::placeholder {
  color: var(--sa-text-tertiary, #aeaeb2);
}

.mcp-form__actions {
  margin-top: 8px;
}

.mcp-form__error {
  margin: 4px 0 0;
  font-size: 12px;
  color: #ff3b30;
}
</style>
