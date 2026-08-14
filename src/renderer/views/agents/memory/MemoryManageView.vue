<template>
  <L3PageLayout class="memory-manage">
    <!-- 页头 -->
    <SaPageHero
      icon="<svg width=&quot;26&quot; height=&quot;26&quot; viewBox=&quot;0 0 24 24&quot; fill=&quot;none&quot; stroke=&quot;currentColor&quot; stroke-width=&quot;1.8&quot; stroke-linecap=&quot;round&quot; stroke-linejoin=&quot;round&quot;><rect x=&quot;5&quot; y=&quot;5&quot; width=&quot;14&quot; height=&quot;14&quot; rx=&quot;2&quot;/><line x1=&quot;9&quot; y1=&quot;5&quot; x2=&quot;9&quot; y2=&quot;2&quot;/><line x1=&quot;15&quot; y1=&quot;5&quot; x2=&quot;15&quot; y2=&quot;2&quot;/><line x1=&quot;9&quot; y1=&quot;19&quot; x2=&quot;9&quot; y2=&quot;22&quot;/><line x1=&quot;15&quot; y1=&quot;19&quot; x2=&quot;15&quot; y2=&quot;22&quot;/><line x1=&quot;9&quot; y1=&quot;9&quot; x2=&quot;15&quot; y2=&quot;9&quot;/><line x1=&quot;9&quot; y1=&quot;13&quot; x2=&quot;15&quot; y2=&quot;13&quot;/></svg>"
      gradient="linear-gradient(135deg, #5ac8fa 0%, var(--tk-accent) 100%)"
      title="记忆管理"
      desc="管理该 Agent 的长期记忆"
    />
    <!-- 顶部：目标切换（Memory / User）+ 计数 -->
    <div class="memory-manage__toolbar">
      <div class="memory-manage__tabs">
        <button class="memory-manage__tab" :class="{ 'memory-manage__tab--active': tab === 'memory' }" @click="switchTab('memory')">
          Memory
        </button>
        <button class="memory-manage__tab" :class="{ 'memory-manage__tab--active': tab === 'user' }" @click="switchTab('user')">
          User
        </button>
      </div>
      <span class="memory-manage__count">{{ entries.length }} 条 · {{ usedChars.toLocaleString() }} / {{ charLimit.toLocaleString() }} 字符</span>
    </div>

    <!-- 新增 -->
    <div class="memory-manage__add">
      <input
        v-model="newContent"
        class="memory-manage__add-input"
        placeholder="输入新记忆内容，回车添加"
        enterkeyhint="done"
        @keyup.enter="addEntry"
      />
      <button class="memory-manage__add-btn" @click="addEntry">
        添加
      </button>
    </div>

    <!-- 列表（拖拽排序） -->
    <div v-if="loading" class="memory-manage__loading">
      加载中…
    </div>
    <div v-else-if="entries.length === 0" class="memory-manage__empty">
      <p>暂无记忆</p>
      <p class="memory-manage__empty-hint">
        在上方输入内容添加第一条记忆
      </p>
    </div>
    <div v-else class="memory-manage__list">
      <div
        v-for="(entry, i) in entries"
        :key="`${tab}-${i}-${entry.slice(0, 12)}`"
        class="memory-item"
        :class="[{ 'memory-item--dragging': dragIndex === i }, { 'memory-item--editing': editing === i }]"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOver(i)"
        @dragend="dragIndex = -1"
        @drop="onDrop(i)"
      >
        <template v-if="editing === i">
          <textarea
            v-model="editContent"
            class="memory-item__edit-textarea"
            rows="2"
            spellcheck="false"
            @keyup.ctrl.enter="saveEdit"
            @keyup.esc="editing = null"
          />
          <div class="memory-item__actions">
            <button class="memory-item__btn memory-item__btn--save" title="保存（Ctrl+Enter）" @click="saveEdit">
              保存
            </button>
            <button class="memory-item__btn" title="取消（Esc）" @click="editing = null">
              取消
            </button>
          </div>
        </template>
        <template v-else>
          <span class="memory-item__handle" title="拖拽排序">⠿</span>
          <span class="memory-item__content" :title="entry">{{ entry }}</span>
          <div class="memory-item__actions">
            <button class="memory-item__btn" title="编辑" @click="startEdit(i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
              </svg>
            </button>
            <button class="memory-item__btn memory-item__btn--danger" title="删除" @click="removeEntry(i)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </div>
  </L3PageLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import L3PageLayout from '@/renderer/components/workspace/L3PageLayout.vue'
import SaPageHero from '@/renderer/components/SaPageHero.vue'
import { memoryApi, type MemoryTarget } from '@/renderer/api/memory-api'

const route = useRoute()
// L3 页面复用：从 A agent 的记忆页点 B agent 的记忆按钮——路由参数变化——computed 跟随
const profile = computed(() => route.params.profile as string)

// 初始目标（chip 跳转带 query target）
const tab = ref<MemoryTarget>((route.query.target as MemoryTarget) === 'user' ? 'user' : 'memory')
const entries = ref<string[]>([])
const loading = ref(false)
const newContent = ref('')
const adding = ref(false)
const editing = ref<number | null>(null)
const editContent = ref('')
const dragIndex = ref(-1)

// 容量上限（与 main memory-controller charLimit 一致——同款）：Memory 2200 / User 1375 字符
const CHAR_LIMIT: Record<MemoryTarget, number> = { memory: 2200, user: 1375 }
const charLimit = computed(() => CHAR_LIMIT[tab.value])
const usedChars = computed(() => entries.value.reduce((sum, e) => sum + e.length, 0))

async function loadEntries() {
  loading.value = true
  try {
    entries.value = await memoryApi.list(tab.value, profile.value)
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(t: MemoryTarget) {
  if (tab.value === t) return
  tab.value = t
  editing.value = null
  void loadEntries()
}

async function addEntry() {
  const content = newContent.value.trim()
  if (!content) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'memory:add:empty', message: '请输入记忆内容' } }))
    return
  }
  if (adding.value) return
  // 容量校验（与 main addEntry 同公式：总量 + 新内容 ≤ 上限）
  if (usedChars.value + content.length > charLimit.value) {
    window.dispatchEvent(new CustomEvent('global-tip', {
      detail: { type: 'error', code: 'memory:add:over_limit', message: `超出容量上限（当前 ${usedChars.value.toLocaleString()} / ${charLimit.value.toLocaleString()} 字符）` },
    }))
    return
  }
  adding.value = true
  try {
    const res = await memoryApi.add(tab.value, content, profile.value)
    if (res.code === 0) {
      window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'tip', code: 'memory:add:duplicate', message: '该记忆已存在（未重复添加）' } }))
    }
    newContent.value = ''
    await loadEntries()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'memory:add:error', message: `添加失败: ${(e as Error).message}` } }))
  } finally {
    adding.value = false
  }
}

function startEdit(i: number) {
  editing.value = i
  editContent.value = entries.value[i] ?? ''
}

async function saveEdit() {
  const content = editContent.value.trim()
  if (editing.value === null || !content) return
  try {
    await memoryApi.update(tab.value, editing.value, content, profile.value)
    editing.value = null
    await loadEntries()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'memory:update:error', message: `更新失败: ${(e as Error).message}` } }))
  }
}

async function removeEntry(i: number) {
  try {
    await memoryApi.remove(tab.value, i, profile.value)
    await loadEntries()
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'memory:remove:error', message: `删除失败: ${(e as Error).message}` } }))
  }
}

// ── 拖拽排序（HTML5 drag——drop 后整表重排 + 持久化） ──
function onDragStart(i: number) {
  dragIndex.value = i
}

function onDragOver(_i: number) {
  // 只阻止默认（允许 drop）——高亮在 dragstart/drop 间用 dragIndex 切换
}

async function onDrop(i: number) {
  const from = dragIndex.value
  dragIndex.value = -1
  if (from < 0 || from === i) return
  const list = [...entries.value]
  const [moved] = list.splice(from, 1)
  list.splice(i, 0, moved)
  entries.value = list
  try {
    await memoryApi.reorder(tab.value, list, profile.value)
  } catch (e) {
    window.dispatchEvent(new CustomEvent('global-tip', { detail: { type: 'error', code: 'memory:reorder:error', message: `排序保存失败: ${(e as Error).message}` } }))
    await loadEntries()
  }
}

onMounted(() => {
  void loadEntries()
})

// L3 页面复用：从 A agent 的记忆页点 B agent 的记忆按钮——路由参数变化——重置并重新加载
watch(() => route.params.profile, () => {
  tab.value = (route.query.target as MemoryTarget) === 'user' ? 'user' : 'memory'
  editing.value = null
  void loadEntries()
})
</script>

<style scoped>
.memory-manage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.memory-manage__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.memory-manage__tabs {
  display: flex;
  gap: 6px;
  background: var(--tk-bg-secondary);
  border-radius: 8px;
  padding: 3px;
}

.memory-manage__tab {
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--tk-text-secondary);
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.memory-manage__tab--active {
  background: var(--tk-bg-elevated);
  color: var(--tk-text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.memory-manage__count {
  font-size: 11px;
  color: var(--tk-text-tertiary);
}

.memory-manage__add {
  display: flex;
  gap: 8px;
}

.memory-manage__add-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  background: var(--tk-bg-elevated);
  font-size: 12px;
  color: var(--tk-text-primary);
  outline: none;
}

.memory-manage__add-input:focus {
  border-color: var(--tk-accent);
}

.memory-manage__add-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--tk-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.memory-manage__loading,
.memory-manage__empty {
  text-align: center;
  padding: 40px 0;
  font-size: 13px;
  color: var(--tk-text-tertiary);
}

.memory-manage__empty-hint {
  font-size: 11px;
  margin-top: 6px;
}

.memory-manage__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* add 与 list 间距 16px（root gap 12 + margin 4）——用户指定 */
  margin-top: 4px;
}

.memory-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  background: var(--tk-bg-elevated);
  cursor: grab;
  transition: box-shadow 0.15s, opacity 0.15s;
}

.memory-item--dragging {
  opacity: 0.5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.memory-item--editing {
  border-color: var(--tk-accent);
}

/* 行内编辑 textarea */
.memory-item__edit-textarea {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--tk-border);
  border-radius: 6px;
  font-size: 12px;
  font-family: inherit;
  color: var(--tk-text-primary);
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.memory-item__edit-textarea:focus {
  border-color: var(--tk-accent);
}

.memory-item__btn--save {
  color: var(--tk-accent);
  font-weight: 600;
  width: auto;
  padding: 0 8px;
  font-size: 11px;
}

.memory-item__btn--save:hover {
  background: rgba(0, 122, 255, 0.1);
  color: var(--tk-accent);
}

.memory-item__handle {
  color: var(--tk-text-tertiary);
  font-size: 14px;
  flex-shrink: 0;
  user-select: none;
}

.memory-item__content {
  flex: 1;
  font-size: 12px;
  color: var(--tk-text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  word-break: break-all;
}

.memory-item__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.memory-item__btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--tk-text-tertiary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.memory-item__btn:hover {
  background: var(--tk-bg-secondary);
  color: var(--tk-text-primary);
}

.memory-item__btn--danger:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--tk-destructive);
}
</style>
