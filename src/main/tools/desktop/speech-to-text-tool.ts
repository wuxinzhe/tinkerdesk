/**
 * desktop/speech-to-text-tool.ts — 语音转文本工具（Agent 可用）
 *
 * 复刻 Hermes transcription（tools/transcription_tools.py）：
 * - schema：file_path（必填）
 * - provider 用户配置（插件 sherpa 本地等），模型只发文件路径
 * - 返回 { success, text }
 */
import { existsSync } from 'fs'
import { BaseTool } from '../base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'

/** 工具名 */
export const TOOL_NAME = 'stt'

export class SpeechToTextTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly audioToolProvider?: import('../../service/audio-tool-provider').AudioToolProvider) {
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
    if (!existsSync(filePath)) {
      return ToolResult.sync(JSON.stringify({ success: false, error: `音频文件不存在: ${filePath}` }))
    }
    try {
      const text = await this.audioToolProvider!.transcribe(filePath)
      return ToolResult.sync(JSON.stringify({ success: true, text }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }
}
