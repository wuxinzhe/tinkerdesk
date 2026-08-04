/**
 * prompt-manager.ts — 提示词模块管理器
 *
 * 复刻 showing-agent PromptManager：
 * 启动时扫描所有 IDynamicPromptModule，将模块标识 → 模块条目的映射加载到内存。
 * 渲染顺序由外部（AgentMode 的 moduleList）定义，本管理器仅负责注册和按序查找。
 */
import type {IDynamicPromptModule, PromptModuleEntry} from './types'

/** 提示词模块管理器 */
export class PromptManager {
  /** 模块标识 → 模块条目的有序映射（保持注册顺序） */
  private readonly entries = new Map<string, PromptModuleEntry>()

  /**
   * 构造：注册所有动态模块。
   * 检查模块标识唯一性，重复抛错。
   */
  constructor(allModules: IDynamicPromptModule[]) {
    const seen = new Set<string>()
    for (const mod of allModules) {
      const id = mod.id
      if (!id) {
        throw new Error(`PromptModule 实现缺少 id: ${mod.constructor?.name ?? 'unknown'}`)
      }
      if (seen.has(id)) {
        throw new Error(`重复的 PromptModule id: '${id}'`)
      }
      seen.add(id)
      this.entries.set(id, {id, module: mod})
    }
  }

  /** 按指定顺序返回模块条目列表（未注册的标识静默跳过） */
  getModulesByOrder(orderedIds: string[]): PromptModuleEntry[] {
    const result: PromptModuleEntry[] = []
    for (const id of orderedIds) {
      const entry = this.entries.get(id)
      if (entry) {
        result.push(entry)
      }
    }
    return result
  }

  /** 根据模块标识获取模块条目（未注册返回 null） */
  getEntry(id: string): PromptModuleEntry | null {
    return this.entries.get(id) ?? null
  }

  /** 获取所有已注册的模块标识 */
  getModuleIds(): string[] {
    return [...this.entries.keys()]
  }

  /** 已注册模块总数 */
  size(): number {
    return this.entries.size
  }
}
