<template>
  <Teleport to="body">
    <div v-if="visible" class="iw-overlay" @click.self="close">
      <div class="iw-panel">
        <!-- 标题 + 关闭 -->
        <div class="iw-header">
          <div class="iw-title">安装插件</div>
          <button class="iw-close" @click="close">✕</button>
        </div>

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
          <!-- Step 1：确认信息 -->
          <div v-if="currentStep === 0">
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

          <!-- Step 2：资源勾选 -->
          <div v-else-if="currentStep === 1" class="iw-assets">
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

          <!-- Step 3：安装进度 -->
          <div v-else-if="currentStep === 2" class="iw-progress">
            <div v-for="stage in installStages" :key="stage" class="iw-stage">
              <span :class="['iw-stage__dot', stageStatus(stage)]"></span>
              <span class="iw-stage__label">{{ stageLabel(stage) }}</span>
              <span v-if="stageStatus(stage) === 'failed'" class="iw-stage__error">{{ stageError }}</span>
            </div>
            <div v-if="installFailed" class="iw-retry">
              <SaActionBtn text="重试该步" variant="primary" @click="retryFailed" />
            </div>
          </div>

          <!-- Step 4：完成 -->
          <div v-else class="iw-done">
            <div class="iw-done__icon">✓</div>
            <div class="iw-done__text">安装完成</div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="iw-footer">
          <template v-if="currentStep === 0">
            <SaActionBtn text="取消" @click="close" />
            <SaActionBtn text="下一步" variant="primary" :disabled="!session || loading" @click="next" />
          </template>
          <template v-else-if="currentStep === 1">
            <SaActionBtn text="上一步" @click="currentStep = 0" />
            <SaActionBtn text="开始安装" variant="primary" @click="startInstall" />
          </template>
          <template v-else-if="currentStep === 2">
            <SaActionBtn v-if="!installFailed" text="安装中..." :loading="true" disabled />
          </template>
          <template v-else>
            <SaActionBtn text="完成" variant="primary" @click="finish" />
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { InstallSessionInfo } from '@/renderer/api/types'
import { SaActionBtn } from '@/renderer/components'
import { pluginsApi } from '@/renderer/api/plugins-api'

const props = defineProps<{ pkg?: string; path?: string }>()
const emit = defineEmits<{ close: []; installed: [id: string] }>()

const visible = ref(true)
const loading = ref(false)
const startError = ref('')
const session = ref<InstallSessionInfo | null>(null)
const currentStep = ref(0)
const selectedAssets = ref<string[]>([])
const installFailed = ref(false)
const stageError = ref('')

const steps = [
  { key: 'confirm', label: '确认信息' },
  { key: 'assets', label: '依赖资源' },
  { key: 'install', label: '安装' },
  { key: 'done', label: '完成' },
]

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
  if (i === 2) return currentStep.value >= 3
  return currentStep.value >= 3
}

function stepFailed(i: number): boolean {
  return i === 2 && installFailed.value
}

watch(
  () => props.pkg,
  () => visible.value && start(),
)

onMounted(start)

async function start() {
  loading.value = true
  startError.value = ''
  try {
    session.value = await pluginsApi.installStart({
      pkg: props.pkg,
      path: props.path,
    })
    selectedAssets.value = (session.value?.assetDeps ?? []).filter((d) => !d.optional).map((d) => d.dest)
  } catch (e) {
    startError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function next() {
  currentStep.value = 1
}

async function startInstall() {
  currentStep.value = 2
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
  currentStep.value = 3
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
  currentStep.value = 3
}

function finish() {
  emit('installed', session.value?.manifest?.id ?? '')
  close()
}

function close() {
  visible.value = false
  emit('close')
}
</script>

<style scoped>
.iw-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.iw-panel {
  width: 460px;
  max-width: calc(100vw - 32px);
  background: var(--tk-bg-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
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
