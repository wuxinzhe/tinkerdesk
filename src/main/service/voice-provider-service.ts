/**
 * voice-provider-service.ts — 语音服务（系统固定接口的多 provider 抽象）
 *
 * 系统开放接口（固定契约）：
 *   voice.stt  → 插件实现 stt:transcribe（Float32Array 16kHz → {text}）
 *   voice.tts  → 插件实现 tts:speak（{text} → {audio data URL}）
 *
 * 任何插件在 manifest.systemInterfaces 声明实现这些接口，即成为一个 provider
 * （如 sherpa 本地、OmniVoice 克隆等可同时存在）。用户可在系统设置选择激活哪个。
 *
 * 录音（麦克风采集）是应用固有功能，不在插件职责内。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { PluginManager } from '../core/plugin/plugin-manager'
import type { PluginManifest } from '../core/plugin/types'

export interface VoiceProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
  /** 模型是否就绪（经插件 models:status 查询，失败视为未知） */
  ready?: boolean
}

export interface VoiceConfig {
  sttProvider: string | null
  ttsProvider: string | null
}

export class VoiceProviderService {
  private readonly configFile: string

  constructor(private readonly pluginManager: PluginManager) {
    this.configFile = join(app.getPath('userData'), 'voice-config.json')
  }

  /** 收集语音接口的 provider（从 PluginManager 的接口 provider 注册表读取） */
  providers(): { stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] } {
    const toInfo = (r: { manifest: PluginManifest }): VoiceProviderInfo => ({
      pluginId: r.manifest.id,
      name: r.manifest.name,
      version: r.manifest.version,
      interfaceVersion: r.manifest.systemInterfaces?.find((i) => i.id.startsWith('voice.'))?.version ?? 1,
    })
    return {
      stt: this.pluginManager.getProviders('voice.stt').map(toInfo),
      tts: this.pluginManager.getProviders('voice.tts').map(toInfo),
    }
  }

  /** 读取激活配置（默认取第一个可用 provider） */
  getConfig(): VoiceConfig {
    const stored = this.readStored()
    const { stt, tts } = this.providers()
    return {
      sttProvider: stored.sttProvider && stt.some((p) => p.pluginId === stored.sttProvider)
        ? stored.sttProvider
        : (stt[0]?.pluginId ?? null),
      ttsProvider: stored.ttsProvider && tts.some((p) => p.pluginId === stored.ttsProvider)
        ? stored.ttsProvider
        : (tts[0]?.pluginId ?? null),
    }
  }

  /** 保存激活配置（只更新传入的字段——undefined 不覆盖已有值） */
  setConfig(patch: Partial<VoiceConfig>): VoiceConfig {
    const current = this.readStored()
    const next = { ...current }
    if (patch.sttProvider !== undefined) next.sttProvider = patch.sttProvider
    if (patch.ttsProvider !== undefined) next.ttsProvider = patch.ttsProvider
    writeFileSync(this.configFile, JSON.stringify(next, null, 2), 'utf-8')
    return this.getConfig()
  }

  /** STT 转文本：转发给当前激活的 STT provider */
  async transcribe(samples: Float32Array): Promise<string> {
    const { sttProvider } = this.getConfig()
    if (!sttProvider) throw new Error('未配置 STT provider，请到 系统设置 → 语音设置 选择')
    const result = await this.pluginManager.invokePlugin<{ text?: string }>(
      sttProvider,
      'stt:transcribe',
      { samples },
    )
    return result?.text ?? ''
  }

  /** TTS 合成：转发给当前激活的 TTS provider，返回 audio data URL */
  async speak(text: string): Promise<string> {
    const { ttsProvider } = this.getConfig()
    if (!ttsProvider) throw new Error('未配置 TTS provider，请到 系统设置 → 语音设置 选择')
    const result = await this.pluginManager.invokePlugin<{ audio?: string }>(
      ttsProvider,
      'tts:speak',
      { text },
    )
    return result?.audio ?? ''
  }

  /** 查询 provider 就绪状态（统一以插件状态为准——registered=自检通过可用的最终状态——
   *  与插件列表/配置页一致；不再用 Worker models:status 的 allReady（那是"全部模型齐"语义——
   *  与插件自检的"当前配置就绪"不一致） */
  async providerReady(pluginId: string): Promise<boolean> {
    try {
      const status = await this.pluginManager.getStatus(pluginId)
      return status.status === 'registered'
    } catch {
      return false
    }
  }

  private readStored(): VoiceConfig {
    if (!existsSync(this.configFile)) return { sttProvider: null, ttsProvider: null }
    try {
      const raw = JSON.parse(readFileSync(this.configFile, 'utf-8'))
      return {
        sttProvider: raw.sttProvider ?? null,
        ttsProvider: raw.ttsProvider ?? null,
      }
    } catch {
      return { sttProvider: null, ttsProvider: null }
    }
  }
}
