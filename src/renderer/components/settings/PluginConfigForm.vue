<script setup lang="ts">
/**
 * PluginConfigForm.vue — 插件配置动态表单渲染器
 *
 * 按插件返回的 ConfigSchema 动态渲染表单，UI 不写死任何插件字段。
 * 字段类型：string / secret / number / boolean / select / textarea
 */
import { ref, reactive, watch, onMounted } from 'vue'
import type { ConfigSchema } from '@/renderer/api/types'

const props = defineProps<{
  pluginId: string
  schema: ConfigSchema
  /** 初始配置（secret 已脱敏为 ***） */
  initial: Record<string, unknown>
}>()

const emit = defineEmits<{
  save: [patch: Record<string, unknown>]
}>()

// 动态 schema 表单：值类型由插件字段决定（string/number/boolean），运行时才知道，用宽松类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const form = reactive<Record<string, any>>({})
const loaded = ref(false)

// schema / 初始值变化时重建表单
watch(
  () => [props.schema, props.initial],
  () => {
    rebuild()
  },
  { deep: true }
)

onMounted(() => rebuild())

function rebuild(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next: Record<string, any> = {}
  for (const [key, field] of Object.entries(props.schema.properties ?? {})) {
    const initial = props.initial[key]
    next[key] = initial !== undefined ? initial : field.default ?? (field.type === 'boolean' ? false : '')
  }
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, next)
  loaded.value = true
}

function submit(): void {
  const patch: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(props.schema.properties ?? {})) {
    const value = form[key]
    // secret 未改（***）→ 不提交（保留原值）
    if (field.type === 'secret' && (value === '***' || value === '')) continue
    patch[key] = value
  }
  emit('save', patch)
}

/** file 字段：调系统文件对话框选择（filters 是 Vue 响应式 Proxy，跨 contextBridge 前必须序列化为普通对象） */
async function pickFile(key: string, filters?: { name: string; extensions: string[] }[]): Promise<void> {
  console.log(`[config-form] pickFile 触发: ${key}`)
  try {
    const plain = filters ? JSON.parse(JSON.stringify(filters)) : undefined
    const path = await window.api.plugins.pickFile(plain)
    console.log(`[config-form] pickFile 返回: ${path ?? 'null'}`)
    if (path) form[key] = path
  } catch (e) {
    console.error('[config-form] pickFile 失败:', e)
  }
}
</script>

<template>
  <div class="pcf">
    <div v-for="(field, key) in schema.properties" :key="key" class="pcf__field">
      <label class="pcf__label">
        {{ field.title }}
        <span v-if="field.required" class="pcf__required">*</span>
      </label>

      <!-- boolean：开关 -->
      <label v-if="field.type === 'boolean'" class="pcf__switch">
        <input v-model="form[key]" type="checkbox" />
        <span class="pcf__switch-track"></span>
      </label>

      <!-- select：下拉 -->
      <select v-else-if="field.type === 'select'" v-model="form[key]" class="pcf__input">
        <option v-for="opt in field.options ?? []" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>

      <!-- textarea -->
      <textarea
        v-else-if="field.type === 'textarea'"
        v-model="form[key]"
        class="pcf__input pcf__input--textarea"
        rows="3"
        :placeholder="field.placeholder"
      ></textarea>

      <!-- number -->
      <input
        v-else-if="field.type === 'number'"
        v-model.number="form[key]"
        type="number"
        class="pcf__input"
        :min="field.min"
        :max="field.max"
        :step="field.step ?? 1"
        :placeholder="field.placeholder"
      />

      <!-- file：文件选择（输入框 + 浏览按钮 → 系统对话框） -->
      <div v-else-if="field.type === 'file'" class="pcf__file">
        <input
          v-model="form[key]"
          type="text"
          class="pcf__input"
          :placeholder="field.placeholder ?? '选择文件…'"
          readonly
        />
        <button class="pcf__file-btn" @click="pickFile(key, field.filters)">浏览…</button>
      </div>

      <!-- string / secret -->
      <input
        v-else
        v-model="form[key]"
        :type="field.type === 'secret' ? 'password' : 'text'"
        class="pcf__input"
        :placeholder="field.placeholder"
      />

      <p v-if="field.description" class="pcf__desc">{{ field.description }}</p>
    </div>

    <div class="pcf__actions">
      <button class="pcf__btn" :disabled="!loaded" @click="submit">保存配置</button>
    </div>
  </div>
</template>

<style scoped>
.pcf {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-4, 16px);
}

.pcf__field {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-1, 4px);
}

.pcf__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.pcf__required {
  color: var(--tk-destructive);
  margin-left: 2px;
}

.pcf__input {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--tk-text-primary);
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  outline: none;
  transition: border-color 180ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

.pcf__input:focus {
  border-color: var(--tk-accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.pcf__input--textarea {
  resize: vertical;
  line-height: 1.5;
}

.pcf__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

/* file 字段：输入框 + 浏览按钮 */
.pcf__file {
  display: flex;
  gap: 8px;
}

.pcf__file .pcf__input {
  flex: 1;
  cursor: default;
  color: var(--tk-text-secondary);
}

.pcf__file-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.06);
  border: 1px solid var(--tk-accent);
  border-radius: 8px;
  cursor: pointer;
}

.pcf__file-btn:hover {
  background: rgba(0, 122, 255, 0.12);
}

/* 开关（HIG 风格） */
.pcf__switch {
  position: relative;
  display: inline-flex;
  width: 36px;
  height: 22px;
  cursor: pointer;
}

.pcf__switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.pcf__switch-track {
  position: absolute;
  inset: 0;
  border-radius: 11px;
  background: var(--tk-bg-tertiary);
  transition: background-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.pcf__switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.pcf__switch input:checked + .pcf__switch-track {
  background: var(--tk-accent);
}

.pcf__switch input:checked + .pcf__switch-track::after {
  transform: translateX(14px);
}

.pcf__actions {
  display: flex;
  justify-content: flex-end;
}

.pcf__btn {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #ffffff;
  background: var(--tk-accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.pcf__btn:hover {
  background: var(--tk-accent-hover);
}

.pcf__btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
