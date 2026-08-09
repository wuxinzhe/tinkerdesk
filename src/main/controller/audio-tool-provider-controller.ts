/**
 * audio-tool-provider-controller.ts — Agent 语音工具（text_to_speech / speech_to_text）
 * provider 配置 IPC controller
 *
 * 前端工具管理页（supportsProvider 的工具）的 L3 设置页调用：
 *   audio-tool-provider:list  → 某接口的插件 provider 列表 + 内置 Edge + 激活配置
 *   audio-tool-provider:set   → 设置激活 provider / 回退开关
 */

import { handleTrusted } from '../security/ipc-guard'
import type { AudioToolProvider, AudioToolInterfaceId, AudioToolProviderInfo, AudioToolProviderConfig } from '../service/audio-tool-provider'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'

export interface AudioToolProviderListDTO {
  iface: AudioToolInterfaceId
}

export interface AudioToolProviderSetDTO {
  iface: AudioToolInterfaceId
  /** 激活 provider id（'builtin-edge' / 插件 id / null = 默认） */
  providerId?: string | null
  /** 失败回退内置开关（可选） */
  fallback?: boolean
}

export interface AudioToolProviderListVO {
  iface: AudioToolInterfaceId
  /** 插件 provider 列表（内置 Edge 插件也在内——pluginId 以 builtin- 开头） */
  providers: AudioToolProviderInfo[]
  /** 当前激活 provider id */
  activeProviderId: string | null
  /** 失败回退内置开关 */
  fallback: boolean
}

/** Agent 语音工具 provider controller */
export class AudioToolProviderController {
  constructor(private readonly audioToolProvider: AudioToolProvider) { }

  register(): void {
    handleTrusted('audio-tool-provider:list', (_event, payload) => this.listProviders(payload))
    handleTrusted('audio-tool-provider:set', (_event, payload) => this.setProvider(payload))
  }

  private listProviders(payload: AudioToolProviderListDTO): ApiResponse<AudioToolProviderListVO> {
    const iface = payload?.iface
    if (iface !== 'tool.tts' && iface !== 'tool.stt') {
      return fail('iface 必须是 tool.tts 或 tool.stt')
    }
    const config = this.audioToolProvider.getConfig()
    return ok({
      iface,
      providers: this.audioToolProvider.providers(iface),
      activeProviderId: iface === 'tool.tts' ? this.audioToolProvider.getActiveTts() : this.audioToolProvider.getActiveStt(),
      fallback: config.fallback,
    })
  }

  private setProvider(payload: AudioToolProviderSetDTO): ApiResponse<AudioToolProviderListVO> {
    const iface = payload?.iface
    if (iface !== 'tool.tts' && iface !== 'tool.stt') {
      return fail('iface 必须是 tool.tts 或 tool.stt')
    }
    const patch: Partial<AudioToolProviderConfig> = {}
    if (payload.providerId !== undefined) {
      const providerId = payload.providerId || null
      if (providerId && providerId !== 'builtin-edge' && !this.audioToolProvider.providers(iface).some((p) => p.pluginId === providerId)) {
        return fail(`provider 不存在: ${providerId}`)
      }
      if (iface === 'tool.tts') patch.tts = providerId
      else patch.stt = providerId
    }
    if (payload.fallback !== undefined) patch.fallback = payload.fallback
    this.audioToolProvider.setConfig(patch)
    return this.listProviders({ iface })
  }
}
