/**
 * desktop/text-to-speech-tool.ts — 文本转语音工具（Agent 可用）
 *
 * Text-to-speech tool:
 * - schema：text（必填）+ output_path（可选）
 * - provider 用户配置（内置 Edge 在线语音 / 扩展 sherpa / omni-voice），模型只发文本
 * - 长文本按 provider 上限截断
 * - 返回 { success, file_path } + MEDIA: 路径
 */
import { join } from 'path'
import { mkdirSync } from 'fs'
import { app } from 'electron'
import { BaseTool } from './base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { AudioToolProvider } from '../../service/audio-tool-provider'

/** 工具名 */
export const TOOL_NAME = 'tts'

/** 默认输出目录：userData/audio_cache */
function defaultOutputDir(): string {
  const dir = join(app.getPath('userData'), 'audio_cache')
  mkdirSync(dir, { recursive: true })
  return dir
}

export class TextToSpeechTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly audioToolProvider?: AudioToolProvider) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return !!this.audioToolProvider
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as { text?: unknown; output_path?: unknown }
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text) {
      return ToolResult.sync(JSON.stringify({ success: false, error: 'text 不能为空' }))
    }
    try {
      // 长文本截断（Edge 上限 5000 字符——与 PROVIDER_MAX_TEXT_LENGTH 对齐）
      const MAX_TEXT = 5000
      const effective = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text

      const outputPath = typeof args.output_path === 'string' && args.output_path.trim()
        ? args.output_path.trim()
        : join(defaultOutputDir(), `${Date.now()}.mp3`)

      const filePath = await this.audioToolProvider!.speak(effective, outputPath)
      return ToolResult.sync(JSON.stringify({
        success: true,
        file_path: filePath,
        media: `MEDIA:${filePath}`,
      }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }
}
