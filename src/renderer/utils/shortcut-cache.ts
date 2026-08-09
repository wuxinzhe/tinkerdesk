/**
 * shortcut-cache.ts — 录音快捷键全局缓存
 *
 * ⚠ 为什么放独立模块：Vue `<script setup>` 的顶层变量是「组件实例级」——
 * 每次重新挂载都会重新初始化，跨实例缓存必须放在模块作用域（import 一次共享）。
 *
 * 背景：L3 每次切换 session 都会重建 ChatInputComponent（:key=fullPath）——
 * 若不缓存，每次挂载都调 settings:general:get（读 shortcut.record）。
 * shortcut.record 是全局配置、变化频率极低——值得缓存。
 */

/** 模块级缓存（null = 未加载/已失效） */
let cachedRecordShortcut: string | null = null

export function getCachedRecordShortcut(): string | null {
  return cachedRecordShortcut
}

export function setCachedRecordShortcut(value: string): void {
  cachedRecordShortcut = value
}

/** 设置页保存/重置快捷键后调用——缓存失效，下次挂载重新读 */
export function invalidateRecordShortcut(): void {
  cachedRecordShortcut = null
}
