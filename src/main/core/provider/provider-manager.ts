/**
 * provider-manager.ts — 扩展管理器（上层业务——per-system-interface 配置）
 *
 * 职责边界（按用户拍板）：
 *   center = 安装/卸载/全量加载/注册表/可用性（ProviderCenter——implements ICenter）
 *   manager = 上层业务：per-system-interface 配置（getConfig/saveConfig/getSchema）
 *   Manager 查 center 缓存拿底层数据（getProvider）——不自己维护注册表
 *
 * 调用方流程：manager.getConfig(id) / saveConfig(id, patch)——配置持久化在扩展目录 config.json
 */

import type { ProviderCenter } from './provider-center'

/** 扩展管理器（上层业务——配置管理） */
export class ProviderManager {
  constructor(private readonly center: ProviderCenter) {}

  /** 配置 Schema（唯一来源：manifest 静态 configSchema——不依赖 Worker——
   *  动态 getConfigSchema 链路已废弃——扩展配置必须静态声明） */
  async getSchema(id: string): Promise<unknown> {
    return this.center.getProvider(id)?.manifest.configSchema ?? null
  }

  /** 读取配置（secret 字段脱敏——依据 manifest 静态 schema） */
  async getConfig(id: string): Promise<Record<string, unknown>> {
    const record = this.center.getProvider(id)
    const config = record?.ctx?.getConfig<Record<string, unknown>>() ?? {}
    const schema = record?.manifest.configSchema as { properties?: Record<string, { type?: string }> } | null
    if (!schema) return config
    const redacted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      // secret 类型不返回明文
      redacted[key] = schema.properties?.[key]?.type === 'secret' ? '••••••' : value
    }
    return redacted
  }

  /** 保存配置（写入扩展目录 config.json——center 记录转发） */
  async saveConfig(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const record = this.center.getProvider(id)
    if (!record?.ctx) return false
    record.ctx.setConfig(patch)
    return true
  }
}
