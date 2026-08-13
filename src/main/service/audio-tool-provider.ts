/**
 * audio-tool-provider.ts — Agent 语音工具（text_to_speech / speech_to_text）的多 provider 抽象
 *
 * 系统开放接口（与系统语音 voice.* 完全分开——使用场景/设置位置都不同）：
 *   tool.tts   → 插件实现 tts:speak_file（{ text, outputPath } → { filePath }）
 *   tool.stt   → 插件实现 stt:transcribe_file（{ filePath } → { text }）
 *
 * 内置 provider：builtin-edge-tts（Edge 在线语音插件——代码注册的内置插件，默认兜底）；
 * tool.stt 无内置（需要插件——本地 sherpa 或云端）。
 * 激活配置独立文件 audio-tool-provider-config.json（与 voice-config.json 分开）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import { PluginManager } from '../core/plugin/plugin-manager'
import type { PluginManifest } from '../core/plugin/types'

/** Agent 语音工具接口 */
export type AudioToolInterfaceId = 'tool.tts' | 'tool.stt'

/** 内置 Edge TTS 插件 id（注册为 tool.tts 的内置 provider） */
export const BUILTIN_EDGE_TTS_PLUGIN = 'builtin-edge-tts'

export interface AudioToolProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
}

export interface AudioToolProviderConfig {
  /** 激活的 tts provider（'builtin-edge-tts' = 内置 Edge 插件；插件 id） */
  tts: string | null
  /** 激活的 stt provider（插件 id；null = 未配置） */
  stt: string | null
  /** 插件 provider 失败时自动回退内置 Edge TTS（默认开——仅 tts 有效） */
  fallback: boolean
}

/** 接口 → 插件注册频道（固定契约） */
const INTERFACE_CHANNELS: Record<AudioToolInterfaceId, string> = {
  'tool.tts': 'tts:speak_file',
  'tool.stt': 'stt:transcribe_file',
}

export class AudioToolProvider {
  private readonly configFile: string

  constructor(private readonly pluginManager: PluginManager) {
    this.configFile = join(app.getPath('userData'), 'audio-tool-provider-config.json')
  }

  /** 收集某接口的插件 provider（内置 Edge 不在此——由 getActiveTts 独立处理） */
  providers(iface: AudioToolInterfaceId): AudioToolProviderInfo[] {
    const toInfo = (r: { manifest: PluginManifest }): AudioToolProviderInfo => ({
      pluginId: r.manifest.id,
      name: r.manifest.name,
      version: r.manifest.version,
      interfaceVersion: r.manifest.systemInterfaces?.find((i) => i.id === iface)?.version ?? 1,
    })
    return this.pluginManager.getProviders(iface).map(toInfo)
  }

  /** 读取激活配置（tts 默认内置 Edge 插件；stt 默认空） */
  getConfig(): AudioToolProviderConfig {
    const stored = this.readStored()
    return {
      tts: stored.tts === BUILTIN_EDGE_TTS_PLUGIN ? BUILTIN_EDGE_TTS_PLUGIN
        : (stored.tts && this.exists('tool.tts', stored.tts) ? stored.tts : BUILTIN_EDGE_TTS_PLUGIN),
      stt: stored.stt && this.exists('tool.stt', stored.stt) ? stored.stt : null,
      fallback: stored.fallback !== false,
    }
  }

  /** 保存激活配置 */
  setConfig(patch: Partial<AudioToolProviderConfig>): AudioToolProviderConfig {
    const current = this.readStored()
    writeFileSync(this.configFile, JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8')
    return this.getConfig()
  }

  /** 激活的 tts provider id（内置 Edge 插件或插件 id） */
  getActiveTts(): string {
    return this.getConfig().tts ?? BUILTIN_EDGE_TTS_PLUGIN
  }

  /** 激活的 stt provider id（null = 未配置） */
  getActiveStt(): string | null {
    return this.getConfig().stt
  }

  /** 是否允许失败回退内置 Edge TTS */
  allowFallback(): boolean {
    return this.getConfig().fallback
  }

  /** 文本合成语音 → 文件路径（激活 provider：内置 Edge 插件或插件 tts:speak_file） */
  async speak(text: string, outputPath: string): Promise<string> {
    const active = this.getActiveTts()
    // 输出目录自动创建（不存在时——避免插件 copyfile / Edge open ENOENT 冒泡成未捕获异常）
    try {
      mkdirSync(dirname(outputPath), { recursive: true })
    } catch {
      // 目录创建失败——让后续报错携带明确信息（不静默）
    }
    try {
      const result = await this.pluginManager.invokePlugin<{ filePath?: string }>(
        active,
        INTERFACE_CHANNELS['tool.tts'],
        { text, outputPath },
      )
      if (result?.filePath) return result.filePath
      throw new Error('provider 未返回 filePath')
    } catch (e) {
      if (active !== BUILTIN_EDGE_TTS_PLUGIN && this.allowFallback()) {
        console.warn('[audio-tool] tts 插件失败，回退内置 Edge:', (e as Error).message)
        const fallbackResult = await this.pluginManager.invokePlugin<{ filePath?: string }>(
          BUILTIN_EDGE_TTS_PLUGIN,
          INTERFACE_CHANNELS['tool.tts'],
          { text, outputPath },
        )
        if (fallbackResult?.filePath) return fallbackResult.filePath
      }
      throw e
    }
  }

  /** 语音文件转文本（激活的 stt 插件；未配置报错） */
  async transcribe(filePath: string): Promise<string> {
    const active = this.getActiveStt()
    if (!active) {
      throw new Error('未配置 STT provider——到 工具管理 → speech_to_text → Provider 设置 选择（如 sherpa 本地）')
    }
    const result = await this.pluginManager.invokePlugin<{ text?: string }>(
      active,
      INTERFACE_CHANNELS['tool.stt'],
      { filePath },
    )
    return result?.text ?? ''
  }

  private exists(iface: AudioToolInterfaceId, pluginId: string): boolean {
    return this.providers(iface).some((p) => p.pluginId === pluginId)
  }

  private readStored(): AudioToolProviderConfig {
    if (!existsSync(this.configFile)) return { tts: BUILTIN_EDGE_TTS_PLUGIN, stt: null, fallback: true }
    try {
      const raw = JSON.parse(readFileSync(this.configFile, 'utf-8'))
      return {
        tts: raw.tts ?? BUILTIN_EDGE_TTS_PLUGIN,
        stt: raw.stt ?? null,
        fallback: raw.fallback !== false,
      }
    } catch {
      return { tts: BUILTIN_EDGE_TTS_PLUGIN, stt: null, fallback: true }
    }
  }
}
