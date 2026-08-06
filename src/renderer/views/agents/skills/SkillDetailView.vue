<template>
  <L3PageLayout class="skill-detail">
    <div class="skill-detail__body" v-if="skill">
      <!-- 头部 -->
      <div class="skill-detail__header">
        <div class="skill-detail__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <div class="skill-detail__heading">
          <h3>{{ skill.displayName || skill.name }}</h3>
          <div class="skill-detail__badges">
            <span v-if="skill.author" class="badge">作者: {{ skill.author }}</span>
            <span v-if="skill.category" class="badge">{{ skill.category }}</span>
            <span v-if="skill.version" class="badge">v{{ skill.version }}</span>
            <span v-if="skill.license" class="badge">{{ skill.license }}</span>
          </div>
        </div>
      </div>

      <!-- 描述 -->
      <div class="detail-section">
        <div class="detail-section__label">描述</div>
        <div class="detail-section__value">{{ skill.description || '-' }}</div>
      </div>

      <!-- Tags -->
      <div v-if="skill.tags?.length" class="detail-section">
        <div class="detail-section__label">标签</div>
        <div class="detail-section__tags">
          <span v-for="tag in skill.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </div>

      <!-- 平台 -->
      <div v-if="skill.platforms?.length" class="detail-section">
        <div class="detail-section__label">支持平台</div>
        <div class="detail-section__tags">
          <span v-for="p in skill.platforms" :key="p" class="tag">{{ p }}</span>
        </div>
      </div>

      <!-- 运行环境 -->
      <div v-if="skill.envs?.length" class="detail-section">
        <div class="detail-section__label">运行环境</div>
        <div class="detail-section__tags">
          <span v-for="e in skill.envs" :key="e" class="tag">{{ e }}</span>
        </div>
      </div>

      <!-- 依赖 -->
      <div v-if="skill.dependencies?.length" class="detail-section">
        <div class="detail-section__label">依赖</div>
        <div class="detail-section__tags">
          <span v-for="d in skill.dependencies" :key="d" class="tag">{{ d }}</span>
        </div>
      </div>

      <!-- 工具集/工具 -->
      <div v-if="skill.requiresToolsets?.length" class="detail-section">
        <div class="detail-section__label">必需工具集</div>
        <div class="detail-section__tags">
          <span v-for="t in skill.requiresToolsets" :key="t" class="tag">{{ t }}</span>
        </div>
      </div>
      <div v-if="skill.requiresTools?.length" class="detail-section">
        <div class="detail-section__label">必需工具</div>
        <div class="detail-section__tags">
          <span v-for="t in skill.requiresTools" :key="t" class="tag">{{ t }}</span>
        </div>
      </div>

      <!-- 触发条件 -->
      <div v-if="skill.triggers?.length || skill.triggerConditions" class="detail-section">
        <div v-if="skill.triggers?.length" class="detail-section__label">触发器</div>
        <div class="detail-section__tags" v-if="skill.triggers?.length">
          <span v-for="t in skill.triggers" :key="t" class="tag">{{ t }}</span>
        </div>
        <div v-if="skill.triggerConditions" class="detail-section__kv">
          <span class="kv-label">触发条件</span>
          <span class="kv-value">{{ skill.triggerConditions }}</span>
        </div>
      </div>

      <!-- 配置 -->
      <div v-if="skill.config && skill.config !== '[]'" class="detail-section">
        <div class="detail-section__label">配置</div>
        <pre class="detail-section__code">{{ skill.config }}</pre>
      </div>

      <!-- 正文 -->
      <div class="detail-section">
        <div class="detail-section__header">
          <div class="detail-section__label">正文</div>
          <div class="markdown-toggle">
            <button
              class="markdown-toggle__btn"
              :class="{ active: !showRaw }"
              @click="showRaw = false"
            >渲染</button>
            <button
              class="markdown-toggle__btn"
              :class="{ active: showRaw }"
              @click="showRaw = true"
            >原始</button>
          </div>
        </div>
        <div v-if="!skill.body" class="detail-section__empty">(无正文)</div>
        <div
          v-else-if="!showRaw"
          class="detail-section__rendered"
        >
          <MarkdownRender :content="skill.body" :highlight-code="true" code-block-bg="#ececed" />
        </div>
        <pre v-else class="detail-section__body">{{ skill.body }}</pre>
      </div>

      <!-- 更新时间 -->
      <div v-if="skill.updatedAt" class="skill-detail__updated">
        更新于 {{ new Date(skill.updatedAt).toLocaleString('zh-CN') }}
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import type { SkillInfo } from '@/renderer/api/types'
import { L3PageLayout } from '@/renderer/components'

const router = useRouter()
const skill = ref<SkillInfo | null>(null)
const showRaw = ref(false)

onMounted(() => {
  // 列表页通过 router.push({ state }) 传入完整 skill 对象
  const stateSkill = (history.state as { skill?: SkillInfo } | null)?.skill
  if (stateSkill) {
    skill.value = stateSkill
  } else {
    // 兜底：无数据返回上一页
    goBack()
  }
})

function goBack() {
  router.back()
}
</script>

<style scoped>
/* ── 头部 ── */

.skill-detail__header {
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}

.skill-detail__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--sa-accent-light, rgba(0, 122, 255, 0.1));
  color: var(--sa-accent, #007aff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-detail__heading {
  flex: 1;
  min-width: 0;
}

.skill-detail__heading h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sa-text-primary, #1d1d1f);
}

.skill-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-secondary, #86868b);
}

/* ── 信息段落 ── */

.detail-section {
  margin-bottom: 14px;
}

.detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.detail-section__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  margin-bottom: 4px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.detail-section__value {
  font-size: 13px;
  color: var(--sa-text-primary, #1d1d1f);
  line-height: 1.6;
}

.detail-section__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-secondary, #86868b);
  border: 1px solid var(--sa-border-light, #e8e8ed);
}

.detail-section__kv {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

.kv-label {
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  flex-shrink: 0;
}

.kv-value {
  color: var(--sa-text-primary, #1d1d1f);
  word-break: break-all;
}

.detail-section__code {
  font-size: 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  padding: 10px 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

.detail-section__empty {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-style: italic;
}

.detail-section__rendered {
  font-size: 13px;
  line-height: 1.7;
}

.detail-section__body {
  font-size: 12px;
  background: var(--sa-bg-secondary, #f5f5f7);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
}

/* ── Markdown 切换 ── */

.markdown-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 6px;
  overflow: hidden;
}

.markdown-toggle__btn {
  font-size: 11px;
  padding: 3px 10px;
  border: none;
  background: transparent;
  color: var(--sa-text-secondary, #86868b);
  cursor: pointer;
  transition: all 0.15s;
}

.markdown-toggle__btn.active {
  background: var(--sa-accent, #007aff);
  color: #fff;
}

/* ── 更新时间 ── */

.skill-detail__updated {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--sa-border-light, #e8e8ed);
}
</style>
