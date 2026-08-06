/**
 * utils/index.ts — 工具类统一出口
 */
export {nowDb, nowIso, nowTs, todayDate} from './time'
export {getResourcesDir, resolveResource} from './resources-path'
export {checkSensitivePath, isWindowsDriveRoot, rejectV4aTraversal} from './path-security'
export {coerceInt, normalizeReadPagination, normalizeSearchPagination} from './number'
export {isBlockedDevicePath, hasBinaryExtension, truncateToCharBudget, addLineNumbers} from './file-read'
export {checkSearchEngine, parseMatchLine, parseSearchContextLine, pathNotFoundHint} from './search-parse'
export type {SearchMatch, ShellExec} from './types'
export {unifiedDiff} from './diff'
export {fetchUrl, errMessage} from './http'
export {redactSensitiveText} from './redact'
export {getShellExec} from './shell-utils'
