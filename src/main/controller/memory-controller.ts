/**
 * memory-controller.ts — 记忆管理 IPC
 *
 * Memory content CRUD + drag reorder (memory:list / add / update / remove / reorder).
 * Data source: MemoryStore (file-system userData/memory/{target}-{profile}.json — entries: string[]).
 * target: 'memory' (agent memory) or 'user' (user-profile memory).
 */

import { handleTrusted } from '../security/ipc-guard'
import { MemoryStore } from '../service/memory-store'
import { ok, fail, type ApiResponse } from './api-response'

interface MemoryOpPayload {
  target?: string
  profile?: string
  content?: string
  index?: number
  order?: string[]
}

/** 记忆管理控制器 */
export class MemoryController {
  constructor(private readonly memoryStore: MemoryStore) {}

  register(): void {
    handleTrusted('memory:list', (_event, payload: MemoryOpPayload) => this.listMemory(payload))
    handleTrusted('memory:add', (_event, payload: MemoryOpPayload) => this.addMemory(payload))
    handleTrusted('memory:update', (_event, payload: MemoryOpPayload) => this.updateMemory(payload))
    handleTrusted('memory:remove', (_event, payload: MemoryOpPayload) => this.removeMemory(payload))
    handleTrusted('memory:reorder', (_event, payload: MemoryOpPayload) => this.reorderMemory(payload))
  }

  /** 读取记忆条目列表 */
  private listMemory(payload: MemoryOpPayload): ApiResponse<string[]> {
    const target = this.resolveTarget(payload)
    if (!target) return fail('target 必填（memory 或 user）')
    const profile = payload?.profile ?? 'default'
    return ok(this.memoryStore.readAll(target, profile))
  }

  /** 添加记忆（去重由 MemoryStore 处理——重复返回 0） */
  private addMemory(payload: MemoryOpPayload): ApiResponse<{ code: number }> {
    const target = this.resolveTarget(payload)
    if (!target) return fail('target 必填（memory 或 user）')
    const profile = payload?.profile ?? 'default'
    const content = (payload?.content ?? '').trim()
    if (!content) return fail('记忆内容为空')
    const code = this.memoryStore.addEntry(target, profile, content, this.charLimit(target), 200)
    if (code < 0) return fail(code === -1 ? '记忆超限（容量或条数）' : '重复记忆（已存在）')
    return ok({ code })
  }

  /** 按索引更新记忆 */
  private updateMemory(payload: MemoryOpPayload): ApiResponse<{ code: number }> {
    const target = this.resolveTarget(payload)
    if (!target) return fail('target 必填（memory 或 user）')
    const profile = payload?.profile ?? 'default'
    const index = payload?.index
    const content = (payload?.content ?? '').trim()
    if (typeof index !== 'number' || index < 0) return fail('index 必填')
    if (!content) return fail('记忆内容为空')
    const code = this.memoryStore.updateByIndex(target, profile, index, content, this.charLimit(target))
    if (code < 0) return fail(code === -1 ? '索引越界' : '记忆超限')
    return ok({ code })
  }

  /** 按索引删除记忆 */
  private removeMemory(payload: MemoryOpPayload): ApiResponse<{ code: number }> {
    const target = this.resolveTarget(payload)
    if (!target) return fail('target 必填（memory 或 user）')
    const profile = payload?.profile ?? 'default'
    const index = payload?.index
    if (typeof index !== 'number' || index < 0) return fail('index 必填')
    const code = this.memoryStore.removeByIndex(target, profile, index)
    if (code < 0) return fail('索引越界')
    return ok({ code })
  }

  /** 拖拽排序（order = 重排后的完整内容列表） */
  private reorderMemory(payload: MemoryOpPayload): ApiResponse<{ code: number }> {
    const target = this.resolveTarget(payload)
    if (!target) return fail('target 必填（memory 或 user）')
    const profile = payload?.profile ?? 'default'
    const order = payload?.order
    if (!Array.isArray(order) || order.length === 0) return fail('order 必填（重排后的完整列表）')
    const code = this.memoryStore.reorder(target, profile, order)
    if (code < 0) return fail('order 长度与现有记忆数不一致')
    return ok({ code })
  }

  /** 容量限制（与 AgentConfig 默认一致——同款：memory 2200 / user 1375 字符） */
  private charLimit(target: string): number {
    return target === MemoryStore.TARGET_MEMORY ? 2200 : 1375
  }

  private resolveTarget(payload: MemoryOpPayload | undefined): string | null {
    const t = payload?.target
    if (t === MemoryStore.TARGET_MEMORY || t === MemoryStore.TARGET_USER) return t
    return null
  }
}
