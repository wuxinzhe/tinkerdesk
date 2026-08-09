/**
 * voice-controller.ts — 语音服务 IPC（系统固定接口：录音是应用固有功能，STT/TTS 转发给插件 provider）
 *
 * 频道：
 *   voice:providers      → { stt: [...], tts: [...] } 可用 provider 列表
 *   voice:get-config     → { sttProvider, ttsProvider } 当前激活
 *   voice:set-provider   → 保存激活 { sttProvider?, ttsProvider? }
 *   voice:provider-ready → 查询 provider 模型就绪 { pluginId }
 *   voice:stt:transcribe → { samples: Float32Array } → { text } 转发当前 STT provider
 *   voice:tts:speak      → { text } → { audio } 转发当前 TTS provider
 */

import { handleTrusted } from '../security/ipc-guard'
import { VoiceProviderService, type VoiceConfig, type VoiceProviderInfo } from '../service/voice-provider-service'

type ApiResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data }
}
function fail(error: string): ApiResult<never> {
  return { success: false, error }
}

export class VoiceController {
  constructor(private readonly voiceService: VoiceProviderService) {}

  register(): void {
    handleTrusted('voice:providers', () => this.listProviders())
    handleTrusted('voice:get-config', () => this.getConfig())
    handleTrusted('voice:set-provider', (_event, payload: Partial<VoiceConfig>) =>
      this.setProvider(payload),
    )
    handleTrusted('voice:provider-ready', (_event, payload: { pluginId: string }) =>
      this.providerReady(payload),
    )
    handleTrusted('voice:stt:transcribe', (_event, payload: { samples: Float32Array }) =>
      this.transcribe(payload),
    )
    handleTrusted('voice:tts:speak', (_event, payload: { text: string }) =>
      this.speak(payload),
    )
  }

  /** 可用 provider 列表 */
  private listProviders(): ApiResult<{ stt: VoiceProviderInfo[]; tts: VoiceProviderInfo[] }> {
    try {
      return ok(this.voiceService.providers())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 当前激活配置 */
  private getConfig(): ApiResult<VoiceConfig> {
    try {
      return ok(this.voiceService.getConfig())
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 保存激活 provider */
  private setProvider(payload: Partial<VoiceConfig>): ApiResult<VoiceConfig> {
    try {
      if (!payload || (payload.sttProvider === undefined && payload.ttsProvider === undefined)) {
        return fail('参数不能为空')
      }
      return ok(this.voiceService.setConfig({
        sttProvider: payload.sttProvider ?? undefined,
        ttsProvider: payload.ttsProvider ?? undefined,
      }))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** 查询 provider 模型就绪状态 */
  private async providerReady(payload: { pluginId: string }): Promise<ApiResult<boolean>> {
    try {
      if (!payload?.pluginId) return fail('pluginId 不能为空')
      return ok(await this.voiceService.providerReady(payload.pluginId))
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** STT 转文本（转发当前 provider） */
  private async transcribe(payload: { samples: Float32Array }): Promise<ApiResult<{ text: string }>> {
    try {
      if (!payload?.samples || payload.samples.length === 0) return fail('音频数据为空')
      return ok({ text: await this.voiceService.transcribe(payload.samples) })
    } catch (e) {
      return fail((e as Error).message)
    }
  }

  /** TTS 合成（转发当前 provider） */
  private async speak(payload: { text: string }): Promise<ApiResult<{ audio: string }>> {
    try {
      const text = payload?.text?.trim() ?? ''
      if (!text) return fail('text 不能为空')
      return ok({ audio: await this.voiceService.speak(text) })
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
