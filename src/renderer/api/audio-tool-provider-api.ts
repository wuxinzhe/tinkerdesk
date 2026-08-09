/**
 * audio-tool-provider-api.ts — Agent 语音工具（text_to_speech / speech_to_text）
 * provider 配置 API（AudioToolProviderController）。
 */

export type AudioToolInterfaceId = 'tool.tts' | 'tool.stt'

export interface AudioToolProviderInfo {
  pluginId: string
  name: string
  version: string
  interfaceVersion: number
}

export interface AudioToolProviderListVO {
  iface: AudioToolInterfaceId
  providers: AudioToolProviderInfo[]
  activeProviderId: string | null
  fallback: boolean
}

export class AudioToolProviderApi {
  async list(iface: AudioToolInterfaceId): Promise<AudioToolProviderListVO | null> {
    try {
      return await window.api.audioToolProvider.list(iface)
    } catch {
      return null
    }
  }

  async set(payload: { iface: AudioToolInterfaceId; providerId?: string | null; fallback?: boolean }): Promise<AudioToolProviderListVO | null> {
    try {
      return await window.api.audioToolProvider.set(payload)
    } catch {
      return null
    }
  }
}

/** 默认实例 */
export const audioToolProviderApi = new AudioToolProviderApi()
