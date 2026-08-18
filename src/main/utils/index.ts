/**
 * utils/index.ts — 工具类统一出口
 */
export { unifiedDiff } from './diff'
export { addLineNumbers, hasBinaryExtension, isBlockedDevicePath, truncateToCharBudget } from './file-read'
export { errMessage, fetchUrl } from './http'
export { coerceInt, normalizeReadPagination, normalizeSearchPagination } from './number'
export { checkSensitivePath, isWindowsDriveRoot, rejectV4aTraversal } from './path-security'
export { redactSensitiveText } from './redact'
export { getResourcesDir, resolveResource } from './resources-path'
export { checkSearchEngine, parseMatchLine, parseSearchContextLine, pathNotFoundHint } from './search-parse'
export { getShellExec } from './shell-utils'
export { nowDb, nowIso, nowTs, todayDate } from './time'
export type { SearchMatch, ShellExec } from './types'

