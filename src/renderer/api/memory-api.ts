/**
 * memory-api.ts — 记忆管理 API（MemoryController IPC 封装）
 *
 * target: 'memory'（Agent 记忆）或 'user'（用户画像记忆）
 * 数据源：文件系统 userData/memory/{target}-{profile}.json（entries: string[]）
 */

/** 记忆目标类型 */
export type MemoryTarget = 'memory' | 'user'

export const memoryApi = {
  /** 读取记忆条目列表 */
  async list(target: MemoryTarget, profile: string): Promise<string[]> {
    const data = await window.api.memory.list(target, profile)
    return (data as string[]) ?? []
  },

  /** 添加记忆（去重——重复 code=0） */
  async add(target: MemoryTarget, content: string, profile: string): Promise<{ code: number }> {
    return (await window.api.memory.add(target, content, profile)) as { code: number }
  },

  /** 按索引更新记忆 */
  async update(target: MemoryTarget, index: number, content: string, profile: string): Promise<{ code: number }> {
    return (await window.api.memory.update(target, index, content, profile)) as { code: number }
  },

  /** 按索引删除记忆 */
  async remove(target: MemoryTarget, index: number, profile: string): Promise<{ code: number }> {
    return (await window.api.memory.remove(target, index, profile)) as { code: number }
  },

  /** 拖拽排序（order = 重排后的完整内容列表） */
  async reorder(target: MemoryTarget, order: string[], profile: string): Promise<{ code: number }> {
    return (await window.api.memory.reorder(target, order, profile)) as { code: number }
  },
}
