<template>
  <div class="conv-detail-view">
    <div v-if="loading" class="conv-detail-loading">加载中...</div>
    <div v-else-if="error" class="conv-detail-error">{{ error }}</div>
    <template v-else>
      <ToolbarActions>
        <button
          class="toolbar-btn toolbar-btn--danger"
          :disabled="deleting"
          @click="deleteConversation"
          title="删除对话"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M10 2a2 2 0 00-2 2H4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2h-4a2 2 0 00-2-2h-2zm-3 2h6a.5.5 0 010 1H7a.5.5 0 010-1z" />
            <path d="M3 9v11a2 2 0 002 2h10a2 2 0 002-2V9H3zm4 2.5a1 1 0 012 0v7a1 1 0 01-2 0v-7zm5 0a1 1 0 012 0v7a1 1 0 01-2 0v-7z" />
          </svg>
        </button>
      </ToolbarActions>

      <!-- ── 详情页顶部：显示模式切换（对话 / 原文） ── -->
      <div class="conv-detail-mode-bar">
        <div class="view-mode-switch">
          <button
            class="view-mode-switch__item"
            :class="{ 'view-mode-switch__item--active': viewMode === 'chat' }"
            @click="viewMode = 'chat'"
          >对话</button>
          <button
            class="view-mode-switch__item"
            :class="{ 'view-mode-switch__item--active': viewMode === 'raw' }"
            @click="viewMode = 'raw'"
          >原文</button>
        </div>
      </div>

      <!-- ── 原文模式：完整消息表格 ── -->
      <div v-if="viewMode === 'raw'" class="conv-detail-body">
        <table class="conv-detail-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Role</th>
              <th>Type</th>
              <th>Content</th>
              <th>Tool</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(msg, idx) in messages" :key="idx">
              <td class="cell-idx">{{ idx + 1 }}</td>
              <td><span class="role-badge" :class="`role-badge--${msg.role}`">{{ msg.role }}</span></td>
              <td class="cell-type">{{ msg.messageType || '-' }}</td>
              <td class="cell-content">
              <div class="detail-block">
                <div v-if="msg.reasoningContent" class="reasoning-section">
                  <div class="reasoning-header" @click="toggleReasoning(idx)">
                    <span class="reasoning-icon">⟳</span>
                    <span class="reasoning-label">思考过程</span>
                    <span class="reasoning-toggle">{{ reasoningExpanded.has(idx) ? '▲' : '▼' }}</span>
                  </div>
                  <pre v-if="reasoningExpanded.has(idx)" class="reasoning-body">{{ msg.reasoningContent }}</pre>
                </div>
                <div class="detail-block__header" @click="toggleRow(idx)" v-if="hasExpandableContent(msg)">
                  <span class="detail-block__label">内容</span>
                  <span class="detail-block__toggle">{{ expandedRows.has(idx) ? '▲ 收起' : '▼ 展开' }}</span>
                </div>
                <pre v-if="expandedRows.has(idx) && !isJsonContent(msg.content)" class="detail-block__body">{{ formatContent(msg.content) }}</pre>
                <div v-else-if="expandedRows.has(idx) && isJsonContent(msg.content)" class="detail-block__body detail-block__body--json"><JsonTree :value="msg.content" :depth="0" /></div>
                <pre v-else class="detail-block__body detail-block__body--clamped">{{ msg.content }}</pre>
              </div>
            </td>
            <td class="cell-tool">
              <div v-if="msg.toolCall" class="detail-block detail-block--tool">
                <div class="detail-block__header" @click="toggleTool(idx)">
                  <span class="detail-block__label">{{ msg.toolName ? getShortName(msg.toolName) : 'toolCall' }}</span>
                  <span class="detail-block__toggle">{{ toolExpanded.has(idx) ? '▲ 收起' : '▼ 展开' }}</span>
                </div>
                <div v-if="toolExpanded.has(idx)" class="detail-block__body detail-block__body--json"><JsonTree :value="msg.toolCall" :depth="0" /></div>
                <div v-else class="detail-block__summary">{{ toolCallSummary(msg.toolCall) }}</div>
              </div>
              <span v-else>{{ msg.toolName ? getShortName(msg.toolName) : (msg.toolCall ? '✓' : '-') }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── 对话模式：仅用户 + Agent 回复的气泡 ── -->
    <div v-else class="conv-detail-chat">
      <div
        v-for="(msg, idx) in chatMessages"
        :key="idx"
        class="chat-bubble-row"
        :class="`chat-bubble-row--${msg.role}`"
      >
        <div class="chat-bubble__time">{{ formatTime(msg.timestamp) }}</div>
        <div class="chat-bubble" :class="`chat-bubble--${msg.role}`">
          <div v-if="msg.reasoningContent" class="chat-bubble__reasoning">
            <span class="chat-bubble__reasoning-toggle" @click="toggleReasoning(idx)">⟳ 思考过程 {{ reasoningExpanded.has(idx) ? '▲' : '▼' }}</span>
            <pre v-if="reasoningExpanded.has(idx)" class="chat-bubble__reasoning-body">{{ msg.reasoningContent }}</pre>
          </div>
          <MarkdownRender
            v-if="msg.role === 'assistant' && msg.content"
            :content="msg.content"
            :breaks="true"
            :highlight-code="true"
          />
          <div v-else class="chat-bubble__text">{{ msg.content }}</div>
        </div>
      </div>
      <div v-if="chatMessages.length === 0" class="conv-detail-chat__empty">该对话没有气泡消息</div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/renderer/stores/chat-store'
import { getShortName } from '@/renderer/utils/tool-display'
import { formatClockTime } from '@/renderer/utils/date-utils'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import MarkdownRender from '@/renderer/components/MarkdownRender.vue'
import JsonTree from '@/renderer/components/JsonTree.vue'

interface DetailMessage {
  id: number
  sessionId: string
  conversationId: string
  role: string
  messageType: string | null
  content: string
  reasoningContent: string | null
  timestamp: number
  toolCall: string | null
  toolName: string | null
  status: string
}

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()

const sessionId = route.params.sessionId as string
const conversationId = route.params.conversationId as string

const messages = ref<DetailMessage[]>([])
const loading = ref(true)
const error = ref('')
const expandedRows = reactive(new Set<number>())
const reasoningExpanded = reactive(new Set<number>())
const toolExpanded = reactive(new Set<number>())
const deleting = ref(false)

/** 显示模式：'raw' 原文表格（默认） | 'chat' 气泡对话 */
const viewMode = ref<'chat' | 'raw'>('raw')

/** 对话模式：只取用户 + Agent 回复消息 */
const chatMessages = computed(() =>
  messages.value.filter(m => m.role === 'user' || m.role === 'assistant')
)

/** iMessage 式时间戳：HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(() => {
  loadMessages()
})

async function loadMessages() {
  loading.value = true
  error.value = ''
  try {
    // 原文模式需要完整原始 toolCall（normalize 会把 map 拆成第一个工具，丢失后续组）
    const list = await chatStore.listByConversationRaw(conversationId)
    messages.value = list.map(m => ({
      id: Number(m.id),
      sessionId: String(m.sessionId ?? ''),
      conversationId: String(m.conversationId ?? ''),
      role: String(m.role ?? ''),
      messageType: m.messageType ? String(m.messageType) : null,
      content: String(m.content ?? ''),
      reasoningContent: m.reasoningContent ? String(m.reasoningContent) : null,
      timestamp: Number(m.timestamp ?? Date.now()),
      toolCall: m.toolCall == null
        ? null
        : (typeof m.toolCall === 'string'
            ? m.toolCall
            : JSON.stringify(m.toolCall)),
      toolName: m.toolName ? String(m.toolName) : null,
      status: String(m.status ?? '')
    }))
  } catch (err) {
    error.value = (err as Error).message || '加载失败'
  } finally {
    loading.value = false
  }
}

async function deleteConversation() {
  if (deleting.value) return
  deleting.value = true
  try {
    await chatStore.deleteConversation(conversationId, sessionId)
    router.back()
  } catch (err) {
    // 错误提示已由 preload inv 拦截统一派发（GlobalTipToast），此处不再重复
    void err
    deleting.value = false
  }
}

function toggleRow(idx: number) {
  if (expandedRows.has(idx)) {
    expandedRows.delete(idx)
  } else {
    expandedRows.add(idx)
  }
}

function toggleReasoning(idx: number) {
  if (reasoningExpanded.has(idx)) {
    reasoningExpanded.delete(idx)
  } else {
    reasoningExpanded.add(idx)
  }
}

function toggleTool(idx: number) {
  if (toolExpanded.has(idx)) {
    toolExpanded.delete(idx)
  } else {
    toolExpanded.add(idx)
  }
}

function hasExpandableContent(msg: DetailMessage): boolean {
  return isJsonContent(msg.content) || (msg.content?.length ?? 0) > 120
}

function isJsonContent(text: string): boolean {
  if (!text) return false
  const t = text.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

function formatContent(text: string): string {
  if (!text) return ''
  const t = text.trim()
  if ((t.startsWith('{') || t.startsWith('['))) {
    try {
      return JSON.stringify(JSON.parse(t), null, 2)
    } catch {
      return text
    }
  }
  return text
}

/**
 * ToolCall 摘要：兼容三种存储格式，显示组数 + 工具名：
 * - map 格式：{"call_00_xxx": {"name":..., "arguments":...}, ...}   → 共 N 个工具调用: 名字...
 * - 数组格式：[{id,name,arguments,status}, ...]                     → 共 N 个工具调用: 名字...
 * - 单对象格式：{id, name, arguments, status}                        → 工具调用: 名字
 */
function toolCallSummary(tc: string): string {
  if (!tc) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(tc)
  } catch {
    return tc.length > 80 ? tc.slice(0, 80) + '…' : tc
  }
  // 数组格式
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return '空工具调用'
    const names = parsed.map(t => (t && typeof t === 'object' && 'name' in t && typeof (t as {name?: unknown}).name === 'string') ? String((t as {name: string}).name) : '?')
    return parsed.length > 1 ? `共 ${parsed.length} 个工具调用: ${names.join(', ')}` : `工具调用: ${names[0]}`
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    const values = Object.values(obj)
    // map 格式：所有值都是含 name 的对象（{"call_xx": {"name":...}}）
    const isMap = values.length > 0 && values.every(v =>
      v !== null && typeof v === 'object' && !Array.isArray(v) && 'name' in (v as object)
    )
    if (isMap) {
      const names = Object.keys(obj).map(k => String((obj[k] as Record<string, unknown>).name))
      return `共 ${values.length} 个工具调用: ${names.join(', ')}`
    }
    // 单对象格式：{id, name, arguments, status}
    if (typeof obj.name === 'string') return `工具调用: ${obj.name}`
    if (typeof obj.id === 'string') return `工具调用: ${obj.id}`
    // 未知结构 → 截断
    return tc.length > 80 ? tc.slice(0, 80) + '…' : tc
  }
  return tc.length > 80 ? tc.slice(0, 80) + '…' : tc
}
</script>

<style scoped>
/* ══════════════════════
   Conversation Detail View
   ══════════════════════ */

.conv-detail-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--sa-bg-primary, #ffffff);
}

/* ── Status ── */

.conv-detail-loading,
.conv-detail-error {
  text-align: center;
  padding: 48px 20px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 14px;
}
.conv-detail-error {
  color: var(--sa-destructive, #ff3b30);
}

/* ══════════════════════
   Table (wide)
   ══════════════════════ */

.conv-detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.conv-detail-body {
  flex: 1;
  overflow: auto;
  /* 顶部不放 padding：sticky thead 滚到顶时数据会漏进 20px 间距
     顶部留白改由 thead th 的 padding-top 承担（sticky 跟随，不泄漏） */
  padding: 0 20px 20px;
}

.conv-detail-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--sa-bg-primary, #ffffff);
}

.conv-detail-table th {
  text-align: left;
  /* 顶部 20px 留白（替代 conv-detail-body 的原顶部 padding——sticky 跟随不泄漏） */
  padding: 20px 12px 10px;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
  color: var(--sa-text-secondary, #86868b);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

/* Column widths — Content 与 Tool 按比例分配，避免 Content 独占全宽 */
.conv-detail-table th:nth-child(1) { width: 36px; }
.conv-detail-table th:nth-child(2) { width: 88px; }
.conv-detail-table th:nth-child(3) { width: 140px; }
.conv-detail-table th:nth-child(5) { width: 34%; }
/* col 4 (Content) takes the rest */

.conv-detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--sa-border, #d2d2d7);
  color: var(--sa-text-primary, #1d1d1f);
  vertical-align: top;
  line-height: 1.5;
}

/* ── Row number ── */

.cell-idx {
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 11px;
  font-weight: 500;
  padding-top: 12px !important;
}

/* ── Role badge ── */

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.4;
}
.role-badge--user      { background: var(--sa-accent, #007aff); color: #fff; }
.role-badge--assistant { background: #34c759; color: #fff; }
.role-badge--tool      { background: #ff9500; color: #fff; }
.role-badge--system    { background: var(--sa-text-tertiary, #aeaeb2); color: #fff; }
.role-badge--approval  { background: #af52de; color: #fff; }

/* ── Type / Tool ── */

.cell-type,
.cell-tool {
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  word-break: break-all;
}
.cell-tool { max-width: none; }

/* ── Content cell ── */

.cell-content {
  max-width: none;
  word-break: break-word;
  white-space: pre-wrap;
}

/* ══════════════════════
   Reasoning section
   ══════════════════════ */

.reasoning-section {
  margin-bottom: 8px;
  border: 1px solid var(--sa-border, #d2d2d7);
  border-radius: 8px;
  overflow: hidden;
  background: var(--sa-bg-secondary, #f5f5f7);
}

.reasoning-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: #b8860b;
  transition: background 0.15s;
}
.reasoning-header:hover {
  background: color-mix(in srgb, #b8860b 6%, transparent);
}

.reasoning-icon { font-size: 12px; }
.reasoning-label { font-weight: 500; }

.reasoning-toggle {
  margin-left: auto;
  font-size: 10px;
  color: #c4a34c;
}

.reasoning-body {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--sa-border, #d2d2d7);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #8b7355;
  max-height: 240px;
  overflow-y: auto;
}

/* ══════════════════════
   Content block (expandable)
   ══════════════════════ */

.detail-block { margin-bottom: 6px; }
.detail-block:last-child { margin-bottom: 0; }

.detail-block__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  user-select: none;
  font-size: 12px;
  color: var(--sa-text-secondary, #86868b);
  transition: background 0.15s;
}
.detail-block__header:hover {
  background: var(--sa-bg-secondary, #f5f5f7);
}

.detail-block__label {
  font-weight: 500;
  color: var(--sa-text-primary, #1d1d1f);
}

.detail-block__toggle {
  margin-left: auto;
  font-size: 10px;
  color: var(--sa-text-tertiary, #aeaeb2);
}

.detail-block__body {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--sa-text-primary, #1d1d1f);
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 6px;
  max-height: 400px;
  overflow-y: auto;
}

.detail-block__body--clamped {
  max-height: none;
  background: transparent;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Tool 列未展开时的 toolCall 摘要 */
.detail-block__summary {
  padding: 4px 8px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.5;
  word-break: break-all;
  white-space: pre-wrap;
  color: var(--sa-text-secondary, #86868b);
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 6px;
}

/* Tool 列块与 Content 列块视觉对齐 */
.detail-block--tool .detail-block__header { padding-left: 4px; }

/* JSON 树容器：覆盖 pre 的滚动/内边距，树内部自己控制行距 */
.detail-block__body--json {
  overflow-x: auto;
  padding: 8px 10px;
}

/* ══════════════════════
   Narrow: card layout
   ══════════════════════ */

@media (max-width: 560px) {
  .conv-detail-header {
    display: none;
  }

  .conv-detail-table,
  .conv-detail-table thead,
  .conv-detail-table tbody,
  .conv-detail-table tr,
  .conv-detail-table th,
  .conv-detail-table td {
    display: block;
    box-sizing: border-box;
  }

  .conv-detail-table thead {
    display: none;
  }

  .conv-detail-table tbody {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
  }

  .conv-detail-table tr {
    position: relative;
    background: var(--sa-bg-primary, #ffffff);
    border: 1px solid var(--sa-border, #d2d2d7);
    border-radius: 10px;
    padding: 10px 0 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  /* Row number badge — top-right corner */
  .conv-detail-table td:first-child {
    position: absolute;
    top: -1px;
    right: -1px;
    padding: 3px 10px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.5;
    border: none;
    border-radius: 0 10px 0 8px;
    background: var(--sa-accent, #007aff);
    color: #ffffff;
    width: auto;
    text-align: center;
    z-index: 1;
  }

  /* Each cell → label:value row */
  .conv-detail-table td {
    border: none;
    padding: 4px 12px;
    font-size: 12px;
    line-height: 1.5;
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .conv-detail-table td:first-child {
    display: block;
  }

  /* Column name labels */
  .conv-detail-table td:nth-child(2)::before { content: 'Role'; }
  .conv-detail-table td:nth-child(3)::before { content: 'Type'; }
  .conv-detail-table td:nth-child(5)::before { content: 'Tool'; }

  .conv-detail-table td::before {
    font-weight: 500;
    font-size: 10px;
    color: var(--sa-text-tertiary, #aeaeb2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
    min-width: 44px;
    padding-top: 2px;
  }

  /* Content cell — column layout */
  .cell-content {
    flex-direction: column;
    gap: 4px;
    max-width: none;
  }

  .cell-content::before {
    content: 'Content';
    font-weight: 500;
    font-size: 10px;
    color: var(--sa-text-tertiary, #aeaeb2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .conv-detail-table td:last-child {
    padding-bottom: 10px;
  }
}

/* ── 详情页顶部模式切换条 ── */

.conv-detail-mode-bar {
  display: flex;
  justify-content: center;
  padding: 10px 16px 6px;
  flex-shrink: 0;
}

/* ── 显示模式切换 switch ── */

.view-mode-switch {
  display: flex;
  align-items: center;
  background: var(--sa-bg-secondary, #f5f5f7);
  border-radius: 7px;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.view-mode-switch__item {
  all: unset;
  cursor: pointer;
  padding: 3px 10px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 5px;
  color: var(--sa-text-secondary, #86868b);
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
}

.view-mode-switch__item:hover {
  color: var(--sa-text-primary, #1d1d1f);
}

.view-mode-switch__item--active {
  background: var(--sa-bg-primary, #ffffff);
  color: var(--sa-accent, #007aff);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* ── 对话模式：气泡（与主聊天界面 MessageBubble 样式一致） ── */

.conv-detail-chat {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.conv-detail-chat__empty {
  padding: 48px 0;
  text-align: center;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 14px;
}

.chat-bubble-row {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.chat-bubble-row--user {
  align-items: flex-end;
}

.chat-bubble-row--assistant {
  align-items: flex-start;
}

/* iMessage 式时间戳：细灰、小号、居中于发送侧 */
.chat-bubble__time {
  font-size: 11px;
  color: var(--sa-text-tertiary, #aeaeb2);
  margin-bottom: 4px;
}

.chat-bubble {
  max-width: 78%;
  border-radius: 12px;
  padding: 8px 12px;
  min-width: 0;
}

.chat-bubble--user {
  background: var(--sa-accent, #007aff);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.chat-bubble--assistant {
  background: var(--sa-bg-secondary, #f5f5f7);
  color: var(--sa-text-primary, #1d1d1f);
  border-bottom-left-radius: 4px;
}

.chat-bubble__text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-bubble--assistant :deep(.markdown-body) {
  font-size: 14px;
  line-height: 1.6;
  color: var(--sa-text-primary, #1d1d1f);
}

.chat-bubble__reasoning {
  margin-bottom: 8px;
  border-left: 3px solid var(--sa-accent-secondary, #5856d6);
  padding-left: 8px;
}

.chat-bubble__reasoning-toggle {
  font-size: 12px;
  color: var(--sa-text-tertiary, #aeaeb2);
  cursor: pointer;
  user-select: none;
}

.chat-bubble__reasoning-body {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sa-text-secondary, #86868b);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Menlo', monospace;
}
</style>
