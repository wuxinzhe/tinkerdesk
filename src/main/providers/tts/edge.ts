/**
 * providers/tts/edge.ts — 内置 tool.tts provider：Microsoft Edge 在线神经语音
 *
 * node-edge-tts（Python edge-tts 的 JS 移植）——免费、无 API key、需联网。
 * 以「内置插件」形态注册（builtin-edge-tts）——出现在插件列表、可配置音色/语速。
 */
import { EdgeTTS } from 'node-edge-tts'
import { tmpdir } from 'os'
import { join } from 'path'
import { readFileSync } from 'fs'
import { deriveStatus, type PluginApi, type TinkerPlugin } from '../../core/plugin/types'

/** 默认中文女声（微软 Edge 神经语音） */
export const DEFAULT_EDGE_VOICE = 'zh-CN-XiaoyiNeural'

/** 常用音色（下拉选项——微软 Edge 神经语音） */
export const EDGE_VOICES: Array<{ value: string; label: string }> = [
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊（女·普通话）' },
  { value: 'zh-CN-XiaoyaoNeural', label: '晓瑶（女·普通话）' },
  { value: 'zh-CN-YunxiNeural', label: '云希（男·普通话）' },
  { value: 'zh-CN-YunjianNeural', label: '云健（男·普通话）' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男·新闻）' },
  { value: 'zh-CN-YunxiaNeural', label: '云夏（男·少年）' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北（女·东北）' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮（女·陕西）' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻（女·台湾）' },
  { value: 'zh-TW-YunJheNeural', label: '雲哲（男·台湾）' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼（女·粤语）' },
  { value: 'en-US-AriaNeural', label: 'Aria（女·英文）' },
  { value: 'en-US-GuyNeural', label: 'Guy（男·英文）' },
  { value: 'ja-JP-NanamiNeural', label: '七海（女·日语）' },
]

/**
 * 文本合成语音 → 音频文件
 * @param text 要朗读的文本
 * @param outputPath 输出文件路径（.mp3）
 * @param opts voice 音色（默认 XiaoyiNeural）/ speed 语速
 */
export async function edgeTtsSpeak(
  text: string,
  outputPath: string,
  opts: { voice?: string; speed?: number } = {},
): Promise<string> {
  const voice = opts.voice || process.env.TINKER_EDGE_TTS_VOICE || DEFAULT_EDGE_VOICE
  const tts = new EdgeTTS({ voice })
  await tts.ttsPromise(text, outputPath)
  return outputPath
}

/** 内置插件 manifest（id 以 builtin- 前缀标识——前端显示「内置」标记、不可卸载） */
export const EDGE_TTS_MANIFEST = {
  id: 'builtin-edge-tts',
  name: 'Edge 在线语音',
  version: '1.0.0',
  apiVersion: 1,
  entry: '',
  builtin: true,
  capabilities: ['tts'],
  // 双接口：voice.tts（系统设置-朗读）+ tool.tts（Agent 工具 text_to_speech）
  systemInterfaces: [
    { id: 'voice.tts', version: 1 },
    { id: 'tool.tts', version: 1 },
  ],
  description: '微软 Edge 免费神经语音（默认中文 XiaoyiNeural，需联网，无 API key）',
}

/** 内置 Edge TTS 插件（voice.tts：tts:speak 系统朗读；tool.tts：tts:speak_file 工具） */
export const edgeTtsPlugin: TinkerPlugin = {
  init(ctx) {
    // ── 系统朗读（voice.tts 契约）：{ text } → { audio data URL } ──
    ctx.registerIpc('tts:speak', async (payload: unknown) => {
      const p = payload as { text?: string }
      const text = p && typeof p.text === 'string' ? p.text.trim() : ''
      if (!text) throw new Error('tts:speak 需要 text')
      const cfg = ctx.getConfig<{ voice?: string; speed?: number }>()
      const outPath = join(tmpdir(), `edge-tts-${Date.now()}-${Math.floor(Math.random() * 10000)}.mp3`)
      await edgeTtsSpeak(text, outPath, { voice: cfg.voice, speed: cfg.speed })
      const audio = `data:audio/mp3;base64,${readFileSync(outPath).toString('base64')}`
      return { audio, text }
    })

    // ── Agent 工具（tool.tts 契约）：{ text, outputPath } → { filePath } ──
    ctx.registerIpc('tts:speak_file', async (payload: unknown) => {
      const p = payload as { text?: string; outputPath?: string }
      const text = p && typeof p.text === 'string' ? p.text.trim() : ''
      const outputPath = p && typeof p.outputPath === 'string' ? p.outputPath : ''
      if (!text) throw new Error('tts:speak_file 需要 text')
      if (!outputPath) throw new Error('tts:speak_file 需要 outputPath')
      const cfg = ctx.getConfig<{ voice?: string; speed?: number }>()
      const filePath = await edgeTtsSpeak(text, outputPath, {
        voice: cfg.voice,
        speed: cfg.speed,
      })
      return { filePath }
    })

    // ── 模型状态（voice/tool 设置页查询就绪用——Edge 在线语音恒就绪） ──
    ctx.registerIpc('models:status', () => ({ stt: false, tts: true, allReady: true }))

    return {
      /** 自检：Edge 在线语音需要网络——check 只做基本就绪（true），调用失败时由上层回退/报错 */
      check: () => ({
        ok: true,
        checks: [{ name: 'Edge 在线语音', ok: true, hint: '需联网（免费、无 API key）' }],
      }),
      getConfigSchema: () => ({
        type: 'object',
        properties: {
          voice: {
            type: 'select',
            title: '音色',
            description: 'Microsoft Edge 神经语音',
            default: DEFAULT_EDGE_VOICE,
            options: EDGE_VOICES,
          },
          speed: {
            type: 'number',
            title: '语速',
            min: 0.5,
            max: 2,
            step: 0.1,
            default: 1.0,
          },
        },
      }),
      getStatus: () => ({ loaded: true, enabled: true, started: true, status: deriveStatus({ loaded: true, enabled: true, started: true }), detail: 'Edge 在线语音（需联网）' }),
      start: () => undefined,
      stop: () => undefined,
      dispose: () => undefined,
    }
  },
}
