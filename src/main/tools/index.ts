/**
 * tools/index.ts — 工具实现包统一出口
 *
 * 只导出具体工具实现（内建 + 桌面）与工具基类。
 * 核心功能（注册/调用/管理）在 core/tool（ToolManager/ToolSchema/ToolResult/类型）。
 */
export { BaseTool } from './base-tool'
// service/tools 的具体工具（内建）
export { TOOL_NAME as CLARIFY_TOOL_NAME, ClarifyTool } from './clarify-tool'
export { TOOL_NAME as MEMORY_TOOL_NAME, MemoryTool } from './memory-tool'
export { TOOL_NAME as SESSION_SEARCH_TOOL_NAME, SessionSearchTool } from './session-search-tool'
export { TOOL_NAME as SKILL_MANAGE_TOOL_NAME, SkillManageTool } from './skill-manage-tool'
export { TOOL_NAME as SKILL_VIEW_TOOL_NAME, SkillViewTool } from './skill-view-tool'
export { TOOL_NAME as SKILLS_LIST_TOOL_NAME, SkillsListTool } from './skills-list-tool'
export { TOOL_NAME as TODO_TOOL_NAME, TodoTool } from './todo-tool'
// 桌面客户端工具（tools/desktop/）
export {
  TerminalTool, TERMINAL_TOOL_NAME,
  ProcessTool, PROCESS_TOOL_NAME,
  ReadTerminalTool, READ_TERMINAL_TOOL_NAME,
  CloseTerminalTool, CLOSE_TERMINAL_TOOL_NAME,
  ReadFileTool, READ_FILE_TOOL_NAME,
  WriteFileTool, WRITE_FILE_TOOL_NAME,
  PatchTool, PATCH_TOOL_NAME,
  SearchFilesTool, SEARCH_FILES_TOOL_NAME,
  WebSearchTool, WEB_SEARCH_TOOL_NAME,
  WebExtractTool, WEB_EXTRACT_TOOL_NAME,
  ScheduleTimerTool, SCHEDULE_TIMER_TOOL_NAME,
  FileMutationVerifierTool, FILE_MUTATION_VERIFIER_TOOL_NAME,
} from './desktop'
// 核心类型 re-export（定义在 core/tool/types）
export { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT, TOOL_TYPE_MCP } from '../core/tool/types'
export type { AgentToolMeta, AgentToolRegistration, IAgentTool, ToolFunction, ToolType } from '../core/tool/types'
