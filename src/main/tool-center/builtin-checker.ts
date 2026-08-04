/**
 * tool-center/builtin-checker.ts — 内置工具可用性检测
 *
 * 遍历 manifest 中所有 BaseTool，执行 checkAvailability()。
 * 同类工具共享检查结果以减少启动开销。
 */
import { allDesktopTools } from '../../tools/desktop/manifest'
import type { CheckedTool } from '@/defines/tools/center-types'

// ── 检查结果缓存（同类工具复用）──

const sharedCache = new Map<string, { available: boolean; reason?: string }>()

/** 重置缓存（重新检测时调用） */
export function resetBuiltinCache(): void {
  sharedCache.clear()
}

/**
 * 检测所有内置工具的可用性。
 * 同类工具（如 file 类）共享同一检查结果。
 */
export async function checkAllBuiltinTools(): Promise<CheckedTool[]> {
  resetBuiltinCache()
  const results: CheckedTool[] = []

  for (const tool of allDesktopTools) {
    const result = await checkToolWithSharing(tool)
    results.push(result)
  }

  return results
}

/**
 * 检测单个工具，同类工具的 checkAvailability 结果共享。
 * 共享 key 由工具 category + 首次调用结果决定。
 */
async function checkToolWithSharing(tool: typeof allDesktopTools[number]): Promise<CheckedTool> {
  // 同类共享 key：file 类工具共用文件系统检查
  const shareKey = getShareKey(tool)

  let avail: { available: boolean; reason?: string }

  if (shareKey && sharedCache.has(shareKey)) {
    avail = sharedCache.get(shareKey)!
  } else {
    avail = await tool.checkAvailability()
    if (shareKey) {
      sharedCache.set(shareKey, avail)
    }
  }

  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    source: 'builtin' as const,
    available: avail.available,
    reason: avail.reason,
    schema: tool.getSchema()
  }
}

function getShareKey(tool: typeof allDesktopTools[number]): string | null {
  // file 类工具共享文件系统检查结果
  if (['read_file', 'write_file', 'patch'].includes(tool.id)) {
    return 'file'
  }
  // terminal 类工具共享 bash 检查结果
  if (['terminal', 'process', 'read_terminal', 'close_terminal'].includes(tool.id)) {
    return 'terminal'
  }
  return null
}
