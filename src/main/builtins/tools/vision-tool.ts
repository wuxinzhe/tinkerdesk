/**
 * vision-tool.ts — vision_recognize 工具（图像识别——内建 provider 走 llm-router）
 *
 * Availability: whether a provider is configured (VisionProvider injected — uses scene model).
 * 执行：image_url（http/https/data: base64）→ VisionProvider.recognize
 *      → scene=image_recognition（本地 ollama qwen3.5:9B 多模态）→ 返回文本
 */
import { BaseTool } from './base-tool'
import type { ToolContext } from '../../core/loop/types'
import { ToolResult } from '../../core/tool/tool-result'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { VisionProvider } from '../../service/vision-provider'

/** 工具名（desktop 组——扩展工具） */
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
    // 兼容：image_url 可以是字符串（单图）或数组（多图——最多 5）
    const raw = args.image_url
    const images: string[] = []
    if (typeof raw === 'string') {
      if (raw.trim()) images.push(raw.trim())
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) images.push(item.trim())
      }
    }
    if (images.length === 0) {
      return ToolResult.sync(JSON.stringify({ success: false, error: 'image_url 不能为空' }))
    }
    if (images.length > 4) {
      // 单批上限 4（本地视觉模型实测稳定边界——超出截断，剩余由 LLM 分批再调）
      images.length = 4
    }
    const prompt = typeof args.prompt === 'string' && args.prompt.trim() ? args.prompt.trim() : '描述这张图片'
    try {
      const text = await this.visionProvider!.recognize(ctx.profile, images, prompt)
      return ToolResult.sync(JSON.stringify({ success: true, text }))
    } catch (e) {
      return ToolResult.sync(JSON.stringify({ success: false, error: (e as Error).message }))
    }
  }
}
