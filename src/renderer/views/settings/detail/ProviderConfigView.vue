<script setup lang="ts">
/**
 * ProviderConfigView.vue — 扩展配置页（Lv3 独立路由 /workspace/settings/providers/:providerId）
 *
 * 扩展自身的一切操作都在这里：自检结果、模型下载、配置表单、启停注册。
 * 扩展系统只提供通用框架，具体逻辑由扩展内部实现（check、models 状态/下载、schema）。
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SaPageHero from '@/renderer/components/SaPageHero.vue'
import L3PageLayout from '@/renderer/components/workspace/L3PageLayout.vue'
import { providersApi, onProviderEvent } from '@/renderer/api/providers-api'
import ProviderConfigForm from '@/renderer/components/settings/ProviderConfigForm.vue'
import { showInfoToast } from '@/renderer/utils/notification-utils'
import type { ConfigSchema, ProviderCheckItem, ProviderInfo } from '@/renderer/api/types'

const route = useRoute()
const providerId = computed(() => String(route.params.providerId ?? ''))

const provider = ref<ProviderInfo | null>(null)
const check = ref<{ ok: boolean; checks: ProviderCheckItem[] } | null>(null)
const schema = ref<ConfigSchema | null>(null)
const config = ref<Record<string, unknown>>({})
const loading = ref(true)

/** 模型状态/进度 */
const modelsStatus = ref<Record<string, boolean>>({})
const modelProgress = ref<Record<string, { phase: string; percent: number; hint?: string }>>({})
/** 下载中的资源名集合（支持并行——每个资源独立） */
const downloading = ref<Set<string>>(new Set())

const statusText = computed(() => {
  const s = provider.value?.status
  if (!s) return '未加载'
  return {
    unloaded: '未加载',
    disabled: '已停用',
    unready: '未就绪',
    registered: '已注册',
  }[s.status] ?? '未加载'
})

/** 资源依赖列表（degraded 时用后端兼容返回的 assetDeps——否则用 manifest 声明） */
const assetDepsList = computed(() => {
  const s = schema.value as { assetDeps?: { name: string; dest: string; sizeMB: number; url: string }[] } | null
  if (s?.assetDeps?.length) return s.assetDeps
  const deps = provider.value?.manifest.assetDeps ?? provider.value?.manifest.modelDeps ?? []
  return deps as { name: string; dest: string; sizeMB: number; url: string }[]
})

/** degraded 态信息（Worker 不可用——资源未就绪——显示下载入口） */
const degradedSchema = computed<{ degraded: boolean; note?: string } | null>(() => {
  const s = schema.value as { degraded?: boolean; note?: string } | null
  return s?.degraded ? { degraded: true, note: s.note } : null
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const list = await providersApi.list()
    provider.value = list.find((p) => p.manifest.id === providerId.value) ?? null
    if (!provider.value) return
    // 各数据独立容错：单个失败（如扩展 getStatus 抛错）不拖垮整页
    const checkResult = await providersApi.check(providerId.value).catch(() => ({ ok: false, checks: [] }))
    const schemaResult = await providersApi.getSchema(providerId.value).catch(() => null)
    const configResult = await providersApi.getConfig(providerId.value).catch(() => ({}))
    const statusResult = await providersApi.getStatus(providerId.value).catch(() => undefined)
    check.value = checkResult
    schema.value = schemaResult
    config.value = configResult
    if (provider.value && statusResult) provider.value.status = statusResult
    await refreshModelsStatus()
  } finally {
    loading.value = false
  }
}

/** 查询资源就绪状态（唯一判定源：主进程 asset-status 文件检查——assetDeps/modelDeps 都认——
 *  不再回退 Worker 判定——避免多套标准互相矛盾） */
async function refreshModelsStatus(): Promise<void> {
  const deps = provider.value?.manifest.assetDeps ?? provider.value?.manifest.modelDeps
  if (!deps?.length) {
    modelsStatus.value = {}
    return
  }
  try {
    modelsStatus.value = (await window.api.providers.assetStatus(providerId.value)) ?? {}
  } catch (e) {
    console.warn('[provider-config] asset-status 查询失败', (e as Error).message)
    modelsStatus.value = {}
  }
}

/** 下载单个资源（每个资源独立按钮——depName 指定——支持并行） */
async function downloadDep(depName: string): Promise<void> {
  if (downloading.value.has(depName)) return
  downloading.value = new Set(downloading.value).add(depName)
  modelProgress.value = { ...modelProgress.value, [depName]: { phase: 'download', percent: 0 } }
  try {
    const results = await window.api.providers.downloadAssets(providerId.value, depName)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      showInfoToast(`下载失败: ${failed.map((f) => f.name + (f.error ? `（${f.error}）` : '')).join('、')}`)
    }
    // 下载完成：资源状态 + 自检全部刷新
    await Promise.all([refreshModelsStatus(), rerunCheck().catch(() => undefined)])
    // 完成停留 1.5s 再清除进度（让用户看到 100%）
    setTimeout(() => {
      modelProgress.value = { ...modelProgress.value, [depName]: { phase: 'done', percent: 100 } }
    }, 1500)
  } catch (e) {
    showInfoToast(`下载失败: ${(e as Error).message}`)
  } finally {
    downloading.value = new Set(Array.from(downloading.value).filter((n) => n !== depName))
  }
}

/**
 * 下载缺失模型已废弃（2026-08：改为每个资源独立按钮——downloadDep）
 * 旧 downloadModels（全量下载）已删除——全部走 downloadDep
 */

/** 保存配置后重跑自检 */
async function saveConfig(patch: Record<string, unknown>): Promise<void> {
  await providersApi.saveConfig(providerId.value, patch)
  config.value = await providersApi.getConfig(providerId.value)
  await rerunCheck()
  showInfoToast('配置已保存')
}

/** 启用/停用（启用前自检拦截由 toggle 处理） */
async function toggleProvider(): Promise<void> {
  if (!provider.value) return
  const target = !provider.value.status.enabled
  try {
    const result = await providersApi.toggle(providerId.value, target)
    if (result.ok) {
      provider.value.status.enabled = result.enabled
      if (result.enabled) {
        provider.value.status.started = true
      }
    } else if (result.checks?.length) {
      check.value = { ok: false, checks: result.checks }
    }
  } catch {
    // 错误提示由 inv 拦截统一派发
  }
}

/** 拉取后端实时状态（enabled/started——刷新顶部"已注册/未就绪"徽标） */
async function refreshStatus(): Promise<void> {
  try {
    const status = await providersApi.getStatus(providerId.value)
    if (status && provider.value) {
      provider.value.status = status
    }
  } catch {
    // 忽略——保持现有状态
  }
}

async function rerunCheck(): Promise<void> {
  check.value = await providersApi.check(providerId.value)
  if (check.value.ok && provider.value && provider.value.status.enabled) {
    // 自检通过且配置为启用：尝试注册（若之前未就绪）
    const result = await providersApi.toggle(providerId.value, true)
    if (result.ok) {
      provider.value.status.enabled = true
      provider.value.status.started = true
    }
  }
  // 无论自检结果——同步一次后端实时状态（已注册徽标）
  await refreshStatus()
}

// models:progress 事件 → 进度（旧链路——扩展 Worker 上报）
let offEvent: (() => void) | null = null
// 主进程资源下载进度（新链路——provider:assets-progress）
let offAssetsProgress: (() => void) | null = null
onMounted(() => {
  load()
  offEvent = onProviderEvent(({ providerId: pid, event, data }) => {
    if (pid !== providerId.value || event !== 'models:progress') return
    const { kind, phase, percent, hint } = data as { kind: string; phase: string; percent: number; hint?: string }
    modelProgress.value = { ...modelProgress.value, [kind]: { phase, percent, hint } }
    if (phase === 'done') void refreshModelsStatus()
  })
  // 主进程下载进度（depName → dest 文件名匹配——更新对应资源）
  offAssetsProgress = window.api.onEvent('provider:assets-progress', (data) => {
    const d = data as { providerId: string; depName: string; received: number; total: number }
    if (d.providerId !== providerId.value) return
    const dep = assetDepsList.value.find((x) => x.name === d.depName)
    const key = dep ? dep.name : d.depName
    const percent = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0
    modelProgress.value = { ...modelProgress.value, [key]: { phase: percent >= 100 ? 'done' : 'download', percent } }
    if (percent >= 100) void refreshModelsStatus()
  })
})
onUnmounted(() => {
  offEvent?.()
  offAssetsProgress?.()
})

// 同路由 param 变化（example-provider → speech-sherpa）时组件复用，需重新加载
watch(providerId, () => {
  provider.value = null
  check.value = null
  schema.value = null
  config.value = {}
  modelsStatus.value = {}
  modelProgress.value = {}
  void load()
})
</script>

<template>
  <L3PageLayout class="provider-config-page">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><path d=&quot;M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z&quot;/></svg>"
      gradient="linear-gradient(135deg, #ffb340 0%, var(--tk-warning) 100%)"
      title="扩展配置"
      desc="扩展的参数与运行状态"
    />
    <!-- 加载态 -->
    <div v-if="loading" class="provider-config-page__state">
      加载中…
    </div>

    <div v-else-if="!provider" class="provider-config-page__state">
      扩展不存在（{{ providerId }}），可能已被移除
    </div>

    <div v-else class="provider-config-page__body">
      <!-- 扩展信息头 -->
      <div class="provider-config-page__header">
        <div class="provider-config-page__info">
          <div class="provider-config-page__name">
            {{ provider.manifest.name }}
            <span class="provider-config-page__version">v{{ provider.manifest.version }}</span>
          </div>
          <div class="provider-config-page__desc">
            {{ provider.manifest.description || '—' }}
          </div>
          <div class="provider-config-page__caps">
            <span v-for="cap in provider.manifest.capabilities ?? []" :key="cap" class="provider-config-page__cap">
              {{ cap }}
            </span>
          </div>
        </div>
        <div class="provider-config-page__status">
          <span class="provider-config-page__status-badge" :class="provider.status.enabled && provider.status.started ? 'ok' : provider.status.enabled ? 'warn' : 'off'">
            {{ statusText }}
          </span>
          <button class="provider-config-page__toggle" :class="{ off: provider.status.enabled }" @click="toggleProvider">
            {{ provider.status.enabled ? '停用' : '启用' }}
          </button>
        </div>
      </div>

      <!-- 自检结果 -->
      <section class="provider-config-page__section">
        <div class="provider-config-page__section-title">
          自检
        </div>
        <div v-if="!check" class="provider-config-page__muted">
          未检查
        </div>
        <div v-else-if="check.ok" class="provider-config-page__check-ok">
          ✓ 全部检查项通过
        </div>
        <div v-else class="provider-config-page__check-fail">
          <div v-for="c in check.checks.filter((x) => !x.ok)" :key="c.name" class="provider-config-page__check-item">
            <span class="provider-config-page__check-icon">!</span>
            <div class="provider-config-page__check-body">
              <div class="provider-config-page__check-name">
                {{ c.name }}
              </div>
              <div v-if="c.hint" class="provider-config-page__check-hint">
                {{ c.hint }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 模型管理 -->
      <section v-if="assetDepsList.length" class="provider-config-page__section">
        <div class="provider-config-page__section-title">
          资源
        </div>
        <div v-if="degradedSchema" class="provider-config-page__muted" style="margin-bottom: 8px">
          {{ degradedSchema.note }}
        </div>
        <div v-for="dep in assetDepsList" :key="dep.dest" class="provider-config-page__model">
          <div class="provider-config-page__model-info">
            <div class="provider-config-page__model-name">
              {{ dep.name }}
            </div>
            <div class="provider-config-page__model-size">
              {{ dep.sizeMB }}MB
            </div>
          </div>
          <div class="provider-config-page__model-right">
            <span v-if="modelsStatus?.[dep.name]" class="provider-config-page__ready">已就绪</span>
            <span v-else class="provider-config-page__ready provider-config-page__ready--no">未就绪</span>
            <div
              v-if="downloading.has(dep.name) || (modelProgress[dep.name] && modelProgress[dep.name]?.phase !== 'done')"
              class="provider-config-page__progress"
            >
              <div
                class="provider-config-page__progress-bar"
                :style="{ width: (modelProgress[dep.name]?.percent ?? 0) + '%' }"
              ></div>
              <span class="provider-config-page__progress-text">
                {{
                  modelProgress[dep.name]?.hint
                    ?? (modelProgress[dep.name]?.phase === 'extract'
                      ? '解压中…'
                      : (downloading.has(dep.name) && !modelProgress[dep.name]?.percent)
                        ? '下载中…'
                        : (modelProgress[dep.name]?.percent ?? 0) + '%')
                }}
              </span>
            </div>
            <button
              v-if="!modelsStatus?.[dep.name] && !downloading.has(dep.name)"
              class="provider-config-page__download"
              @click="downloadDep(dep.name)"
            >
              下载
            </button>
          </div>
        </div>
      </section>

      <!-- 配置表单（schema 驱动，页面内嵌非弹窗） -->
      <section class="provider-config-page__section">
        <div class="provider-config-page__section-title">
          配置
        </div>
        <div v-if="!schema" class="provider-config-page__muted">
          该扩展未声明配置项
        </div>
        <ProviderConfigForm
          v-else
          :provider-id="provider.manifest.id"
          :schema="schema"
          :initial="config"
          @save="saveConfig"
        />
      </section>
    </div>
  </L3PageLayout>
</template>

<style scoped>
.provider-config-page {
  display: flex;
  flex-direction: column;
  /* 布局（padding/宽度/滚动）由 L3PageLayout 统一提供——全宽滚动 + 内容 680 */
}

.provider-config-page__state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--tk-text-tertiary);
}

.provider-config-page__body {
  display: flex;
  flex-direction: column;
  gap: var(--tk-space-5, 20px);
  max-width: 640px;
}

.provider-config-page__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tk-space-4, 16px);
}

.provider-config-page__name {
  font-size: var(--tk-fs-title);
  font-weight: 600;
  color: var(--tk-text-primary);
}

.provider-config-page__version {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--tk-text-tertiary);
}

.provider-config-page__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tk-text-secondary);
  line-height: 1.5;
}

.provider-config-page__caps {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.provider-config-page__cap {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 999px;
  color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.08);
}

.provider-config-page__status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.provider-config-page__status-badge {
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 999px;
  font-weight: 500;
}

.provider-config-page__status-badge.ok {
  color: var(--tk-success);
  background: rgba(52, 199, 89, 0.1);
}

.provider-config-page__status-badge.warn {
  color: var(--tk-warning);
  background: rgba(255, 159, 10, 0.1);
}

.provider-config-page__status-badge.off {
  color: var(--tk-text-tertiary);
  background: var(--tk-bg-secondary);
}

.provider-config-page__toggle {
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

.provider-config-page__toggle:hover {
  background: rgba(0, 122, 255, 0.12);
}

.provider-config-page__toggle.off {
  color: var(--tk-text-secondary);
  background: var(--tk-bg-primary);
  border-color: var(--tk-border);
}

.provider-config-page__toggle.off:hover {
  border-color: var(--tk-text-secondary);
}

.provider-config-page__section {
  padding: 20px;
  background: var(--tk-bg-primary);
  /* emil：大圆角 + 分层阴影 */
  border: 1px solid var(--tk-border-card);
  border-radius: var(--tk-radius-xl);
  box-shadow: var(--tk-shadow-card);
}

.provider-config-page__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin-bottom: var(--tk-space-3, 12px);
}

.provider-config-page__muted {
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.provider-config-page__check-ok {
  font-size: 13px;
  color: var(--tk-success);
}

.provider-config-page__check-fail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-config-page__check-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 59, 48, 0.06);
  border-radius: 10px;
}

.provider-config-page__check-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: var(--tk-destructive);
  background: rgba(255, 59, 48, 0.12);
}

.provider-config-page__check-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.provider-config-page__check-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--tk-text-secondary);
}

.provider-config-page__model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--tk-bg-secondary);
  border-radius: 10px;
  margin-bottom: 8px;
}

.provider-config-page__model-name {
  font-size: 13px;
  color: var(--tk-text-primary);
}

.provider-config-page__model-size {
  margin-top: 2px;
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.provider-config-page__model-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.provider-config-page__ready {
  font-size: 11px;
  color: var(--tk-success);
}

.provider-config-page__ready--no {
  color: var(--tk-destructive);
}

.provider-config-page__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 110px;
}

.provider-config-page__progress-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--tk-accent);
  transition: width 0.2s;
}

.provider-config-page__progress-text {
  font-size: 11px;
  color: var(--tk-text-secondary);
  white-space: nowrap;
}

.provider-config-page__download {
  margin-top: 4px;
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

.provider-config-page__download:hover:not(:disabled) {
  background: rgba(0, 122, 255, 0.12);
}

.provider-config-page__download:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
