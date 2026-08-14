/**
 * vision-tool.ts — vision_recognize 工具（图像识别——内建 provider 走 llm-router）
 *
 * Availability: whether a provider is configured (VisionProvider injected — uses scene model).
 * 执行：image_url（http/https/data: base64）→ VisionProvider.recognize
 *      → scene=image_recognition（本地 ollama qwen3.5:9B 多模态）→ 返回文本
 */
import { BaseTool } from '../base-tool'
import type { ToolContext } from '../../core/loop/types'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { VisionProvider } from '../../service/vision-provider'

/** 工具名（desktop 组——插件工具） */
export const TOOL_NAME = 'desktop_tinker_vision_recognize'

/** vision_recognize 工具 */
export class VisionRecognizeTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly visionProvider?: VisionProvider) {
    super(renderer, TOOL_NAME)
  }

  /** 可用性：provider 是否配置（图像识别场景已绑模型——resolveForScene 有兜底） */
  check(): boolean {
    return !!this.visionProvider
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const args = (ctx.toolCall.arguments ?? {}) as { image_url?: unknown; prompt?: unknown }
    const imageUrl = typeof args.image_url === 'string' ? args.image_url.trim() : ''
    if (!imageUrl) {
      return ToolResult.sync(JSON.stringify({ success: false, error: 'image_url 不能为空' }))
    }
    const prompt = typeof args.prompt === 'string' && args.prompt.trim() ? args.prompt.trim() : '描述这张图片'
    try {
      const text = await this.visionProvider!.recognize(ctx.profile, [imageUrl], prompt)
      return ToolResult.sync(JSON.stringify({ success: true, text }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }
}
