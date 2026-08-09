/**
 * tools/desktop/index.ts — 桌面工具统一导出
 *
 * 与内建工具（tools/ 根目录）隔离的客户端工具集，
 * 复刻自 tinker-agent-ui/src/tools/desktop。
 * 全部实现 IAgentTool（extends BaseTool，schema 从 tool-schemas/*.hbs 加载）。
 */
export { TerminalTool, TOOL_NAME as TERMINAL_TOOL_NAME } from './terminal-tool'
export { ProcessTool, TOOL_NAME as PROCESS_TOOL_NAME } from './process-tool'
export { ReadTerminalTool, TOOL_NAME as READ_TERMINAL_TOOL_NAME } from './read-terminal-tool'
export { CloseTerminalTool, TOOL_NAME as CLOSE_TERMINAL_TOOL_NAME } from './close-terminal-tool'
export { ReadFileTool, TOOL_NAME as READ_FILE_TOOL_NAME } from './read-file-tool'
export { WriteFileTool, TOOL_NAME as WRITE_FILE_TOOL_NAME } from './write-file-tool'
export { PatchTool, TOOL_NAME as PATCH_TOOL_NAME } from './patch-tool'
export { SearchFilesTool, TOOL_NAME as SEARCH_FILES_TOOL_NAME } from './search-files-tool'
export { WebSearchTool, TOOL_NAME as WEB_SEARCH_TOOL_NAME } from './web-search-tool'
export { WebExtractTool, TOOL_NAME as WEB_EXTRACT_TOOL_NAME } from './web-extract-tool'
export { TextToSpeechTool, TOOL_NAME as TEXT_TO_SPEECH_TOOL_NAME } from './text-to-speech-tool'
export { SpeechToTextTool, TOOL_NAME as SPEECH_TO_TEXT_TOOL_NAME } from './speech-to-text-tool'
export { ScheduleTimerTool, TOOL_NAME as SCHEDULE_TIMER_TOOL_NAME } from './schedule-timer-tool'
export { FileMutationVerifierTool, TOOL_NAME as FILE_MUTATION_VERIFIER_TOOL_NAME } from './file-mutation-verifier-tool'
