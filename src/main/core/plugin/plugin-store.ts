/**
 * plugin-store.ts — 插件配置持久化（config.json——启停状态 + 配置合一个文件）
 *
 * 无状态静态函数（纯 IO）——PluginManager 调用——config.json 结构：
 * { enabled: boolean, config: Record<string, unknown> }
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { PluginConfigFile, PluginRecord } from './types'

/** 读取 config.json（不存在/损坏 → 默认 enabled=true + 空配置） */
export function readConfigFile(configFile: string): PluginConfigFile {
  try {
    if (!existsSync(configFile)) return { enabled: true, config: {} }
    const raw = JSON.parse(readFileSync(configFile, 'utf-8')) as Partial<PluginConfigFile>
    return {
      enabled: raw.enabled ?? true,
      config: raw.config ?? {},
    }
  } catch {
    return { enabled: true, config: {} }
  }
}

/** 原子写 config.json（tmp + rename——避免写坏） */
export function writeConfigFile(configFile: string, data: PluginConfigFile): void {
  const tmp = `${configFile}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, configFile)
}

/** 持久化启停状态到 config.json（与配置同文件） */
export function persistEnabled(record: PluginRecord): void {
  if (!record.ctx) return
  const configFile = join(record.ctx.configDir, 'config.json')
  const current = readConfigFile(configFile)
  writeConfigFile(configFile, { enabled: record.enabled, config: current.config })
}
