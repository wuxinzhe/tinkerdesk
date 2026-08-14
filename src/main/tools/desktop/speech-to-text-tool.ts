/**
 * desktop/speech-to-text-tool.ts — 语音转文本工具（Agent 可用）
 *
 * transcription（tools/transcription_tools.py）：
 * - schema：file_path（必填）
 * - provider 用户配置（插件 sherpa 本地等），模型只发文件路径
 * - 返回 { success, text }
 */
import { existsSync } from 'fs'
import { BaseTool } from '../base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import { resolveMediaPath } from '../../service/media-service'
import type { AudioToolProvider } from '../../service/audio-tool-provider'

/** 工具名 */
export const TOOL_NAME = 'stt'

export class SpeechToTextTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly audioToolProvider?: AudioToolProvider) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    return !!this.audioToolProvider
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as { file_path?: unknown }
    const filePath = typeof args.file_path === 'string' ? args.file_path.trim() : ''
    if (!filePath) {
      return ToolResult.sync(JSON.stringify({ success: false, error: 'file_path 不能为空' }))
    }
    // 相对路径（media/xxx.wav）→ 绝对（media 目录）；绝对路径原样
    const absPath = resolveMediaPath(filePath)
    if (!existsSync(absPath)) {
      return ToolResult.sync(JSON.stringify({ success: false, error: `音频文件不存在: ${filePath}` }))
    }
    try {
      const text = await this.audioToolProvider!.transcribe(absPath)
      return ToolResult.sync(JSON.stringify({ success: true, text }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }
}
