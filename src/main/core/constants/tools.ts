/**
 * constants/tools.ts — 工具相关常量
 *
 * 工具名（单一来源——工具类 TOOL_NAME 引用）+
 * 会改变 prompt 缓存内容的工具集合（CACHE_AFFECTING_TOOLS）。
 */
/** 工具名 */
export const TOOL_SKILL_MANAGE = 'builtin_tinker_skill_manage'
export const TOOL_SKILL_VIEW = 'builtin_tinker_skill_view'
export const TOOL_SKILLS_LIST = 'builtin_tinker_skills_list'
export const TOOL_MEMORY = 'builtin_tinker_memory'

/** 会改变 prompt 缓存内容的工具（skill_manage/memory → skills-index/memory-snapshot/user-profile） */
export const CACHE_AFFECTING_TOOLS: ReadonlySet<string> = new Set([
  TOOL_SKILL_MANAGE,
  TOOL_MEMORY,
])
