<template>
  <div class="clarify-card">
    <div class="clarify-card__header">
      <span class="clarify-card__icon">❓</span>
      <span class="clarify-card__question">{{ question }}</span>
    </div>

    <!-- 多选模式 -->
    <div v-if="choices && choices.length > 0" class="clarify-card__choices">
      <label
        v-for="(choice, i) in displayChoices"
        :key="i"
        class="clarify-card__choice"
        :class="{
          'clarify-card__choice--selected': selectedChoice === choice.value,
          'clarify-card__choice--disabled': submitted,
        }"
      >
        <input
          type="radio"
          :name="`clarify-${toolCallId}`"
          :value="choice.value"
          :checked="selectedChoice === choice.value"
          :disabled="submitted"
          @change="onChoiceChange(choice.value)"
          class="clarify-card__radio"
        />
        <span class="clarify-card__choice-label">{{ choice.label }}</span>
      </label>

      <!-- Other 选中时显示输入框 -->
      <div v-if="showOtherInput" class="clarify-card__other-input">
        <input
          v-model="openAnswer"
          type="text"
          class="clarify-card__other-text"
          :disabled="submitted"
          placeholder="输入你的回答..."
          @keydown.enter.prevent="handleSubmit"
        />
      </div>
    </div>

    <!-- 开放式输入 -->
    <div v-else class="clarify-card__open">
      <textarea
        v-model="openAnswer"
        class="clarify-card__textarea"
        :disabled="submitted"
        :placeholder="'请输入你的回答...'"
        rows="3"
      />
    </div>

    <div class="clarify-card__footer">
      <span v-if="interactionStatus === 'timed_out'" class="clarify-card__timed-out">
        ⏰ 已过期
      </span>
      <span v-else-if="submitted" class="clarify-card__submitted">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        {{ submittedAnswer ? `已回复: ${submittedAnswer}` : '已提交' }}
      </span>
      <button
        v-else
        class="clarify-card__submit"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        提交
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '@/renderer/stores/chat-store'

const props = defineProps<{
  question: string
  choices?: string[] | null
  toolCallId: string
  sessionId: string
  submittedContent?: string
  interactionStatus?: 'pending' | 'approved' | 'rejected' | 'timed_out'
}>()

const chatStore = useChatStore()

const selectedChoice = ref('')
const openAnswer = ref('')
const submitted = ref(false)
const submittedAnswer = ref('')

// 如果有已提交的内容，直接进入已提交状态
if (props.submittedContent) {
  submitted.value = true
  try {
    const parsed = JSON.parse(props.submittedContent)
    const userResponse = (parsed.user_response as string) ?? ''
    submittedAnswer.value = userResponse
    // 尝试匹配已有选项，用于回显选中状态
    if (props.choices && props.choices.length > 0) {
      const match = props.choices.find(c => c === userResponse)
      if (match) {
        selectedChoice.value = match
      } else {
        // 用户通过 Other 输入的自定义回答
        selectedChoice.value = '__other__'
        openAnswer.value = userResponse
      }
    }
  } catch {
    submittedAnswer.value = props.submittedContent
  }
}

const displayChoices = computed(() => {
  if (!props.choices) return []
  // 过滤 LLM 生成的"其他/Other"类选项（与内置 Other 重复——统一走 __other__ 输入框）
  const filtered = props.choices.filter((c) => !/^(其他|其它|Other)([（(：:，,\s]|$)/i.test(c.trim()))
  return [
    ...filtered.map((c) => ({ value: c, label: c })),
    { value: '__other__', label: '其他（在下方输入你的答案）' }
  ]
})

const showOtherInput = computed(() => selectedChoice.value === '__other__')

function onChoiceChange(value: string): void {
  selectedChoice.value = value
  if (value !== '__other__') {
    openAnswer.value = ''
  }
}

const canSubmit = computed(() => {
  if (submitted.value) return false
  if (props.choices && props.choices.length > 0) {
    if (selectedChoice.value === '__other__') {
      return openAnswer.value.trim().length > 0
    }
    return selectedChoice.value.length > 0
  }
  return openAnswer.value.trim().length > 0
})

function handleSubmit(): void {
  let answer: string
  if (props.choices && props.choices.length > 0) {
    if (selectedChoice.value === '__other__') {
      answer = openAnswer.value.trim()
    } else {
      answer = selectedChoice.value
    }
  } else {
    answer = openAnswer.value.trim()
  }
  submitted.value = true
  // 直接调 store action 发送 tool_result，不经过 window 转发
  const result = JSON.stringify({
    question: props.question,
    choices_offered: props.choices ?? null,
    user_response: answer
  })
  chatStore.submitClarify(props.toolCallId, result, props.sessionId)
}
</script>

<style scoped>
.clarify-card {
  background: var(--sa-card-bg, #ffffff);
  border: 1px solid var(--sa-border, #e5e5e5);
  border-radius: 10px;
  padding: 14px 16px;
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.5;
  width: 100%;
  box-sizing: border-box;
}

.clarify-card__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}

.clarify-card__icon {
  flex-shrink: 0;
  font-size: 16px;
  margin-top: 1px;
}

.clarify-card__question {
  font-size: 16px;
  font-weight: 500;
  color: var(--sa-text, #1d1d1f);
}

.clarify-card__choices {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.clarify-card__choice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--sa-border, #e5e5e5);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.clarify-card__choice:hover {
  border-color: var(--sa-accent, #007aff);
  background: var(--sa-bg-hover, #f5f5f7);
}

.clarify-card__choice--selected {
  border-color: var(--sa-accent, #007aff);
  background: rgba(0, 122, 255, 0.06);
}

.clarify-card__choice--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.clarify-card__radio {
  accent-color: var(--sa-accent, #007aff);
}

.clarify-card__choice-label {
  color: var(--sa-text, #1d1d1f);
}

.clarify-card__open {
  margin-bottom: 12px;
}

.clarify-card__textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--sa-border, #e5e5e5);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  color: var(--sa-text, #1d1d1f);
  background: var(--sa-input-bg, #ffffff);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

/* iOS 防止聚焦自动缩放 */
@media (max-width: 767px) {
  .clarify-card__textarea {
    font-size: 16px;
  }
}

.clarify-card__textarea:focus {
  border-color: var(--sa-accent, #007aff);
}

.clarify-card__textarea:disabled,
.clarify-card__other-text:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clarify-card__other-input {
  margin-top: 4px;
}

.clarify-card__other-text {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--sa-border, #e5e5e5);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--sa-text, #1d1d1f);
  background: var(--sa-input-bg, #ffffff);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

/* iOS 防止聚焦自动缩放 */
@media (max-width: 767px) {
  .clarify-card__other-text {
    font-size: 16px;
  }
}

.clarify-card__other-text:focus {
  border-color: var(--sa-accent, #007aff);
}

.clarify-card__footer {
  display: flex;
  justify-content: flex-end;
}

.clarify-card__submit {
  padding: 6px 18px;
  border: none;
  border-radius: 6px;
  background: var(--sa-accent, #007aff);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.clarify-card__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.clarify-card__submit:not(:disabled):hover {
  opacity: 0.85;
}

.clarify-card__submitted {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sa-green, #34c759);
  font-size: 12px;
}

.clarify-card__timed-out {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sa-orange, #ff9500);
  font-size: 12px;
}
</style>
