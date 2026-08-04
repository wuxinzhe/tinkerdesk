/**
 * skill-detail-store.ts — 技能详情页数据共享
 *
 * 用于在技能列表页面和详情页之间传递技能数据。
 * 纯模块级 ref，不依赖 Pinia，避免循环引用。
 */
import { ref } from 'vue'
import type { SkillInfo } from '@/defines/models/skill'

/** 当前查看的技能（由列表页 push 路由前设置，详情页 onMounted 时读取） */
export const viewingSkill = ref<SkillInfo | null>(null)
