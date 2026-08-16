<template>
  <L3PageLayout class="install-wizard-page">
    <div class="install-wizard-page__body">
      <!-- 节点进度条 -->
      <div class="iw-track" role="tablist" aria-label="安装步骤">
        <template v-for="(s, i) in steps" :key="s.key">
          <!-- 节点 -->
          <div
            :class="['iw-node', {
              'is-active': currentStep === i,
              'is-done': stepDone(i),
              'is-failed': stepFailed(i),
            }]"
            :aria-current="currentStep === i ? 'step' : undefined"
          >
            <div class="iw-node__badge">
              <!-- 完成：打勾（scale 进入） -->
              <Transition name="iw-badge" mode="out-in">
                <svg v-if="stepDone(i) && !stepFailed(i)" key="check" class="iw-node__check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <!-- 失败：叉 -->
                <svg v-else-if="stepFailed(i)" key="cross" class="iw-node__cross" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                </svg>
                <!-- 序号（当前/待处理） -->
                <span v-else key="num" class="iw-node__num">{{ i + 1 }}</span>
              </Transition>
            </div>
            <span class="iw-node__label">{{ s.label }}</span>
          </div>
          <!-- 连接线（完成段填充——scaleX 从左到右） -->
          <div v-if="i < steps.length - 1" class="iw-track__link">
            <div :class="['iw-track__fill', { 'is-filled': stepDone(i) }]"></div>
          </div>
        </template>
      </div>

      <!-- 内容区（步骤切换——淡入微上移） -->
      <Transition name="iw-content" mode="out-in">
        <div :key="currentStep" class="iw-content">
          <!-- Step 0（npm）：下载安装包 -->
          <div v-if="currentStep === 0 && isNpm" class="iw-download">
            <div v-if="downloading" class="iw-download__progress">
              <div class="iw-download__label">
                <span>正在下载安装包</span>
                <span class="iw-download__pct">{{ downloadPercent > 0 ? `${downloadPercent}%` : '' }}</span>
              </div>
              <div class="iw-download__bar">
                <div class="iw-download__fill" :style="{ transform: `scaleX(${downloadPercent / 100})` }"></div>
              </div>
              <div v-if="downloadPercent > 0" class="iw-download__meta">{{ downloadMeta }}</div>
            </div>
            <div v-else-if="startError" class="iw-error">{{ startError }}</div>
            <div v-else class="iw-download__done">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              安装包已就绪
            </div>
          </div>

          <!-- 确认信息 -->
          <div v-else-if="(isNpm && currentStep === 1) || (!isNpm && currentStep === 0)">
            <div v-if="loading" class="iw-state-text">校验安装包中...</div>
            <div v-else-if="session" class="iw-confirm">
              <div class="iw-plugin-name">
                {{ session.manifest?.name }}
                <span class="iw-version">v{{ session.manifest?.version }}</span>
              </div>
              <div v-if="session.manifest?.capabilities?.length" class="iw-caps">
                <span v-for="c in session.manifest.capabilities" :key="c" class="iw-cap">{{ c }}</span>
              </div>
              <div class="iw-note">安装后插件将以完全权限运行（可读写文件、执行命令、访问网络）——仅安装你信任的来源</div>
            </div>
            <div v-else class="iw-error">{{ startError }}</div>
          </div>

          <!-- 资源勾选 -->
          <div v-else-if="(isNpm && currentStep === 2) || (!isNpm && currentStep === 1)" class="iw-assets">
            <div v-if="!session?.assetDeps?.length" class="iw-state-text">该插件无需下载资源</div>
            <label v-for="dep in session?.assetDeps ?? []" :key="dep.dest" class="iw-asset">
              <input v-model="selectedAssets" type="checkbox" :value="dep.dest" :disabled="!dep.optional" class="iw-asset__input" />
              <div class="iw-asset__box">
                <svg v-if="selectedAssets.includes(dep.dest)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div class="iw-asset__info">
                <div class="iw-asset__name">{{ dep.name }}</div>
                <div class="iw-asset__meta">
                  约 {{ dep.sizeMB }}MB
                  <span v-if="dep.optional" class="iw-asset__tag">可选</span>
                  <span v-else class="iw-asset__tag is-req">必需</span>
                </div>
              </div>
            </label>
          </div>

          <!-- 安装进度（节点式——copy/deps/assets/register） -->
          <div v-else-if="(isNpm && currentStep === 3) || (!isNpm && currentStep === 2)" class="iw-progress">
            <div v-for="stage in installStages" :key="stage" class="iw-stage">
              <div :class="['iw-stage__node', `is-${stageStatus(stage)}`]">
                <Transition name="iw-badge" mode="out-in">
                  <svg v-if="stageStatus(stage) === 'done'" key="check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <svg v-else-if="stageStatus(stage) === 'failed'" key="cross" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                  <span v-else key="dot" class="iw-stage__dot"></span>
                </Transition>
              </div>
              <span class="iw-stage__label">{{ stageLabel(stage) }}</span>
              <span v-if="stageStatus(stage) === 'failed'" class="iw-stage__error">{{ stageError }}</span>
            </div>
            <div v-if="installFailed" class="iw-retry">
              <SaActionBtn text="重试该步" variant="primary" @click="retryFailed" />
            </div>
          </div>

          <!-- 完成 -->
          <div v-else class="iw-done">
            <div class="iw-done__icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
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
/** 安装来源（路由参数） */
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
/** 下载进度（npm） */
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

/** npm 来源有下载步骤（local 无） */
const isNpm = computed(() => session.value?.sourceType === 'npm')

/** 动态步骤（npm：下载→确认→资源→安装→完成；local：确认→资源→安装→完成） */
const steps = computed(() => {
  const base = [
    { key: 'confirm', label: '确认信息' },
    { key: 'assets', label: '依赖资源' },
    { key: 'install', label: '安装' },
    { key: 'done', label: '完成' },
  ]
  if (isNpm.value) {
    return [{ key: 'download', label: '下载安装包' }, ...base]
  }
  return base
})

/** 安装阶段在步骤数组中的偏移（npm 有下载步——安装从 index 3；local 从 2） */
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
    // npm 来源：自动开始下载（进度条）
    if (session.value?.sourceType === 'npm' && pkg.value) {
      await doDownload()
    }
  } catch (e) {
    startError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

/** npm 下载（带进度——事件监听——完成后用返回的 manifest 刷新会话） */
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
    // 下载完成——manifest/资源清单来自返回（validate 已完成——不重复 start）
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
  gap: 20px;
}

/* ── 节点进度条 ── */
.iw-track {
  display: flex;
  align-items: flex-start;
  padding: 4px 0;
}

.iw-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 64px;
  color: var(--tk-text-tertiary);
  transition: color 160ms var(--tk-ease);
}

.iw-node__badge {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms var(--tk-ease), color 160ms var(--tk-ease);
}

.iw-node.is-active .iw-node__badge {
  background: var(--tk-accent);
  color: #fff;
  transform: scale(1.12);
}

.iw-node.is-active {
  color: var(--tk-text-primary);
  font-weight: 500;
}

.iw-node.is-done .iw-node__badge {
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
}

.iw-node.is-failed .iw-node__badge {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.iw-node__num {
  font-size: 12px;
  font-weight: 500;
}

.iw-node__label {
  font-size: 11px;
  white-space: nowrap;
}

.iw-track__link {
  flex: 1;
  height: 2px;
  background: var(--tk-bg-secondary);
  border-radius: 1px;
  margin: 12px 6px 0;
  overflow: hidden;
}

.iw-track__fill {
  height: 100%;
  background: var(--tk-accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-track__fill.is-filled {
  transform: scaleX(1);
}

/* ── 内容切换（淡入微上移——200ms 强 ease-out） ── */
.iw-content {
  min-height: 120px;
}

.iw-content-enter-active {
  transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-content-leave-active {
  transition: opacity 140ms var(--tk-ease), transform 140ms var(--tk-ease);
}

.iw-content-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.iw-content-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 徽章切换（完成勾/叉/序号——旧缩小新放大） */
.iw-badge-enter-active,
.iw-badge-leave-active {
  transition: opacity 140ms var(--tk-ease), transform 140ms var(--tk-ease);
}

.iw-badge-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.iw-badge-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.iw-state-text {
  color: var(--tk-text-secondary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

/* ── 下载进度 ── */
.iw-download__label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  color: var(--tk-text-secondary);
  margin-bottom: 10px;
}

.iw-download__pct {
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--tk-accent);
  font-size: 13px;
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

.iw-download__done {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #34c759;
  font-size: 13px;
  padding: 8px 0;
}

/* ── 确认信息 ── */
.iw-confirm .iw-plugin-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.iw-version {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  font-family: 'SF Mono', 'Menlo', monospace;
  margin-left: 6px;
}

.iw-caps {
  display: flex;
  gap: 6px;
  margin: 10px 0;
  flex-wrap: wrap;
}

.iw-cap {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--tk-bg-secondary);
  font-size: 11px;
  color: var(--tk-text-secondary);
}

.iw-note {
  font-size: 12px;
  color: var(--tk-text-tertiary);
  line-height: 1.5;
  margin-top: 8px;
}

.iw-error {
  color: #ff3b30;
  font-size: 13px;
  padding: 16px 0;
}

/* ── 资源勾选 ── */
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
  transition: border-color 160ms var(--tk-ease), background 160ms var(--tk-ease);
}

.iw-asset:hover {
  border-color: var(--tk-accent);
  background: rgba(0, 122, 255, 0.03);
}

.iw-asset__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.iw-asset__box {
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

.iw-asset__input:checked + .iw-asset__box {
  background: var(--tk-accent);
  border-color: var(--tk-accent);
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

.iw-asset__tag {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  font-size: 10px;
}

.iw-asset__tag.is-req {
  color: var(--tk-accent);
}

/* ── 安装进度（节点式） ── */
.iw-progress {
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
  transition: background 160ms var(--tk-ease), color 160ms var(--tk-ease), transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.iw-stage__node.is-running {
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
  transform: scale(1.1);
}

.iw-stage__node.is-running .iw-stage__dot {
  animation: iw-pulse 1.1s infinite;
}

.iw-stage__node.is-done {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.iw-stage__node.is-failed {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
}

.iw-stage__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tk-bg-secondary);
}

.iw-stage__label {
  flex: 1;
}

.iw-stage__error {
  color: #ff3b30;
  font-size: 12px;
}

.iw-retry {
  margin-top: 6px;
  text-align: right;
}

/* ── 完成 ── */
.iw-done {
  text-align: center;
  padding: 20px 0;
}

.iw-done__icon {
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

@media (prefers-reduced-motion: reduce) {
  .iw-node__badge,
  .iw-track__fill,
  .iw-download__fill,
  .iw-stage__node,
  .iw-content-enter-active,
  .iw-content-leave-active {
    transition: none;
  }
}

@keyframes iw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
