<template>
  <div class="conv-detail-view">
    <div v-if="loading" class="conv-detail-loading">
      加载中...
    </div>
    <div v-else-if="error" class="conv-detail-error">
      {{ error }}
    </div>
    <template v-else>
      <ToolbarActions>
        <button
          class="toolbar-btn toolbar-btn--danger"
          :disabled="deleting"
          title="删除对话"
          @click="deleteConversation"
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
          >
            对话
          </button>
          <button
            class="view-mode-switch__item"
            :class="{ 'view-mode-switch__item--active': viewMode === 'raw' }"
            @click="viewMode = 'raw'"
          >
            原文
          </button>
        </div>
      </div>

      <!-- ── 原文模式：完整消息表格 ── -->
      <div v-if="viewMode === 'raw'" class="conv-detail-body">
        <table class="conv-detail-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Role</th>
              <th>Content</th>
              <th>Tool</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(msg, idx) in messages" :key="idx">
              <td class="cell-idx">
                {{ msg.id }}
              </td>
              <td><span class="role-badge" :class="`role-badge--${msg.role}`">{{ msg.role }}</span></td>
              <td class="cell-content">
                <div class="detail-block">
                  <div v-if="msg.reasoningContent" class="reasoning-section">
                    <div class="reasoning-header" @click="toggleReasoning(idx)">
                      <svg class="reasoning-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span class="reasoning-label">思考过程</span>
                      <svg
                        class="reasoning-arrow"
                        :class="{ 'reasoning-arrow--open': reasoningExpanded.has(idx) }"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                    <pre v-if="reasoningExpanded.has(idx)" class="reasoning-body">{{ msg.reasoningContent }}</pre>
                  </div>
                  <div v-if="hasExpandableContent(msg)" class="detail-block__header" @click="toggleRow(idx)">
                    <span class="detail-block__label">内容</span>
                    <svg
                      class="detail-block__chevron"
                      :class="{ 'detail-block__chevron--open': expandedRows.has(idx) }"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span class="detail-block__toggle">{{ expandedRows.has(idx) ? '收起' : '展开' }}</span>
                  </div>
                  <pre v-if="expandedRows.has(idx) && !isJsonContent(msg.content)" class="detail-block__body">{{ formatContent(msg.content) }}</pre>
                  <div v-else-if="expandedRows.has(idx) && isJsonContent(msg.content)" class="detail-block__body detail-block__body--json">
                    <JsonTree :value="msg.content" :depth="0" />
                  </div>
                  <pre v-else class="detail-block__body detail-block__body--clamped">{{ msg.content }}</pre>
                </div>
              </td>
              <td class="cell-tool">
                <div v-if="msg.toolCall" class="detail-block detail-block--tool">
                  <div class="detail-block__header" @click="toggleTool(idx)">
                    <span class="detail-block__label">{{ msg.toolName ? getShortName(msg.toolName) : 'toolCall' }}</span>
                    <svg
                      class="detail-block__chevron"
                      :class="{ 'detail-block__chevron--open': toolExpanded.has(idx) }"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span class="detail-block__toggle">{{ toolExpanded.has(idx) ? '收起' : '展开' }}</span>
                  </div>
                  <div v-if="toolExpanded.has(idx)" class="detail-block__body detail-block__body--json">
                    <JsonTree :value="msg.toolCall" :depth="0" />
                  </div>
                  <div v-else class="detail-block__summary">
                    {{ toolCallSummary(msg.toolCall) }}
                  </div>
                </div>
                <span v-else>{{ msg.toolName ? getShortName(msg.toolName) : (msg.toolCall ? '✓' : '-') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── 对话模式：MessageBubble（工具/混合/审批/澄清卡 + 气泡内思考过程——仅本页显示） ── -->
      <div v-else class="conv-detail-chat">
        <div
          v-for="(msg, idx) in visibleChatMessages"
          :key="String(msg.id ?? idx)"
          class="conv-chat-item"
          :class="`conv-chat-item--${msg.role}`"
        >
          <MessageBubbleComponent
            :message="msg"
            :is-streaming="false"
            :is-last="idx === visibleChatMessages.length - 1"
            :show-reasoning="true"
          />
        </div>
        <div v-if="visibleChatMessages.length === 0" class="conv-detail-chat__empty">
          <div class="conv-detail-chat__empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p>该对话没有消息</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/renderer/stores/chat-store'
import { getShortName } from '@/renderer/utils/tool-display'
import ToolbarActions from '@/renderer/components/workspace/ToolbarActions.vue'
import MessageBubbleComponent from '@/renderer/components/workspace/MessageBubbleComponent.vue'
import JsonTree from '@/renderer/components/JsonTree.vue'
import type { Message } from '@/renderer/api/types'

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

/** 对话模式：normalize 后的完整消息（MessageBubble 按 messageType 分发渲染——含工具/混合/审批/澄清卡） */
const chatMessages = ref<Message[]>([])

/** 对话模式显示的消息类型白名单（与主聊天区 MessageListComponent 一致） */
const CHAT_DISPLAY_TYPES = new Set([
  'user_normal',
  'assistant_text',
  'assistant_hybrid',
  'assistant_tool_call',
  'approval_request',
  'clarify_request'
])

/** 对话模式可见消息（按白名单过滤——tool_result 等内部消息不单独展示） */
const visibleChatMessages = computed(() =>
  chatMessages.value.filter(m =>
    CHAT_DISPLAY_TYPES.has(m.messageType as string)
    || (m.messageType == null && m.role === 'user')
  )
)

onMounted(() => {
  loadMessages()
})

async function loadMessages() {
  loading.value = true
  error.value = ''
  try {
    // 原文模式需要完整原始 toolCall（normalize 会把 map 拆成第一个工具，丢失后续组）
    const [rawList, chatList] = await Promise.all([
      chatStore.listByConversationRaw(conversationId),
      chatStore.listByConversation(conversationId),
    ])
    messages.value = rawList.map(m => ({
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
    chatMessages.value = chatList
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
  background: transparent;
}

/* ── Status ── */

.conv-detail-loading,
.conv-detail-error {
  text-align: center;
  padding: 48px 20px;
  color: var(--tk-text-tertiary);
  font-size: 14px;
}
.conv-detail-error {
  color: var(--tk-destructive);
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
  /* emil：sticky 表头用半透明毛玻璃——滚动时内容穿透模糊，而非生硬色块 */
  background: var(--tk-bg-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.conv-detail-table th {
  text-align: left;
  padding: 20px 12px 8px;
  border-bottom: 1px solid var(--tk-border-card);
  color: var(--tk-text-tertiary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
  user-select: none;
}

/* Column widths — Content 与 Tool 按比例分配，避免 Content 独占全宽 */
.conv-detail-table th:nth-child(1) { width: 36px; }
.conv-detail-table th:nth-child(2) { width: 88px; }
.conv-detail-table th:nth-child(4) { width: 34%; }
/* col 3 (Content) takes the rest */

.conv-detail-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--tk-border);
  color: var(--tk-text-primary);
  vertical-align: top;
  line-height: 1.5;
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* 行 hover（数据表可读性——emil） */
.conv-detail-table tbody tr:hover {
  background: var(--tk-bg-selected);
}
.conv-detail-table tbody tr:hover .role-badge {
  /* 保持徽章对比（hover 背景变浅蓝时徽章不变） */
}

/* ── Row number ── */

.cell-idx {
  text-align: center;
  color: var(--tk-text-tertiary);
  font-size: 11px;
  font-weight: 500;
  padding-top: 12px !important;
}

/* ── Role badge（语义色——tool 用深橙保证白字对比度） ── */

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.4;
}
.role-badge--user      { background: var(--tk-accent); color: #fff; }
.role-badge--assistant { background: var(--tk-success); color: #fff; }
.role-badge--tool      { background: var(--tk-warning); color: #fff; }
.role-badge--system    { background: var(--tk-text-tertiary); color: #fff; }
.role-badge--approval  { background: var(--tk-accent-active); color: #fff; }

/* ── Tool ── */

.cell-tool {
  font-size: 12px;
  color: var(--tk-text-secondary);
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
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--tk-bg-secondary);
}

.reasoning-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--tk-warning);
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.reasoning-header:hover {
  background: color-mix(in srgb, var(--tk-warning) 8%, transparent);
}

.reasoning-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--tk-warning);
}
.reasoning-label { font-weight: 500; }

.reasoning-arrow {
  margin-left: auto;
  display: flex;
  color: var(--tk-warning);
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
.reasoning-arrow--open {
  transform: rotate(180deg);
}

.reasoning-body {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--tk-border);
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--tk-text-secondary);
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
  color: var(--tk-text-secondary);
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.detail-block__header:hover {
  background: var(--tk-bg-secondary);
}

.detail-block__label {
  font-weight: 500;
  color: var(--tk-text-primary);
}

.detail-block__toggle {
  margin-left: auto;
  font-size: 10px;
  color: var(--tk-text-tertiary);
}

/* 展开/收起 chevron（旋转动画） */
.detail-block__chevron {
  display: flex;
  flex-shrink: 0;
  color: var(--tk-text-tertiary);
  transition: transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
.detail-block__chevron--open {
  transform: rotate(180deg);
}

.detail-block__body {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--tk-text-primary);
  background: var(--tk-bg-secondary);
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
  color: var(--tk-text-secondary);
  background: var(--tk-bg-secondary);
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
    background: var(--tk-bg-primary);
    border: 1px solid var(--tk-border);
    border-radius: 10px;
    padding: 10px 0 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  /* Row number badge — top-right corner（flex 居中） */
  .conv-detail-table td:first-child {
    position: absolute;
    top: -1px;
    right: -1px;
    /* !important 对抗 .cell-idx 的 padding-top: 12px !important（桌面模式遗留——不覆盖会贴底） */
    padding: 0 10px !important;
    font-size: 10px;
    font-weight: 600;
    line-height: 14px;
    border: none;
    border-radius: 0 10px 0 8px;
    background: var(--tk-accent);
    color: #ffffff;
    width: auto;
    min-height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
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
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Column name labels */
  .conv-detail-table td:nth-child(2)::before { content: 'Role'; }
  .conv-detail-table td:nth-child(4)::before { content: 'Tool'; }

  .conv-detail-table td::before {
    font-weight: 500;
    font-size: 10px;
    color: var(--tk-text-tertiary);
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
    color: var(--tk-text-tertiary);
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
  background: var(--tk-bg-secondary);
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
  color: var(--tk-text-secondary);
  transition: background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1);
  white-space: nowrap;
}

.view-mode-switch__item:hover {
  color: var(--tk-text-primary);
}

.view-mode-switch__item--active {
  background: var(--tk-bg-primary);
  color: var(--tk-accent);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* ── 对话模式：气泡（与主聊天区 MessageBubble 视觉一致） ── */

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
  color: var(--tk-text-tertiary);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.conv-detail-chat__empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: var(--tk-bg-secondary);
  color: var(--tk-text-tertiary);
}

.conv-detail-chat__empty p {
  margin: 0;
}

</style>
