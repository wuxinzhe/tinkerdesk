<template>
  <div class="agent-settings">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><circle cx=&quot;12&quot; cy=&quot;12&quot; r=&quot;3&quot;/><path d=&quot;M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.51.26A1.65 1.65 0 0113 21a2 2 0 01-4 0 1.65 1.65 0 00-1.43-1.01 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z&quot;/></svg>"
      gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      title="Agent 设置"
      desc="该 Agent 的运行参数与安全策略"
    />
    <div class="agent-settings__header">
      <span class="agent-settings__title">Agent 设置</span>
      <div class="agent-settings__header-actions">
        <button class="agent-settings__reset-btn" @click="resetDefaults">
          还原默认值
        </button>
      </div>
    </div>

    <!-- 保存按钮 teleport 到 L3 工具栏右侧 -->
    <!-- v-if="mounted" 防止目标 div #l3-toolbar-actions 在首次渲染时尚未挂载 -->
    <Teleport v-if="mounted" to="#l3-toolbar-actions">
      <button class="agent-settings__save-btn" :class="{ saving }" :disabled="saving" :title="saving ? '保存中…' : '保存'" @click="saveSettings">
        <div class="agent-settings__save-icon-wrap">
          <svg v-if="saving" class="agent-settings__save-ring" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4da6ff" stroke-width="2.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="10" stroke-dasharray="47" stroke-dashoffset="0" transform="rotate(-90 12 12)" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
        </div>
      </button>
    </Teleport>

    <div v-if="loading" class="agent-settings__loading">
      加载中...
    </div>

    <form v-else class="agent-settings__form" @submit.prevent="saveSettings">
      <!-- ── 灵魂提示词 ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          灵魂提示词
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row settings-field__row--textarea">
              <div class="settings-field__label">
                <label>提示词</label>
                <span class="settings-tip" @click.stop="toggleTip('agentSoulPrompt')" @mouseenter="hoverTip('agentSoulPrompt')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'agentSoulPrompt'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>覆盖 Agent 默认的系统人格设定。留空则使用 Agent 默认的灵魂提示词。</p>
                </div>
              </div>
            </div>
            <textarea v-model="config.agentSoulPrompt" rows="4" placeholder="留空使用 Agent 默认灵魂提示词" class="settings-field__textarea"></textarea>
          </div>
        </div>
      </div>

      <!-- ── 迭代与超时 ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          迭代与超时
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>最大迭代次数</label>
                <span class="settings-tip" @click.stop="toggleTip('maxIterations')" @mouseenter="hoverTip('maxIterations')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'maxIterations'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>单次任务最大迭代轮数。值越大，Agent 能处理更复杂的多步骤任务，但也会消耗更多 token。</p>
                  <p class="settings-tip__rec">
                    推荐范围：30–200，默认 90
                  </p>
                </div>
              </div>
              <input v-model.number="config.maxIterations" type="number" min="1" max="500" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>工具执行超时（秒）</label>
                <span class="settings-tip" @click.stop="toggleTip('toolExecutionTimeout')" @mouseenter="hoverTip('toolExecutionTimeout')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'toolExecutionTimeout'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>每个工具调用等待结果的最长时间。</p>
                  <p class="settings-tip__rec">
                    推荐范围：30–300，默认 120
                  </p>
                </div>
              </div>
              <input v-model.number="config.toolExecutionTimeout" type="number" min="5" max="600" class="settings-field__input" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── 上下文管理 ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          上下文管理
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>加载对话数上限</label>
                <span class="settings-tip" @click.stop="toggleTip('maxConversations')" @mouseenter="hoverTip('maxConversations')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'maxConversations'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>加载到 LLM 上下文中的完整对话轮次上限。</p>
                  <p class="settings-tip__rec">
                    推荐范围：3–20，默认 5
                  </p>
                </div>
              </div>
              <input v-model.number="config.maxConversations" type="number" min="1" max="50" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>日常记忆最大字符</label>
                <span class="settings-tip" @click.stop="toggleTip('memoryMaxChars')" @mouseenter="hoverTip('memoryMaxChars')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'memoryMaxChars'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>压缩后的记忆摘要保留的字符上限。</p>
                  <p class="settings-tip__rec">
                    推荐范围：500–5000，默认 2200
                  </p>
                </div>
              </div>
              <input v-model.number="config.memoryMaxChars" type="number" min="100" max="10000" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>用户画像记忆最大字符</label>
                <span class="settings-tip" @click.stop="toggleTip('userMaxChars')" @mouseenter="hoverTip('userMaxChars')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'userMaxChars'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>Agent 自动记录的用户习惯画像（User Profile/Snapshot）保留的字符上限。超出时写入被拒绝，Agent 自行管理。</p>
                  <p class="settings-tip__rec">
                    推荐范围：500–5000，默认 1375
                  </p>
                </div>
              </div>
              <input v-model.number="config.userMaxChars" type="number" min="100" max="10000" class="settings-field__input" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── 上下文阈值 ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          上下文阈值
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>阈值百分比</label>
                <span class="settings-tip" @click.stop="toggleTip('thresholdPercent')" @mouseenter="hoverTip('thresholdPercent')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'thresholdPercent'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>上下文使用率达到此比例时触发压缩。</p>
                  <p class="settings-tip__rec">
                    推荐范围：30%–80%，默认 50%
                  </p>
                </div>
              </div>
              <div class="settings-field__input-wrap">
                <input v-model.number="config.thresholdPercent" type="number" min="1" max="100" step="1" class="settings-field__input" />
                <span class="settings-field__input-suffix">%</span>
              </div>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>尾部比例</label>
                <span class="settings-tip" @click.stop="toggleTip('tailRatio')" @mouseenter="hoverTip('tailRatio')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'tailRatio'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>压缩时保留最新消息内容的比例。</p>
                  <p class="settings-tip__rec">
                    推荐范围：10%–50%，默认 20%
                  </p>
                </div>
              </div>
              <div class="settings-field__input-wrap">
                <input v-model.number="config.tailRatio" type="number" min="1" max="100" step="1" class="settings-field__input" />
                <span class="settings-field__input-suffix">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 工具循环护栏（警告） ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          工具循环护栏 · 警告
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row settings-field__row--checkbox">
              <div class="settings-field__label">
                <label>启用警告</label>
                <span class="settings-tip" @click.stop="toggleTip('warningsEnabled')" @mouseenter="hoverTip('warningsEnabled')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'warningsEnabled'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>开启后，工具重复失败或异常时会向 LLM 发出警告提示。</p>
                </div>
              </div>
              <label class="settings-switch">
                <input v-model="config.warningsEnabled" type="checkbox" />
                <span class="settings-switch__slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>精确失败警告阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('exactFailureWarnAfter')" @mouseenter="hoverTip('exactFailureWarnAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'exactFailureWarnAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>连续执行失败达到此次数时发出警告。</p>
                  <p class="settings-tip__rec">
                    推荐范围：1–10，默认 2
                  </p>
                </div>
              </div>
              <input v-model.number="config.exactFailureWarnAfter" type="number" min="1" max="20" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>同一工具失败警告阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('sameToolFailureWarnAfter')" @mouseenter="hoverTip('sameToolFailureWarnAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'sameToolFailureWarnAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>同一工具连续失败达到此次数时发出警告。</p>
                  <p class="settings-tip__rec">
                    推荐范围：1–10，默认 3
                  </p>
                </div>
              </div>
              <input v-model.number="config.sameToolFailureWarnAfter" type="number" min="1" max="20" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>无进展警告阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('noProgressWarnAfter')" @mouseenter="hoverTip('noProgressWarnAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'noProgressWarnAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>连续无进展轮次达到此次数时发出警告。</p>
                  <p class="settings-tip__rec">
                    推荐范围：1–10，默认 2
                  </p>
                </div>
              </div>
              <input v-model.number="config.noProgressWarnAfter" type="number" min="1" max="20" class="settings-field__input" />
            </div>
          </div>
        </div>
      </div>

      <!-- ── 工具循环护栏（封锁） ── -->
      <div class="settings-group">
        <h3 class="settings-group__title">
          工具循环护栏 · 封锁
        </h3>
        <div class="settings-group__card">
          <div class="settings-field">
            <div class="settings-field__row settings-field__row--checkbox">
              <div class="settings-field__label">
                <label>启用硬停止</label>
                <span class="settings-tip" @click.stop="toggleTip('hardStopEnabled')" @mouseenter="hoverTip('hardStopEnabled')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'hardStopEnabled'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>达到封锁阈值时强制终止任务，而非仅发出警告。</p>
                </div>
              </div>
              <label class="settings-switch">
                <input v-model="config.hardStopEnabled" type="checkbox" />
                <span class="settings-switch__slider"></span>
              </label>
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>精确失败封锁阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('exactFailureBlockAfter')" @mouseenter="hoverTip('exactFailureBlockAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'exactFailureBlockAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>连续执行失败达到此次数时强制封锁（需启用硬停止）。</p>
                  <p class="settings-tip__rec">
                    推荐范围：3–20，默认 5
                  </p>
                </div>
              </div>
              <input v-model.number="config.exactFailureBlockAfter" type="number" min="1" max="50" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>同一工具失败封锁阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('sameToolFailureHaltAfter')" @mouseenter="hoverTip('sameToolFailureHaltAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'sameToolFailureHaltAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>同一工具连续失败达到此次数时强制停止。</p>
                  <p class="settings-tip__rec">
                    推荐范围：3–20，默认 8
                  </p>
                </div>
              </div>
              <input v-model.number="config.sameToolFailureHaltAfter" type="number" min="1" max="50" class="settings-field__input" />
            </div>
          </div>
          <div class="settings-field">
            <div class="settings-field__row">
              <div class="settings-field__label">
                <label>无进展封锁阈值</label>
                <span class="settings-tip" @click.stop="toggleTip('noProgressBlockAfter')" @mouseenter="hoverTip('noProgressBlockAfter')" @mouseleave="deferHideTip">?</span>
                <div v-if="tipField === 'noProgressBlockAfter'" class="settings-tip__bubble" @click.stop="tipField = null" @mouseenter="cancelHideTip" @mouseleave="deferHideTip">
                  <p>连续无进展轮次达到此次数时强制终止。</p>
                  <p class="settings-tip__rec">
                    推荐范围：3–20，默认 5
                  </p>
                </div>
              </div>
              <input v-model.number="config.noProgressBlockAfter" type="number" min="1" max="50" class="settings-field__input" />
            </div>
          </div>
        </div>
      </div>

      <p v-if="error" class="agent-settings__error">
        {{ error }}
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import SaPageHero from '@/renderer/components/SaPageHero.vue'
import { agentConfigApi } from '@/renderer/api/agent-config-api'
import type { AgentConfigData } from '@/renderer/api/types'

const route = useRoute()
const profile = computed(() => (route.params.profile as string) || 'default')

const mounted = ref(false)
const loading = ref(true)
const saving = ref(false)
const error = ref('')

const config = reactive({} as AgentConfigData)

const tipField = ref<string | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | null = null

function toggleTip(name: string) {
  tipField.value = tipField.value === name ? null : name
}

function hoverTip(name: string | null) {
  if (tipTimer) { clearTimeout(tipTimer); tipTimer = null }
  tipField.value = name
}

function deferHideTip() {
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => { tipField.value = null }, 200)
}

function cancelHideTip() {
  if (tipTimer) { clearTimeout(tipTimer); tipTimer = null }
}

function closeTipOnOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.settings-tip__bubble') && !target.closest('.settings-tip')) {
    tipField.value = null
  }
}

async function saveSettings() {
  saving.value = true
  error.value = ''
  try {
    // 前端展示百分比 (50/20)，提交时转小数 (0.50/0.20)
    const payload = {
      ...config,
      thresholdPercent: (config.thresholdPercent ?? 0) / 100,
      tailRatio: (config.tailRatio ?? 0) / 100,
    }
    await agentConfigApi.update(profile.value, payload)
  } catch (e) {
    error.value = (e as Error).message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function resetDefaults() {
  saving.value = true
  error.value = ''
  try {
    const data = await agentConfigApi.reset(profile.value)
    // 同 loadConfig：小数转百分比
    Object.assign(config, data)
    config.thresholdPercent = Math.round((data.thresholdPercent ?? 0) * 100)
    config.tailRatio = Math.round((data.tailRatio ?? 0) * 100)
  } catch (e) {
    error.value = (e as Error).message ?? '重置失败'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  mounted.value = true
  loadConfig()
  document.addEventListener('click', closeTipOnOutside)
})

// 切换 agent-item 时重新加载配置（含模块级去重，防 default+level3 双实例）
/** 模块级去重：同一 profile 只发一次请求（default+level3 双 slot 共用同一组件） */
const loadedProfile = ref('')

// 切换 agent-item 时重新加载配置
watch(profile, () => {
  loadedProfile.value = ''
  loadConfig()
})

async function loadConfig() {
  const p = profile.value
  if (p === loadedProfile.value && loadedProfile.value !== '') return
  loadedProfile.value = p
  loading.value = true
  try {
    const data = await agentConfigApi.get(p)
    // 后端存小数 (0.50/0.20)，前端展示百分比 (50/20)
    Object.assign(config, data)
    config.thresholdPercent = Math.round((data.thresholdPercent ?? 0) * 100)
    config.tailRatio = Math.round((data.tailRatio ?? 0) * 100)
  } catch {
    // 使用默认值
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('click', closeTipOnOutside)
})
</script>
<style scoped>
/* ═══════════════════════════════════════════════
   Apple HIG 分组卡片风格
   ═══════════════════════════════════════════════ */

.agent-settings {
  padding: 20px 24px;
  max-width: 680px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow-y: auto;
}

.agent-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}
.agent-settings__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--tk-text-primary);
  letter-spacing: -0.3px;
}
.agent-settings__header-actions {
  display: flex;
  gap: 8px;
}
.agent-settings__reset-btn {
  padding: 6px 14px;
  border: 1px solid var(--tk-border-card);
  border-radius: 8px;
  background: var(--tk-bg-primary);
  box-shadow: var(--tk-shadow-card);
  color: var(--tk-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.agent-settings__reset-btn:active {
  transform: scale(0.97);
}
@media (hover: hover) and (pointer: fine) {
  .agent-settings__reset-btn:hover {
    background: var(--tk-bg-secondary);
    color: var(--tk-accent);
  }
}
.agent-settings__save-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.agent-settings__save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.agent-settings__save-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}
.agent-settings__save-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  margin: -12px 0 0 -12px;
  animation: agent-settings-ring-spin 0.5s linear infinite;
}
@keyframes agent-settings-ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.agent-settings__loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tk-text-tertiary);
  font-size: 13px;
}

.agent-settings__form {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.agent-settings__form {
  /* 滚动条全局统一（variables.css 3px 圆角） */
}

.agent-settings__error {
  color: var(--tk-destructive);
  font-size: 12px;
  margin-top: 12px;
}

/* ── Group（每个分组区块） ── */

.settings-group {
  margin-bottom: 24px;
}

.settings-group__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tk-text-primary);
  margin: 0 0 6px 16px;
}

.settings-group__card {
  background: var(--tk-bg-primary);
  border-radius: 10px;
  /* overflow:hidden clips absolute-positioned tip bubbles */
}

/* ── Field（每行设置项） ── */

.settings-field {
  position: relative;
  padding-bottom: 8px;
}

.settings-field + .settings-field {
  border-top: 1px solid var(--tk-border-light);
}

.settings-field__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  min-height: 40px;
  gap: 12px;
}

.settings-field__row--checkbox {
  padding: 8px 16px;
}

.settings-field__row--textarea {
  padding: 10px 16px 4px;
}

/* ── 标签区（含问号气泡） ── */

.settings-field__label {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  position: relative;
}
.settings-field__label label {
  font-size: 13px;
  color: var(--tk-text-primary);
  white-space: nowrap;
}

/* ── 数字输入 ── */

.settings-field__input[type='number'] {
  width: 72px;
  padding: 4px 8px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  text-align: right;
  flex-shrink: 0;
  outline: none;
  transition: border-color 0.15s;
}
.settings-field__input[type='number']:focus {
  border-color: var(--tk-accent);
}

/* ── 输入框单位后缀（如 %） ── */

.settings-field__input-wrap {
  position: relative;
  flex-shrink: 0;
}
.settings-field__input-wrap .settings-field__input {
  padding-right: 22px;
}
.settings-field__input-suffix {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--tk-text-tertiary);
  font-size: 13px;
  line-height: 1;
}

/* ── 文本输入 ── */

.settings-field__textarea {
  width: calc(100% - 32px);
  margin: 0 16px 10px;
  padding: 8px 12px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
  display: block;
}
.settings-field__textarea:focus {
  border-color: var(--tk-accent);
}

/* ── 问号图标 ── */

.settings-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
  user-select: none;
  line-height: 1;
}
.settings-tip:hover {
  background: var(--tk-accent);
  color: #fff;
}

/* ── 气泡 ── */

.settings-tip__bubble {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 220px;
  max-width: 300px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tk-bg-primary);
  box-shadow: 0 4px 16px rgba(0,0,0,0.13);
  font-size: 11px;
  line-height: 1.5;
  color: var(--tk-text-primary);
  pointer-events: auto;
}
.settings-tip__bubble p {
  margin: 0 0 4px;
}
.settings-tip__bubble p:last-child {
  margin-bottom: 0;
}
.settings-tip__rec {
  color: var(--tk-text-tertiary);
  font-size: 10px;
}

/* ── iOS 风格 Switch ── */

.settings-switch {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}
.settings-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.settings-switch__slider {
  position: absolute;
  inset: 0;
  background: var(--tk-border);
  border-radius: 12px;
  transition: background 0.2s;
}
.settings-switch__slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.settings-switch input:checked + .settings-switch__slider {
  background: var(--tk-accent);
}
.settings-switch input:checked + .settings-switch__slider::before {
  transform: translateX(18px);
}
</style>