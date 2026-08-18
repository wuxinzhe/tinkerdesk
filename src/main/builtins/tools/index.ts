/**
 * tools/index.ts — 工具实现包统一出口
 *
 * 只导出具体工具实现（全部内置——不再区分 desktop/builtin——目录已平铺到 tools/ 根）。
 * 核心功能（注册/调用/管理）在 core/tool（ToolManager/ToolSchema/ToolResult/类型）。
 */
export { BaseTool } from './base-tool'
// 内建（业务工具）
export { TOOL_NAME as CLARIFY_TOOL_NAME, ClarifyTool } from './clarify-tool'
export { TOOL_NAME as MEMORY_TOOL_NAME, MemoryTool } from './memory-tool'
export { TOOL_NAME as SESSION_SEARCH_TOOL_NAME, SessionSearchTool } from './session-search-tool'
export { TOOL_NAME as SKILL_MANAGE_TOOL_NAME, SkillManageTool } from './skill-manage-tool'
export { TOOL_NAME as SKILL_VIEW_TOOL_NAME, SkillViewTool } from './skill-view-tool'
export { TOOL_NAME as SKILLS_LIST_TOOL_NAME, SkillsListTool } from './skills-list-tool'
export { TOOL_NAME as TODO_TOOL_NAME, TodoTool } from './todo-tool'
// 桌面/文件/终端工具（平铺 tools/ 根——统一内置）
export { TOOL_NAME as TERMINAL_TOOL_NAME, TerminalTool } from './terminal-tool'
export { TOOL_NAME as PWSH_TOOL_NAME, PwshTool } from './pwsh-tool'
export { TOOL_NAME as PROCESS_TOOL_NAME, ProcessTool } from './process-tool'
export { TOOL_NAME as READ_TERMINAL_TOOL_NAME, ReadTerminalTool } from './read-terminal-tool'
export { TOOL_NAME as CLOSE_TERMINAL_TOOL_NAME, CloseTerminalTool } from './close-terminal-tool'
export { TOOL_NAME as READ_FILE_TOOL_NAME, ReadFileTool } from './read-file-tool'
export { TOOL_NAME as WRITE_FILE_TOOL_NAME, WriteFileTool } from './write-file-tool'
export { TOOL_NAME as PATCH_TOOL_NAME, PatchTool } from './patch-tool'
export { TOOL_NAME as SEARCH_FILES_TOOL_NAME, SearchFilesTool } from './search-files-tool'
export { TOOL_NAME as WEB_SEARCH_TOOL_NAME, WebSearchTool } from './web-search-tool'
export { TOOL_NAME as WEB_EXTRACT_TOOL_NAME, WebExtractTool } from './web-extract-tool'
export { TOOL_NAME as TEXT_TO_SPEECH_TOOL_NAME, TextToSpeechTool } from './text-to-speech-tool'
export { TOOL_NAME as SPEECH_TO_TEXT_TOOL_NAME, SpeechToTextTool } from './speech-to-text-tool'
export { TOOL_NAME as SCHEDULE_TIMER_TOOL_NAME, ScheduleTimerTool } from './schedule-timer-tool'
export { TOOL_NAME as FILE_MUTATION_VERIFIER_TOOL_NAME, FileMutationVerifierTool } from './file-mutation-verifier-tool'
export { TOOL_NAME as VISION_RECOGNIZE_TOOL_NAME, VisionRecognizeTool } from './vision-tool'
// 核心类型 re-export（定义在 core/tool/types）
export { TOOL_TYPE_BUILTIN, TOOL_TYPE_CLIENT } from '../../core/tool/types'
export type { AgentToolMeta, AgentToolRegistration, IAgentTool, ToolFunction, ToolType } from '../../core/tool/types'
