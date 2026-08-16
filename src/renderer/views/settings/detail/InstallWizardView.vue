<template>
  <L3PageLayout class="install-wizard-page">
    <div class="install-wizard-page__body">
      <!-- 极简步骤路径（小圆点序列——安静不喧宾夺主） -->
      <div class="iw-path" role="tablist" aria-label="安装步骤">
        <template v-for="(s, i) in steps" :key="s.key">
          <div class="iw-path__item">
            <div
              :class="['iw-path__dot', {
                'is-active': currentStep === i,
                'is-done': stepDone(i),
                'is-failed': stepFailed(i),
              }]"
            >
              <Transition name="iw-pop" mode="out-in">
                <svg v-if="stepDone(i) && !stepFailed(i)" key="check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                <svg v-else-if="stepFailed(i)" key="cross" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                <span v-else key="dot"></span>
              </Transition>
            </div>
            <span :class="['iw-path__label', { 'is-active': currentStep === i }]">{{ s.label }}</span>
          </div>
          <div v-if="i < steps.length - 1" :class="['iw-path__link', { 'is-filled': stepDone(i) }]"></div>
        </template>
      </div>

      <!-- 内容区 -->
      <Transition name="iw-fade" mode="out-in">
        <div :key="currentStep" class="iw-content">
          <!-- Step 0（npm）：下载安装包 -->
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
            <div v-else-if="startError" class="iw-error">{{ startError }}</div>
            <div v-else class="iw-ready">✓ 安装包已就绪</div>
          </div>

          <!-- 确认信息 -->
          <div v-else-if="(isNpm && currentStep === 1) || (!isNpm && currentStep === 0)">
            <div v-if="loading" class="iw-muted">校验安装包中...</div>
            <div v-else-if="session">
              <div class="iw-title">{{ session.manifest?.name }}<span class="iw-version">v{{ session.manifest?.version }}</span></div>
              <div v-if="session.manifest?.capabilities?.length" class="iw-caps">
                <span v-for="c in session.manifest.capabilities" :key="c" class="iw-cap">{{ c }}</span>
              </div>
              <p class="iw-note">安装后插件将以完全权限运行（可读写文件、执行命令、访问网络）。仅安装你信任的来源。</p>
            </div>
            <div v-else class="iw-error">{{ startError }}</div>
          </div>

          <!-- 资源勾选 -->
          <div v-else-if="(isNpm && currentStep === 2) || (!isNpm && currentStep === 1)">
            <div v-if="!session?.assetDeps?.length" class="iw-muted">该插件无需下载额外资源</div>
            <div v-else class="iw-assets">
              <label v-for="dep in session?.assetDeps ?? []" :key="dep.dest" class="iw-asset">
                <input v-model="selectedAssets" type="checkbox" :value="dep.dest" :disabled="!dep.optional" class="iw-asset__input" />
                <span class="iw-asset__check">
                  <svg v-if="selectedAssets.includes(dep.dest)" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
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
              <span :class="['iw-stage__dot', `is-${stageStatus(stage)}`]">
                <Transition name="iw-pop" mode="out-in">
                  <svg v-if="stageStatus(stage) === 'done'" key="check" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <svg v-else-if="stageStatus(stage) === 'failed'" key="cross" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  <span v-else key="dot"></span>
                </Transition>
              </span>
              <span class="iw-stage__name">{{ stageLabel(stage) }}</span>
              <span v-if="stageStatus(stage) === 'failed'" class="iw-stage__err">{{ stageError }}</span>
            </div>
            <div v-if="installFailed" class="iw-retry">
              <SaActionBtn text="重试该步" variant="primary" @click="retryFailed" />
            </div>
          </div>

          <!-- 完成 -->
          <div v-else class="iw-done">
            <div class="iw-done__check">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div class="iw-done__text">安装完成</div>
          </div>
        </div>
      </Transition>

      <!-- 底部操作 -->
      <div class="iw-footer">
        <template v-if="currentStep === 0 && isNpm">
          <SaActionBtn text="取消" @click="close" />
          <SaActionBtn text="下一步" variant="primary" :disabled="downloading || !session" @click="next" />
        </template>
        <template v-else-if="currentStep === 0 && !isNpm">
          <SaActionBtn text="取消" @click="close" />
          <SaActionBtn text="下一步" variant="primary" :disabled="!session || loading" @click="next" />
        </template>
        <template v-else-if="currentStep === 1">
          <SaActionBtn text="上一步" @click="currentStep = 0" />
          <SaActionBtn text="开始安装" variant="primary" @click="startInstall" />
        </template>
        <template v-else-if="currentStep === 2 || (currentStep === 3 && isNpm)">
          <SaActionBtn v-if="!installFailed" text="安装中..." :loading="true" disabled />
        </template>
        <template v-else>
          <SaActionBtn text="完成" variant="primary" @click="finish" />
        </template>
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

const visible = ref(true)
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
    selectedAssets.value = (session.value?.assetDeps ?? []).filter((d) => !d.optional).map((d) => d.dest)
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
}

function skippedAssets(): string[] {
  return (session.value?.assetDeps ?? []).map((d) => d.dest).filter((d) => !selectedAssets.value.includes(d))
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
  gap: 24px;
}

/* ── 极简步骤路径：小圆点序列 + 细线 ── */
.iw-path {
  display: flex;
  align-items: center;
}

.iw-path__item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.iw-path__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 160ms var(--tk-ease), color 160ms var(--tk-ease), transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-path__dot.is-active {
  background: var(--tk-accent);
  color: #fff;
  transform: scale(1.15);
}

.iw-path__dot.is-done {
  background: transparent;
  color: var(--tk-accent);
}

.iw-path__dot.is-failed {
  background: transparent;
  color: #ff3b30;
}

.iw-path__label {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  transition: color 160ms var(--tk-ease);
  white-space: nowrap;
}

.iw-path__label.is-active {
  color: var(--tk-text-primary);
}

.iw-path__link {
  flex: 1;
  height: 1px;
  background: var(--tk-bg-secondary);
  margin: 0 8px;
  min-width: 12px;
}

.iw-path__link.is-filled {
  background: var(--tk-accent);
  opacity: 0.45;
}

/* ── 内容 ── */
.iw-content {
  min-height: 100px;
}

.iw-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--tk-text-primary);
  letter-spacing: -0.01em;
}

.iw-version {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  margin-left: 8px;
  font-weight: 400;
}

.iw-caps {
  display: flex;
  gap: 6px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.iw-cap {
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--tk-bg-secondary);
  font-size: 11px;
  color: var(--tk-text-secondary);
}

.iw-note {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tk-text-tertiary);
  margin: 0;
}

.iw-muted {
  color: var(--tk-text-tertiary);
  font-size: 13px;
  padding: 12px 0;
}

.iw-error {
  color: #ff3b30;
  font-size: 13px;
  padding: 12px 0;
}

.iw-ready {
  color: #34c759;
  font-size: 13px;
  padding: 12px 0;
}

/* ── 下载 ── */
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
  height: 3px;
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

/* ── 资源 ── */
.iw-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.iw-asset {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--tk-border);
  cursor: pointer;
  transition: border-color 160ms var(--tk-ease);
}

.iw-asset:hover {
  border-color: var(--tk-text-tertiary);
}

.iw-asset__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.iw-asset__check {
  width: 16px;
  height: 16px;
  border-radius: 5px;
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

.iw-asset__opt {
  color: var(--tk-text-tertiary);
}

/* ── 安装进度 ── */
.iw-stages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.iw-stage {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--tk-text-secondary);
}

.iw-stage__dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--tk-text-tertiary);
  transition: color 160ms var(--tk-ease), background 160ms var(--tk-ease);
}

.iw-stage__dot.is-running {
  color: var(--tk-accent);
}

.iw-stage__dot.is-running::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tk-accent);
  animation: iw-pulse 1.2s infinite;
}

.iw-stage__dot.is-done {
  color: #34c759;
}

.iw-stage__dot.is-failed {
  color: #ff3b30;
}

.iw-stage__name {
  flex: 1;
}

.iw-stage__err {
  color: #ff3b30;
  font-size: 12px;
}

.iw-retry {
  margin-top: 4px;
  text-align: right;
}

/* ── 完成 ── */
.iw-done {
  text-align: center;
  padding: 16px 0;
}

.iw-done__check {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(52, 199, 89, 0.08);
  color: #34c759;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 8px;
}

.iw-done__text {
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

/* ── 底部 ── */
.iw-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ── 动画（克制） ── */
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

.iw-pop-enter-active {
  transition: opacity 140ms var(--tk-ease), transform 140ms var(--tk-ease);
}

.iw-pop-leave-active {
  transition: opacity 120ms var(--tk-ease), transform 120ms var(--tk-ease);
}

.iw-pop-enter-from,
.iw-pop-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

@media (prefers-reduced-motion: reduce) {
  .iw-path__dot,
  .iw-download__fill,
  .iw-fade-enter-active,
  .iw-fade-leave-active,
  .iw-pop-enter-active,
  .iw-pop-leave-active {
    transition: none;
  }
}

@keyframes iw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
