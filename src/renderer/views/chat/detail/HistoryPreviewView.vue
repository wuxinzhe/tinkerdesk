<script setup lang="ts">
/**
 * HistoryPreviewView.vue — 对话历史预览页（独立路由 /workspace/chat/:sessionId/history）
 * 入栈新页面，顶部导航栏标题为"历史预览"（WorkspaceView l3ToolbarTitle 识别 /history）。
 */
import { useRoute } from 'vue-router'
import ConversationPreviewView from '@/renderer/components/workspace/ConversationPreviewView.vue'

const route = useRoute()
const sessionId = String(route.params.sessionId ?? '')
</script>

<template>
  <ConversationPreviewView :session-id="sessionId" />
</template>
