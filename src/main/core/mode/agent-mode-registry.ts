/**
 * core/mode/agent-mode-registry.ts — Agent Mode 注册表
 *
 * 复刻 tinker-agent AgentModeRegistry（注解扫描缓存 → TS 手动注册）：
 * - executorCache：id → IAgentMode 实例
 * - metaCache：id → version → AgentModeMeta
 * - 查询：findById / findAllActive / listOptions / exists / count
 * 启动时由 bootstrap 注册所有模式实现（替代 Java 注解扫描）。
 */
import type { AgentModeMeta, IAgentMode, ModeInfoDTO, ModeOptionDTO } from './agent-mode'

/** Agent Mode 注册表 */
export class AgentModeRegistry {
  /** id → 实例 */
  private readonly executorCache = new Map<string, IAgentMode>()
  /** id → version → 元数据 */
  private readonly metaCache = new Map<string, Map<string, ModeInfoDTO>>()

  /** 注册一个模式实现（bootstrap 组装时调用） */
  register(executor: IAgentMode): void {
    const { id, version } = executor.meta
    this.executorCache.set(id, executor)
    let versions = this.metaCache.get(id)
    if (!versions) {
      versions = new Map<string, ModeInfoDTO>()
      this.metaCache.set(id, versions)
    }
    versions.set(version, toModeInfo(executor.meta))
  }

  /** 按 id 获取执行器实例 */
  getAgentMode(id: string): IAgentMode | null {
    return this.executorCache.get(id) ?? null
  }

  /** 按 id + version 查找元数据 */
  findById(id: string, version: string): ModeInfoDTO | null {
    return this.metaCache.get(id)?.get(version) ?? null
  }

  /** 全部已注册元数据（平铺，同 id 多版本独立） */
  findAllActive(): ModeInfoDTO[] {
    const all: ModeInfoDTO[] = []
    for (const versions of this.metaCache.values()) {
      all.push(...versions.values())
    }
    return all
  }

  /** 模式选项列表（id → [versions...]，前端下拉用） */
  listOptions(): ModeOptionDTO[] {
    const options: ModeOptionDTO[] = []
    for (const [id, versions] of this.metaCache.entries()) {
      options.push({ id, versions: [...versions.keys()] })
    }
    return options
  }

  /** 检查 id 是否存在（任意版本） */
  exists(id: string): boolean {
    return this.metaCache.has(id)
  }

  /** 检查 id + version 是否存在 */
  existsVersion(id: string, version: string): boolean {
    return this.metaCache.get(id)?.has(version) ?? false
  }

  /** 元数据总条目数（同 id 多版本分别计数） */
  count(): number {
    let n = 0
    for (const versions of this.metaCache.values()) {
      n += versions.size
    }
    return n
  }
}

/** AgentModeMeta → ModeInfoDTO */
function toModeInfo(meta: AgentModeMeta): ModeInfoDTO {
  return {
    id: meta.id,
    version: meta.version,
    name: meta.name,
    description: meta.description,
    promptTemplate: meta.promptTemplate,
  }
}
