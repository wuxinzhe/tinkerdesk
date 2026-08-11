/**
 * vision-provider.ts — 图像识别能力门面（vision_recognize 工具的执行层）
 *
 * 走 llm-router.execute（非流式）——scene = image_recognition（SCENE_VISION）：
 *   - 模型由场景绑定决定（resolveForScene——本地 ollama qwen3.5:9B 多模态）
 *   - 消息 = 多模态 content 数组（text + image_url 任意组合——OpenAI 标准）
 *   - VisionOperation 裸调用（不加系统 prompt/工具）
 */
import type { LlmRouter } from '../core/llm/llm-router'
import type { ModelConfigService } from './model-config-service'
import type { ApiContentPart, ApiMessage } from '../core/llm/types'
import { SCENE_VISION } from '../core/llm/types'
import { isSuccess } from '../core/llm/llm-response'
import { mediaFileToDataUrl, resolveMediaPath } from './media-service'

/** 图像识别异常 */
export class VisionException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionException'
  }
}

/** 图像识别能力门面 */
export class VisionProvider {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly modelConfigService: ModelConfigService
  ) {}

  /**
   * 图像识别（一张或多张图 + 文本提问）→ 返回模型文本分析
   * @param profile 会话画像（场景模型按 profile 解析）
   * @param images 图片 URL 列表（http/https/data: base64）
   * @param prompt 提问/指令
   */
  async recognize(profile: string, images: string[], prompt: string): Promise<string> {
    const content: ApiContentPart[] = []
    for (const raw of images) {
      const url = raw.trim()
      // http/https/data: 直传；本地路径（media/xxx.png、app-media://）→ 读文件转 base64
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
        content.push({ type: 'image_url', image_url: { url } })
      } else {
        const dataUrl = mediaFileToDataUrl(resolveMediaPath(url))
        content.push({ type: 'image_url', image_url: { url: dataUrl } })
      }
    }
    content.push({ type: 'text', text: prompt })
    const messages: ApiMessage[] = [{ role: 'user', content }]
    const response = await this.llmRouter.execute({
      scene: SCENE_VISION,
      messages,
      tools: [],
      modelConfigs: this.modelConfigService.resolveForScene(profile, SCENE_VISION),
    })
    if (isSuccess(response)) {
      return response.text.trim()
    }
    throw new VisionException(response.errorMessage ?? '图像识别失败')
  }
}
