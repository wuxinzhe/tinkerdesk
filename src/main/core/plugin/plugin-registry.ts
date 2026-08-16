/**
 * plugin-registry.ts — 插件 Provider 注册表（系统接口 → provider 插件）
 *
 * 职责：接口 provider 注册/注销/查询（voice.stt → [sherpa] 等）——
 * 与 PluginManager 解耦（manager 组合本类——不直接持有 interfaceProviders 字段）。
 */
import type { PluginRecord } from './types'
import { SYSTEM_INTERFACES } from './system-interfaces'

/** Provider 注册表（每 manager 一个实例） */
export class ProviderRegistry {
  /** 系统开放接口的 provider 注册表：interfaceId → 已注册（started）插件 id 列表 */
  private readonly interfaceProviders = new Map<string, string[]>()

  /** 注册插件为所有声明接口的 provider（started 时调用） */
  register(record: PluginRecord): void {
    for (const def of SYSTEM_INTERFACES) {
      if (record.manifest.systemInterfaces?.some((s) => s.id === def.id)) {
        const list = this.interfaceProviders.get(def.id) ?? []
        if (!list.includes(record.manifest.id)) {
          list.push(record.manifest.id)
          this.interfaceProviders.set(def.id, list)
        }
      }
    }
  }

  /** 注销插件（stop/卸载时调用） */
  unregister(record: PluginRecord): void {
    for (const def of SYSTEM_INTERFACES) {
      const list = this.interfaceProviders.get(def.id)
      if (list) {
        const next = list.filter((id) => id !== record.manifest.id)
        if (next.length > 0) this.interfaceProviders.set(def.id, next)
        else this.interfaceProviders.delete(def.id)
      }
    }
  }

  /** 查接口的 provider 插件列表（started 且已注册） */
  getProviders(interfaceId: string): PluginRecord[] {
    // 由 manager 传入 pluginById 查询函数（避免反向依赖 registry）
    return this.byId ? this.byId(this.interfaceProviders.get(interfaceId) ?? []) : []
  }

  /** 注入 id → record 查询（manager 提供——解耦） */
  setByIdResolver(fn: (ids: string[]) => PluginRecord[]): void {
    this.byId = fn
  }

  private byId: ((ids: string[]) => PluginRecord[]) | null = null
}
