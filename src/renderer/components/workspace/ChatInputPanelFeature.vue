<template>
  <!-- 功能面板图标（点击 emit toggle——展开状态由父级单一 activePanelKey 管理——
       互斥是结构保证：同一时刻只有一个 key 能等于 activePanelKey） -->
  <button
    class="chat-input__panel-icon"
    :class="{ 'chat-input__panel-icon--active': active }"
    :title="title"
    @click="$emit('toggle', id)"
  >
    <slot name="icon" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
/**
 * ChatInputPanelFeature — 功能面板的可展开功能图标
 *
 * 职责：渲染一个功能图标按钮 + 上报 toggle（id）。
 * 展开状态的互斥由父组件保证（单一 activePanelKey——见 ChatInputComponent）：
 * 本组件不持有任何展开状态——只做展示与事件上报。
 */
withDefaults(
  defineProps<{
    /** 功能唯一标识（父级 activePanelKey 匹配用） */
    id: string
    /** 图标下方文字 */
    label: string
    /** 悬停提示 */
    title: string
    /** 是否当前展开（父级 activePanelKey === id） */
    active: boolean
  }>(),
  {
    active: false,
  },
)

defineEmits<{
  toggle: [id: string]
}>()
</script>
