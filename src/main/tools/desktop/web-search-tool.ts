/**
 * desktop/web-search-tool.ts — 网络搜索工具（壳）
 *
 * Execution core split into providers/search (built-in provider registry).
 * 壳职责：schema / 参数校验 / 插件 provider 优先 + 内置回退 / 结果序列化。
 *
 * 环境变量（内置 provider 用）：SHOWING_WEB_SEARCH_BACKEND / TAVILY_API_KEY 等——见 providers/search。
 */
import { BaseTool } from '../base-tool'
import { ToolResult } from '../../core/tool/tool-result'
import { errMessage } from '../../utils/http'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { WebProvider } from '../../service/web-provider'
import type { WebSearchResponseData } from '../../providers/search/types'
import { getConfiguredBackend, getProvider, getActiveSearchProvider } from '../../providers/search'
import type { WebSearchParams } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_web_search'

/** int 转换失败兜底 5，clamp [1,100] */
function clampLimit(raw: unknown): number {
  let limit: number
  try {
    limit = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
  } catch {
    limit = 5
  }
  if (!Number.isFinite(limit)) limit = 5
  return Math.min(Math.max(limit, 1), 100)
}

/** 网络搜索工具 */
export class WebSearchTool extends BaseTool {
  constructor(renderer: PromptRenderer, private readonly webProvider?: WebProvider) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    // 与 execute 同逻辑：显式 backend 优先，否则 availability-walk
    const backend = getConfiguredBackend()
    let provider = backend ? getProvider(backend) : null
    if (!provider || !provider.supportsSearch() || !provider.isAvailable()) {
      provider = getActiveSearchProvider()
    }
    return provider !== null
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as WebSearchParams
    const debugCallData: Record<string, unknown> = {
      query: params.query, limit: params.limit
    }
    console.log('[web_search] call:', JSON.stringify(debugCallData))

    try {
      const limit = clampLimit(params.limit)
      const query = (params.query ?? '').trim()
      if (!query) {
        return ToolResult.sync(JSON.stringify({ success: false, error: '搜索词为空' }))
      }

      // ── 插件 provider 优先（激活了插件则调用；未激活/失败回退内置） ──
      let responseData: WebSearchResponseData | null = null
      if (this.webProvider) {
        try {
          const pluginRes = await this.webProvider.callPlugin<{ results?: Array<{ title?: string; url?: string; description?: string }> }>('web.search', { query, limit })
          if (pluginRes?.results && pluginRes.results.length > 0) {
            responseData = {
              success: true,
              data: {
                web: pluginRes.results.map((r, i) => ({
                  title: r.title ?? '',
                  url: r.url ?? '',
                  description: r.description ?? '',
                  position: i + 1
                }))
              }
            }
          }
        } catch (e) {
          if (!this.webProvider.allowFallback()) {
            return ToolResult.sync(JSON.stringify({ success: false, error: `搜索插件失败: ${errMessage(e)}` }))
          }
          console.warn('[web_search] 插件 provider 失败，回退内置:', errMessage(e))
        }
      }

      if (!responseData) {
        // 内置：显式配置的 backend → 优先；不可用/不存在 → availability-walk
        const backend = getConfiguredBackend()
        let provider = backend ? getProvider(backend) : null
        if (!provider || !provider.supportsSearch() || !provider.isAvailable()) {
          provider = getActiveSearchProvider()
        }

        if (!provider) {
          responseData = {
            success: false,
            error: 'No web search provider configured. Set SHOWING_WEB_SEARCH_BACKEND or configure a provider API key.'
          }
        } else {
          responseData = await provider.search(query, limit)
        }
      }

      const resultJson = JSON.stringify(responseData, null, 2)

      // 语义：success=false 时也把 JSON 返回给 LLM（模型能看到错误原因并重试/换工具）
      return ToolResult.sync(resultJson)
    } catch (exc) {
      const errorMsg = `Error searching web: ${errMessage(exc)}`
      debugCallData['error'] = errorMsg
      console.log('[web_search] call:', JSON.stringify(debugCallData))
      return ToolResult.sync(JSON.stringify({ success: false, error: errorMsg }))
    }
  }
}
