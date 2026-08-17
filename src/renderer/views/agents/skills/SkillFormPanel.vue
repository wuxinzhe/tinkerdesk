<template>
  <!-- 技能表单公共面板（SkillImportView 与 SkillDetailView 编辑模式共用） -->
  <div class="sfp">
    <!-- 基本信息 -->
    <div class="sfp__section">
      <div class="sfp__label">
        基本信息
      </div>
      <div class="sfp-row">
        <div class="sfp__field">
          <div class="sfp__field-label">
            名称 *
          </div>
          <input :value="model.name" class="sfp__input" placeholder="小写字母/数字/连字符，如: github-auth" @input="set('name', ($event.target as HTMLInputElement).value)" />
        </div>
        <div class="sfp__field">
          <div class="sfp__field-label">
            显示名
          </div>
          <input :value="model.displayName" class="sfp__input" placeholder="如: GitHub 认证" @input="set('displayName', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
      <div class="sfp-row">
        <div class="sfp__field">
          <div class="sfp__field-label">
            分类
          </div>
          <select :value="model.category" class="sfp__input" @change="set('category', ($event.target as HTMLSelectElement).value)">
            <option value="">
              （未分类）
            </option>
            <option v-for="c in categories" :key="c.name" :value="c.name">
              {{ c.displayName || c.name }}
            </option>
          </select>
        </div>
        <div class="sfp__field">
          <div class="sfp__field-label">
            描述 *
          </div>
          <input :value="model.description" class="sfp__input" placeholder="技能做什么" @input="set('description', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
    </div>

    <!-- 正文 -->
    <div class="sfp__section">
      <div class="sfp__label">
        正文 *
      </div>
      <textarea :value="model.body" class="sfp__body" rows="14" spellcheck="false" placeholder="技能正文（Markdown）" @input="set('body', ($event.target as HTMLTextAreaElement).value)"></textarea>
    </div>

    <!-- 高级属性（折叠） -->
    <div class="advanced-section">
      <button class="advanced-toggle" @click="advancedOpen = !advancedOpen">
        <span class="advanced-chevron" :class="{ open: advancedOpen }">▸</span>
        高级属性
      </button>
      <div v-show="advancedOpen" class="advanced-content">
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              版本
            </div>
            <input :value="model.version" class="sfp__input" placeholder="1.0.0" @input="set('version', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              作者
            </div>
            <input :value="model.author" class="sfp__input" @input="set('author', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              标签
            </div>
            <input :value="model.tags" class="sfp__input" placeholder="逗号分隔" @input="set('tags', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              平台
            </div>
            <input :value="model.platforms" class="sfp__input" placeholder="逗号分隔，如: windows,macos" @input="set('platforms', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              依赖
            </div>
            <input :value="model.dependencies" class="sfp__input" placeholder="逗号分隔" @input="set('dependencies', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              必需工具集
            </div>
            <input :value="model.requiresToolsets" class="sfp__input" placeholder="逗号分隔" @input="set('requiresToolsets', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              必需工具
            </div>
            <input :value="model.requiresTools" class="sfp__input" placeholder="逗号分隔" @input="set('requiresTools', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              兼容性（环境要求）
            </div>
            <input :value="model.compatibility" class="sfp__input" placeholder="如: 需要网络访问, 桌面端" @input="set('compatibility', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              允许工具（白名单）
            </div>
            <input :value="model.allowedTools" class="sfp__input" placeholder="逗号分隔，如: terminal,web" @input="set('allowedTools', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              元数据（JSON）
            </div>
            <input :value="model.metadata" class="sfp__input" placeholder='{"key": "value"}' @input="set('metadata', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
          <div class="sfp__field">
            <div class="sfp__field-label">
              工具集回退
            </div>
            <input :value="model.fallbackForToolsets" class="sfp__input" placeholder="逗号分隔" @input="set('fallbackForToolsets', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              工具回退
            </div>
            <input :value="model.fallbackForTools" class="sfp__input" placeholder="逗号分隔" @input="set('fallbackForTools', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              触发词
            </div>
            <input :value="model.triggers" class="sfp__input" placeholder="逗号分隔，如: 装插件,安装插件" @input="set('triggers', ($event.target as HTMLInputElement).value)" />
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              关联技能
            </div>
            <input :value="model.relatedNames ?? ''" class="sfp__input" placeholder="技能名，逗号分隔（嵌套/关联——模型可 skill_view 查看）" @input="set('relatedNames', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <div class="sfp__field" style="margin-bottom: 8px">
          <div class="sfp__field-label">
            触发条件
          </div>
          <textarea :value="model.triggerConditions" class="sfp__textarea" rows="2" spellcheck="false" @input="set('triggerConditions', ($event.target as HTMLTextAreaElement).value)"></textarea>
        </div>
        <div class="sfp-row">
          <div class="sfp__field">
            <div class="sfp__field-label">
              Config（JSON）
            </div>
            <textarea :value="model.config" class="sfp__textarea" rows="2" spellcheck="false" placeholder="[]" @input="set('config', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
          <div class="sfp__field">
            <div class="sfp__field-label">
              环境变量
            </div>
            <textarea :value="model.envVars" class="sfp__textarea" rows="2" spellcheck="false" @input="set('envVars', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </div>
        </div>
        <div class="sfp__field" style="margin-bottom: 8px">
          <div class="sfp__field-label">
            命令
          </div>
          <textarea :value="model.commands" class="sfp__textarea" rows="2" spellcheck="false" @input="set('commands', ($event.target as HTMLTextAreaElement).value)"></textarea>
        </div>
      </div>
    </div>
</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/** 技能表单字段（与后端结构化写入一致） */
export interface SkillFormModel {
  name: string
  displayName: string
  description: string
  category: string
  version: string
  author: string
  license: string
  platforms: string
  tags: string
  dependencies: string
  requiresToolsets: string
  compatibility: string
  allowedTools: string
  metadata: string
  requiresTools: string
  fallbackForToolsets: string
  fallbackForTools: string
  triggers: string
  triggerConditions: string
  /** 关联技能（技能名逗号分隔——保存时按 name 匹配写入关联） */
  relatedNames?: string
  config: string
  envVars: string
  commands: string
  body: string
}

const props = defineProps<{
  model: SkillFormModel
  categories?: Array<{ name: string; displayName?: string }>
}>()

const emit = defineEmits<{ 'update:model': [value: SkillFormModel] }>()

const advancedOpen = ref(false)

function set(field: keyof SkillFormModel, value: string): void {
  emit('update:model', { ...props.model, [field]: value })
}
</script>

<style scoped>
.sfp__section {
  margin-bottom: 14px;
}

.sfp__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  margin-bottom: 8px;
}

.sfp-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.sfp__field {
  flex: 1 1 200px;
  min-width: 0;
}

.sfp__field-label {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-bottom: 4px;
}

.sfp__input {
  width: 100%;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  /* 输入框背景略深于页面/卡片背景——便于辨别边界 */
  background: rgba(0, 0, 0, 0.04);
  color: var(--tk-text-primary);
  outline: none;
  box-sizing: border-box;
}

.sfp__input:focus {
  border-color: var(--tk-accent);
}

/* 深色主题：输入框改用白色半透明叠加（黑半透明在深背景上不可见） */
html[data-theme='dark'] .sfp__input,
html[data-theme='dark'] .sfp__textarea,
html[data-theme='dark'] .sfp__body {
  background: rgba(255, 255, 255, 0.06);
}

.sfp__textarea,
.sfp__body {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  /* 与输入框一致：略深于页面背景 */
  background: rgba(0, 0, 0, 0.04);
  color: var(--tk-text-primary);
  outline: none;
  resize: vertical;
  line-height: 1.5;
  box-sizing: border-box;
}

.sfp__textarea:focus,
.sfp__body:focus {
  border-color: var(--tk-accent);
}

/* 高级折叠（白卡片） */
.advanced-section {
  margin-top: 4px;
  margin-bottom: 14px;
  background: var(--tk-bg-elevated);
  border: 1px solid var(--tk-border-light);
  border-radius: 10px;
  overflow: hidden;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  background: transparent;
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  text-align: left;
}

.advanced-toggle:hover {
  color: var(--tk-accent);
}

.advanced-chevron {
  font-size: 10px;
  transition: transform 0.18s;
  display: inline-block;
}

.advanced-chevron.open {
  transform: rotate(90deg);
}

.advanced-content {
  padding: 4px 12px 12px;
}
</style>
