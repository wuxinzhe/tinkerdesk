<template>
  <L3PageLayout class="install-wizard-page">
    <div class="install-wizard-page__body">
      <div class="iw-panel">
        <!-- 标题 -->
        <div class="iw-header">
          <div class="iw-title">安装插件</div>

        <!-- 步骤条 -->
        <div class="iw-steps">
          <div
            v-for="(s, i) in steps"
            :key="s.key"
            :class="['iw-step', { active: currentStep === i, done: stepDone(i), failed: stepFailed(i) }]"
          >
            <div class="iw-step__num">{{ stepDone(i) ? '✓' : i + 1 }}</div>
            <div class="iw-step__label">{{ s.label }}</div>
          </div>
        </div>

        <div class="iw-body">
          <!-- Step 0（npm）：下载安装包 -->
          <div v-if="currentStep === 0 && isNpm" class="iw-download">
            <div v-if="downloading" class="iw-download__progress">
              <div class="iw-download__label">
                正在下载安装包...
                <span class="iw-download__pct">{{ downloadPercent > 0 ? `${downloadPercent}%` : '' }}</span>
              </div>
              <div class="iw-download__bar">
                <div class="iw-download__fill" :style="{ width: `${downloadPercent}%` }"></div>
              </div>
              <div v-if="downloadPercent > 0" class="iw-download__meta">{{ downloadMeta }}</div>
            </div>
            <div v-else-if="startError" class="iw-error">{{ startError }}</div>
            <div v-else class="iw-download__done">✓ 安装包下载完成</div>
          </div>

          <!-- Step 1/0：确认信息 -->
          <div v-else-if="(isNpm && currentStep === 1) || (!isNpm && currentStep === 0)">
            <div v-if="loading" class="iw-loading">校验安装包中...</div>
            <div v-else-if="session" class="iw-confirm">
              <div class="iw-plugin-name">{{ session.manifest?.name }} <span class="iw-version">v{{ session.manifest?.version }}</span></div>
              <div v-if="session.manifest?.capabilities?.length" class="iw-caps">
                <span v-for="c in session.manifest.capabilities" :key="c" class="iw-cap">{{ c }}</span>
              </div>
              <div class="iw-note">安装后插件将以完全权限运行（可读写文件、执行命令、访问网络）——仅安装你信任的来源</div>
            </div>
            <div v-else class="iw-error">{{ startError }}</div>
          </div>

          <!-- Step 2/1：资源勾选 -->
          <div v-else-if="(isNpm && currentStep === 2) || (!isNpm && currentStep === 1)" class="iw-assets">
            <div v-if="!session?.assetDeps?.length" class="iw-note">该插件无需下载资源（无模型/二进制依赖）</div>
            <label v-for="dep in session?.assetDeps ?? []" :key="dep.dest" class="iw-asset">
              <input v-model="selectedAssets" type="checkbox" :value="dep.dest" :disabled="!dep.optional" />
              <div class="iw-asset__info">
                <div class="iw-asset__name">{{ dep.name }}</div>
                <div class="iw-asset__meta">
                  约 {{ dep.sizeMB }}MB
                  <span v-if="dep.optional" class="iw-asset__optional">可选（可跳过）</span>
                  <span v-else class="iw-asset__required">必需</span>
                </div>
              </div>
            </label>
          </div>

          <!-- Step 3/2：安装进度 -->
          <div v-else-if="(isNpm && currentStep === 3) || (!isNpm && currentStep === 2)" class="iw-progress">
            <div v-for="stage in installStages" :key="stage" class="iw-stage">
              <span :class="['iw-stage__dot', stageStatus(stage)]"></span>
              <span class="iw-stage__label">{{ stageLabel(stage) }}</span>
              <span v-if="stageStatus(stage) === 'failed'" class="iw-stage__error">{{ stageError }}</span>
            </div>
            <div v-if="installFailed" class="iw-retry">
              <SaActionBtn text="重试该步" variant="primary" @click="retryFailed" />
            </div>
          </div>

          <!-- Step 4/3：完成 -->
          <div v-else class="iw-done">
            <div class="iw-done__icon">✓</div>
            <div class="iw-done__text">安装完成</div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="iw-footer">
          <template v-if="currentStep === 0 && isNpm">
            <SaActionBtn text="取消" @click="close" />
            <SaActionBtn text="下一步" variant="primary" :disabled="loading || !session" @click="next" />
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
import { SaActionBtn } from '@/renderer/components'
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
  if (i === 0 && isNpm.value) return !!session.value
  if (i === 0 && !isNpm.value) return !!session.value
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
}

.iw-panel {
  width: 100%;
  max-width: 460px;
  background: var(--tk-bg-primary);
  border: 1px solid var(--tk-border);
  border-radius: 12px;
  overflow: hidden;
}

.iw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.iw-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--tk-text-primary);
}

.iw-close {
  border: none;
  background: transparent;
  color: var(--tk-text-tertiary);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
}

.iw-steps {
  display: flex;
  padding: 16px 20px 0;
  gap: 0;
}

.iw-step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tk-text-tertiary);
}

.iw-step__num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-secondary);
  flex-shrink: 0;
}

.iw-step.active .iw-step__num {
  background: var(--tk-accent);
  color: #fff;
}

.iw-step.active {
  color: var(--tk-text-primary);
  font-weight: 500;
}

.iw-step.done .iw-step__num {
  background: rgba(0, 122, 255, 0.12);
  color: var(--tk-accent);
}

.iw-step.failed .iw-step__num {
  background: rgba(255, 59, 48, 0.12);
  color: #ff3b30;
}

.iw-body {
  padding: 16px 20px;
  min-height: 120px;
}

.iw-download__progress {
  padding: 8px 0;
}

.iw-download__label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--tk-text-secondary);
  margin-bottom: 8px;
}

.iw-download__pct {
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--tk-accent);
}

.iw-download__bar {
  height: 6px;
  border-radius: 3px;
  background: var(--tk-bg-secondary);
  overflow: hidden;
}

.iw-download__fill {
  height: 100%;
  border-radius: 3px;
  background: var(--tk-accent);
  transition: width 0.2s ease-out;
}

.iw-download__meta {
  font-size: 11px;
  color: var(--tk-text-tertiary);
  margin-top: 6px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

.iw-download__done {
  color: #34c759;
  font-size: 13px;
  padding: 8px 0;
}

.iw-loading {
  color: var(--tk-text-secondary);
  font-size: 13px;
  padding: 24px 0;
  text-align: center;
}

.iw-confirm .iw-plugin-name {
  font-size: 15px;
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
  margin: 8px 0;
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

.iw-assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.iw-asset {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  cursor: pointer;
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
}

.iw-asset__optional {
  color: var(--tk-text-tertiary);
}

.iw-asset__required {
  color: var(--tk-accent);
}

.iw-progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.iw-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--tk-text-secondary);
}

.iw-stage__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tk-bg-secondary);
  flex-shrink: 0;
}

.iw-stage__dot.running {
  background: var(--tk-accent);
  animation: iw-pulse 1s infinite;
}

.iw-stage__dot.done {
  background: #34c759;
}

.iw-stage__dot.failed {
  background: #ff3b30;
}

.iw-stage__error {
  color: #ff3b30;
  font-size: 12px;
  margin-left: auto;
}

.iw-retry {
  margin-top: 8px;
  text-align: right;
}

.iw-done {
  text-align: center;
  padding: 16px 0;
}

.iw-done__icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(52, 199, 89, 0.12);
  color: #34c759;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  margin: 0 auto 8px;
}

.iw-done__text {
  font-size: 14px;
  font-weight: 500;
  color: var(--tk-text-primary);
}

.iw-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--tk-border);
}

@keyframes iw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
