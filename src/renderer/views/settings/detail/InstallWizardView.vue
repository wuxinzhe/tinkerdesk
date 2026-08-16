<template>
  <L3PageLayout class="install-wizard-page">
    <div class="install-wizard-page__body">
      <!-- 页面标题区 -->
      <div class="iw-heading">
        <h1 class="iw-heading__title">安装插件</h1>
        <p class="iw-heading__subtitle">分步安装——下载、确认、安装、完成</p>
      </div>

      <!-- 主卡片 -->
      <div class="iw-card">
        <!-- 节点式步骤进度条（Apple HIG——参考 InitAccountView） -->
        <ol class="iw-stepper" aria-label="安装步骤">
          <li
            v-for="(s, i) in steps"
            :key="s.key"
            class="iw-step"
            :class="{
              'iw-step--done': stepDone(i),
              'iw-step--active': currentStep === i,
              'iw-step--failed': stepFailed(i),
            }"
          >
            <div class="iw-step__node">
              <svg v-if="stepDone(i) && !stepFailed(i)" class="iw-step__check" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <path d="M2 6.5L4.5 9L10 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else-if="stepFailed(i)" class="iw-step__cross" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
                <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
              </svg>
              <span v-else class="iw-step__num">{{ i + 1 }}</span>
            </div>
            <div class="iw-step__label">
              <span class="iw-step__title">{{ s.label }}</span>
            </div>
          </li>
        </ol>

        <div class="iw-card__divider"></div>

        <!-- 内容区（步骤切换） -->
        <div class="iw-body">
          <transition name="iw-fade" mode="out-in">
            <div :key="currentStep" class="iw-pane">
              <!-- Step 0（npm）：下载 -->
              <div v-if="currentStep === 0 && isNpm">
                <div v-if="downloading" class="iw-download">
                  <div class="iw-download__row">
                    <span class="iw-download__label">正在下载安装包</span>
                    <span class="iw-download__pct">{{ downloadPercent > 0 ? `${downloadPercent}%` : '' }}</span>
                  </div>
                  <div class="iw-download__bar">
                    <div class="iw-download__fill" :style="{ transform: `scaleX(${downloadPercent / 100})` }"></div>
                  </div>
                  <div v-if="downloadPercent > 0" class="iw-download__meta">{{ downloadMeta }}</div>
                </div>
                <div v-else-if="startError" class="iw-state is-error">{{ startError }}</div>
                <div v-else class="iw-state is-ok">安装包已就绪</div>
              </div>

              <!-- 确认信息 -->
              <div v-else-if="(isNpm && currentStep === 1) || (!isNpm && currentStep === 0)">
                <div v-if="loading" class="iw-state">校验安装包中...</div>
                <div v-else-if="session" class="iw-confirm">
                  <div class="iw-confirm__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  </div>
                  <div class="iw-confirm__info">
                    <div class="iw-confirm__name">
                      {{ session.manifest?.name }}
                      <span class="iw-confirm__version">v{{ session.manifest?.version }}</span>
                    </div>
                    <div v-if="session.manifest?.capabilities?.length" class="iw-confirm__caps">
                      <span v-for="c in session.manifest.capabilities" :key="c" class="iw-confirm__cap">{{ c }}</span>
                    </div>
                  </div>
                  <p class="iw-confirm__note">安装后插件将以完全权限运行（可读写文件、执行命令、访问网络）。仅安装你信任的来源。</p>
                </div>
                <div v-else class="iw-state is-error">{{ startError }}</div>
              </div>

              <!-- 资源勾选 -->
              <div v-else-if="(isNpm && currentStep === 2) || (!isNpm && currentStep === 1)">
                <div v-if="!session?.assetDeps?.length" class="iw-state">该插件无需下载额外资源</div>
                <div v-else class="iw-assets">
                  <label v-for="dep in session?.assetDeps ?? []" :key="dep.dest" class="iw-asset">
                    <input v-model="selectedAssets" type="checkbox" :value="dep.dest" :disabled="!dep.optional" class="iw-asset__input" />
                    <span class="iw-asset__check">
                      <svg v-if="selectedAssets.includes(dep.name)" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </span>
                    <span class="iw-asset__body">
                      <span class="iw-asset__name">{{ dep.name }}</span>
                      <span class="iw-asset__meta">
                        约 {{ dep.sizeMB }}MB
                        <span v-if="!dep.optional" class="iw-asset__req">必需</span>
                        <span v-else class="iw-asset__opt">可选</span>
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <!-- 安装进度 -->
              <div v-else-if="(isNpm && currentStep === 3) || (!isNpm && currentStep === 2)" class="iw-stages">
                <div v-for="stage in installStages" :key="stage" class="iw-stage">
                  <span :class="['iw-stage__node', `is-${stageStatus(stage)}`]">
                    <svg v-if="stageStatus(stage) === 'done'" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5L4.5 9L10 3" /></svg>
                    <svg v-else-if="stageStatus(stage) === 'failed'" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" /></svg>
                    <span v-else class="iw-stage__dot"></span>
                  </span>
                  <span class="iw-stage__name">{{ stageLabel(stage) }}</span>
                </div>
                <!-- 资源下载进度（assets 阶段——按 depName 显示当前下载项） -->
                <div v-if="assetsProgress.active" class="iw-assets-progress">
                  <div class="iw-assets-progress__row">
                    <span class="iw-assets-progress__name">{{ assetsProgress.name }}</span>
                    <span class="iw-assets-progress__pct">{{ assetsProgress.percent > 0 ? `${assetsProgress.percent}%` : '' }}</span>
                  </div>
                  <div class="iw-assets-progress__bar">
                    <div class="iw-assets-progress__fill" :style="{ transform: `scaleX(${assetsProgress.percent / 100})` }"></div>
                  </div>
                </div>
                <!-- 失败错误（独立行——不挤压阶段标签——可换行完整显示） -->
                <div v-if="installFailed" class="iw-stage-err">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span>{{ stageError }}</span>
                </div>
                <div v-if="installFailed" class="iw-retry">
                  <SaActionBtn text="重试该步" variant="primary" @click="retryFailed" />
                </div>
              </div>

              <!-- 完成 -->
              <div v-else class="iw-done">
                <div class="iw-done__check">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <div class="iw-done__text">安装完成</div>
                <p class="iw-done__sub">插件已注册，可在插件设置中查看</p>
              </div>
            </div>
          </transition>
        </div>

        <!-- 底部操作（按步骤语义——npm/local 偏移自适应） -->
        <div class="iw-footer">
          <!-- Step 0：下载（npm）或确认（local）——下一步 -->
          <template v-if="currentStep === 0">
            <SaActionBtn text="取消" @click="close" />
            <SaActionBtn text="下一步" variant="primary" :disabled="(isNpm ? downloading || !session : !session || loading)" @click="next" />
          </template>
          <!-- 确认信息（npm 专属——下载后）——上一步 + 去资源 -->
          <template v-else-if="isNpm && currentStep === 1">
            <SaActionBtn text="上一步" @click="currentStep = 0" />
            <SaActionBtn text="下一步" variant="primary" @click="currentStep = 2" />
          </template>
          <!-- 依赖资源（npm 2 / local 1）——上一步 + 开始安装 -->
          <template v-else-if="currentStep === assetsStepIndex">
            <SaActionBtn text="上一步" @click="currentStep = currentStep - 1" />
            <SaActionBtn text="开始安装" variant="primary" @click="startInstall" />
          </template>
          <!-- 安装中（npm 3 / local 2） -->
          <template v-else-if="currentStep === installStepIndex">
            <SaActionBtn v-if="!installFailed" text="安装中..." :loading="true" disabled />
          </template>
          <!-- 完成 -->
          <template v-else>
            <SaActionBtn text="完成" variant="primary" @click="finish" />
          </template>
        </div>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { InstallSessionInfo } from '@/renderer/api/types'
import { SaActionBtn, L3PageLayout } from '@/renderer/components'
import { pluginsApi } from '@/renderer/api/plugins-api'

const route = useRoute()
const router = useRouter()
const pkg = computed(() => (route.query.pkg as string) || '')
const path = computed(() => (route.query.path as string) || '')

const loading = ref(false)
const startError = ref('')
const session = ref<InstallSessionInfo | null>(null)
const currentStep = ref(0)
const selectedAssets = ref<string[]>([])
const installFailed = ref(false)
const stageError = ref('')
const downloading = ref(false)
const downloadPercent = ref(0)
const downloadReceived = ref(0)
const downloadTotal = ref(0)
/** 资源下载进度（安装 assets 阶段） */
const assetsProgress = ref<{ active: boolean; name: string; percent: number }>({ active: false, name: '', percent: 0 })

const downloadMeta = computed(() => {
  const recv = formatSize(downloadReceived.value)
  const total = downloadTotal.value > 0 ? formatSize(downloadTotal.value) : ''
  return total ? `${recv} / ${total}` : recv
})

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const isNpm = computed(() => session.value?.sourceType === 'npm')

const steps = computed(() => {
  const base = [
    { key: 'confirm', label: '确认信息' },
    { key: 'assets', label: '依赖资源' },
    { key: 'install', label: '安装' },
    { key: 'done', label: '完成' },
  ]
  if (isNpm.value) {
    return [{ key: 'download', label: '下载' }, ...base]
  }
  return base
})

const assetsStepIndex = computed(() => (isNpm.value ? 2 : 1))
const installStepIndex = computed(() => (isNpm.value ? 3 : 2))
const doneStepIndex = computed(() => (isNpm.value ? 4 : 3))

const installStages = ['copy', 'deps', 'assets', 'register'] as const

function stageLabel(s: string): string {
  return { copy: '复制文件', deps: '依赖安装', assets: '资源下载', register: '注册加载' }[s] ?? s
}

function stageStatus(s: string): 'pending' | 'running' | 'done' | 'failed' {
  return session.value?.stages?.[s] ?? 'pending'
}

function stepDone(i: number): boolean {
  if (i === 0) return !!session.value
  if (i === 1) return currentStep.value > 1
  if (i === installStepIndex.value) return currentStep.value >= doneStepIndex.value
  return currentStep.value >= doneStepIndex.value
}

function stepFailed(i: number): boolean {
  return i === installStepIndex.value && installFailed.value
}

watch(
  () => route.query.pkg,
  () => start(),
)

onMounted(start)

async function start() {
  loading.value = true
  startError.value = ''
  try {
    session.value = await pluginsApi.installStart({
      pkg: pkg.value || undefined,
      path: path.value || undefined,
    })
    selectedAssets.value = (session.value?.assetDeps ?? []).filter((d) => !d.optional).map((d) => d.dest)
    if (session.value?.sourceType === 'npm' && pkg.value) {
      await doDownload()
    }
  } catch (e) {
    startError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function doDownload() {
  if (!session.value) return
  downloading.value = true
  downloadPercent.value = 0
  downloadReceived.value = 0
  downloadTotal.value = 0
  const unsubscribe = window.api.onEvent('plugin:install-progress', (data) => {
    const d = data as { sessionId: string; received: number; total: number }
    if (d.sessionId !== session.value?.sessionId) return
    downloadReceived.value = d.received
    downloadTotal.value = d.total
    downloadPercent.value = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0
  })
  try {
    const r = await pluginsApi.installDownload(session.value.sessionId)
    if (r.manifest) {
      session.value = { ...session.value!, manifest: r.manifest, assetDeps: r.assetDeps ?? [], stages: r.stages }
    }
    selectedAssets.value = (session.value?.assetDeps ?? []).filter((d) => !d.optional).map((d) => d.name)
    downloadPercent.value = 100
  } catch (e) {
    startError.value = (e as Error).message
  } finally {
    unsubscribe()
    downloading.value = false
  }
}

function next() {
  currentStep.value = 1
}

async function startInstall() {
  currentStep.value = installStepIndex.value
  installFailed.value = false
  stageError.value = ''
  assetsProgress.value = { active: false, name: '', percent: 0 }
  // 监听资源下载进度（assets 阶段——plugin:assets-progress——sessionId 匹配）
  const offAssets = window.api.onEvent('plugin:assets-progress', (data) => {
    const d = data as { sessionId?: string; depName: string; received: number; total: number }
    if (d.sessionId && d.sessionId !== session.value?.sessionId) return
    const percent = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0
    assetsProgress.value = { active: true, name: d.depName, percent }
  })
  try {
    for (const stage of installStages) {
      const r = await pluginsApi.installStep(session.value!.sessionId, stage, stage === 'assets' ? skippedAssets() : undefined)
      session.value!.stages = r.stages
      if (!r.ok) {
        installFailed.value = true
        stageError.value = r.error ?? '安装失败'
        return
      }
    }
    currentStep.value = doneStepIndex.value
  } finally {
    offAssets()
    assetsProgress.value = { active: false, name: '', percent: 0 }
  }
}

function skippedAssets(): string[] {
  return (session.value?.assetDeps ?? []).map((d) => d.name).filter((d) => !selectedAssets.value.includes(d))
}

async function retryFailed() {
  installFailed.value = false
  stageError.value = ''
  const failedStage = installStages.find((s) => stageStatus(s) === 'failed')
  if (!failedStage) return
  for (const stage of installStages.slice(installStages.indexOf(failedStage))) {
    const r = await pluginsApi.installStep(session.value!.sessionId, stage, stage === 'assets' ? skippedAssets() : undefined)
    session.value!.stages = r.stages
    if (!r.ok) {
      installFailed.value = true
      stageError.value = r.error ?? '安装失败'
      return
    }
  }
  currentStep.value = doneStepIndex.value
}

function finish() {
  router.push('/workspace/settings/plugins')
}

function close() {
  router.push('/workspace/settings/plugins')
}
</script>

<style scoped>
.install-wizard-page {
  width: 100%;
}

.install-wizard-page__body {
  max-width: 680px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── 页面标题 ── */
.iw-heading__title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--tk-text-primary);
  margin: 0;
}

.iw-heading__subtitle {
  font-size: 13px;
  color: var(--tk-text-tertiary);
  margin: 6px 0 0;
}

/* ── 主卡片 ── */
.iw-card {
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  padding: 24px;
}

/* ── 节点式步骤条（Apple HIG——参考 InitAccountView） ── */
.iw-stepper {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  list-style: none;
  margin: 0;
  padding: 0;
}

.iw-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.iw-step:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 14px;
  left: -50%;
  width: 100%;
  height: 2px;
  background: var(--tk-border);
  z-index: 0;
  transition: background-color 200ms var(--tk-ease);
}

.iw-step--done:not(:first-child)::before {
  background: var(--tk-accent);
}

.iw-step__node {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  transition: background-color 200ms var(--tk-ease), border-color 200ms var(--tk-ease), color 200ms var(--tk-ease), box-shadow 200ms var(--tk-ease);
}

/* 完成：实心蓝 + 白勾 */
.iw-step--done .iw-step__node {
  background: var(--tk-accent);
  color: #fff;
}

/* 进行中：实心蓝 + halo 聚焦 */
.iw-step--active .iw-step__node {
  background: var(--tk-accent);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.15);
}

/* 失败：红描边 + 红叉 */
.iw-step--failed .iw-step__node {
  background: rgba(255, 59, 48, 0.08);
  border: 1px solid #ff3b30;
  color: #ff3b30;
}

.iw-step__label {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.iw-step__title {
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--tk-text-primary);
  text-align: center;
  transition: color 200ms var(--tk-ease);
}

.iw-step--active .iw-step__title {
  font-weight: 600;
}

/* 未激活的步骤标题灰 */
.iw-step:not(.iw-step--active):not(.iw-step--done) .iw-step__title {
  color: var(--tk-text-tertiary);
}

.iw-card__divider {
  height: 1px;
  background: var(--tk-border);
  margin: 20px 0;
}

/* ── 内容区 ── */
.iw-body {
  min-height: 110px;
}

.iw-state {
  color: var(--tk-text-tertiary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

.iw-state.is-error {
  color: #ff3b30;
}

.iw-state.is-ok {
  color: #34c759;
}

/* 确认信息 */
.iw-confirm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.iw-confirm__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--tk-bg-secondary);
  color: var(--tk-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.iw-confirm__name {
  font-size: 16px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.iw-confirm__version {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  font-weight: 400;
  margin-left: 8px;
}

.iw-confirm__caps {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.iw-confirm__cap {
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--tk-bg-secondary);
  font-size: 11px;
  color: var(--tk-text-secondary);
}

.iw-confirm__note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tk-text-tertiary);
  margin: 4px 0 0;
}

/* 下载 */
.iw-download__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  color: var(--tk-text-secondary);
  margin-bottom: 10px;
}

.iw-download__pct {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 13px;
  color: var(--tk-accent);
}

.iw-download__bar {
  height: 4px;
  border-radius: 2px;
  background: var(--tk-bg-secondary);
  overflow: hidden;
}

.iw-download__fill {
  height: 100%;
  background: var(--tk-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-download__meta {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-top: 8px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

/* 资源 */
.iw-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.iw-asset {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  cursor: pointer;
  transition: border-color 160ms var(--tk-ease), background 160ms var(--tk-ease);
}

.iw-asset:hover {
  border-color: var(--tk-text-tertiary);
  background: var(--tk-bg-secondary);
}

.iw-asset__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.iw-asset__check {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1.5px solid var(--tk-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  transition: background 160ms var(--tk-ease), border-color 160ms var(--tk-ease);
}

.iw-asset__input:checked + .iw-asset__check {
  background: var(--tk-accent);
  border-color: var(--tk-accent);
}

.iw-asset__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.iw-asset__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.iw-asset__meta {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-top: 2px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.iw-asset__req {
  color: var(--tk-accent);
}

/* 安装进度 */
.iw-stages {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.iw-stage {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--tk-text-secondary);
}

.iw-stage__node {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--tk-text-tertiary);
  transition: color 160ms var(--tk-ease), background 160ms var(--tk-ease);
}

.iw-stage__node.is-running {
  color: var(--tk-accent);
}

.iw-stage__node.is-running .iw-stage__dot {
  animation: iw-pulse 1.2s infinite;
}

.iw-stage__node.is-done {
  color: #34c759;
}

.iw-stage__node.is-failed {
  color: #ff3b30;
}

.iw-stage__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.iw-stage__name {
  flex: 1;
}

/* 资源下载进度（安装 assets 阶段） */
.iw-assets-progress {
  padding: 2px 0 4px;
}

.iw-assets-progress__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--tk-text-secondary);
  margin-bottom: 6px;
}

.iw-assets-progress__pct {
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--tk-accent);
}

.iw-assets-progress__bar {
  height: 3px;
  border-radius: 2px;
  background: var(--tk-bg-secondary);
  overflow: hidden;
}

.iw-assets-progress__fill {
  height: 100%;
  background: var(--tk-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 失败错误（独立行——不挤压阶段标签——换行完整显示） */
.iw-stage-err {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 59, 48, 0.06);
  color: #ff3b30;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.iw-stage-err svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.iw-retry {
  margin-top: 4px;
  text-align: right;
}

/* 完成 */
.iw-done {
  text-align: center;
  padding: 12px 0;
}

.iw-done__check {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px;
}

.iw-done__text {
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.iw-done__sub {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  margin: 6px 0 0;
}

/* 底部 */
.iw-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--tk-border);
}

/* 动画（克制） */
.iw-fade-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-fade-leave-active {
  transition: opacity 120ms var(--tk-ease);
}

.iw-fade-enter-from,
.iw-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .iw-step__node,
  .iw-step:not(:first-child)::before,
  .iw-download__fill,
  .iw-fade-enter-active,
  .iw-fade-leave-active {
    transition: none;
  }
}

@keyframes iw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
