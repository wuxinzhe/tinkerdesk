/**
 * tools/manifest.ts — 客户端工具清单（单一数据源）
 *
 * 所有工具的单例实例在此集中导出为一个数组。
 * ipc-handlers.ts 和 tool-detector.ts 都引用这里，
 * 避免两个文件各自维护一份列表。
 *
 * 每个工具封装为一个包（包内 index.ts 导出工具类 + 单例）。
 */
import type { BaseTool } from './index'

import { terminalTool } from './terminal'
import { processTool } from './process'
import { readTerminalTool } from './read-terminal'
import { closeTerminalTool } from './close-terminal'
import { readFileTool } from './read-file'
import { writeFileTool } from './write-file'
import { patchTool } from './patch'
import { searchFilesTool } from './search-files'
import { webSearchTool } from './web-search'
import { webExtractTool } from './web-extract'
import { scheduleTimerTool } from './schedule-timer'
import { fileMutationVerifierTool } from './file-mutation-verifier'

/** 所有 Electron 本地工具（按字母序） */
export const allDesktopTools: BaseTool[] = [
  closeTerminalTool,
  fileMutationVerifierTool,
  patchTool,
  processTool,
  readFileTool,
  readTerminalTool,
  scheduleTimerTool,
  searchFilesTool,
  terminalTool,
  webExtractTool,
  webSearchTool,
  writeFileTool,
]
