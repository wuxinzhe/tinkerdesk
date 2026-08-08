/**
 * desktop/web-search-tool.ts — 网络搜索工具
 *
 * 复刻 tinker-agent-ui tools/desktop/web-search：
 * - 7 个后端（bing-html / brave-free / ddgs / searxng / exa / parallel / tavily / firecrawl）
 * - registry 分发：显式配置 backend → 不可用则 availability-walk 自动回退
 * - limit clamp [1,100]，非法值兜底 5
 *
 * 环境变量：
 *   SHOWING_WEB_SEARCH_BACKEND — 显式指定后端（可选，默认自动选择）
 *   TAVILY_API_KEY / TAVILY_BASE_URL / FIRECRAWL_API_KEY / FIRECRAWL_API_URL
 *   BRAVE_SEARCH_API_KEY / EXA_API_KEY / PARALLEL_API_KEY / SEARXNG_URL
 */
import { BaseTool } from '../base-tool'
import { stripTags } from '../../utils/html-utils'
import { ToolResult } from '../../core/tool/tool-result'
import { fetchUrl, errMessage } from '../../utils/http'
import type { PromptRenderer } from '../../core/prompt/renderer'
import type { ToolContext } from '../../core/loop/types'
import type { SearchProvider, WebSearchParams, WebSearchResponseData } from './types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_web_search'

function normalize(rows: Array<{ title?: string; url?: string; description?: string; content?: string; text?: string }>): WebSearchResponseData {
  const web = rows.map((r, i) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.description ?? r.content ?? r.text ?? '',
    position: i + 1
  }))
  return { success: true, data: { web } }
}

// ── Provider: bing-html（cn.bing.com，无 key，国内直连兜底）──

class BingHtmlProvider implements SearchProvider {
  readonly id = 'bing-html'
  readonly name = 'bing-html'

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return true }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`
      const html = await fetchUrl(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      })
      const rows: Array<{ title: string; url: string; description: string }> = []
      // b_algo 块：<li class="b_algo">...</li>（标题 a + 链接 + snippet p）
      const blockRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<\/li>/gi
      let blockMatch: RegExpExecArray | null
      while ((blockMatch = blockRegex.exec(html)) !== null && rows.length < limit) {
        const block = blockMatch[0]
        const titleMatch = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
        if (!titleMatch) continue
        const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)
        rows.push({
          title: stripTags(titleMatch[2]),
          url: titleMatch[1].replace(/&amp;/g, '&'),
          description: snippetMatch ? stripTags(snippetMatch[1]).replace(/\s+/g, ' ') : ''
        })
      }
      if (rows.length === 0) {
        return { success: false, error: 'Bing 未返回结果（可能被反爬或网络受限）' }
      }
      return normalize(rows)
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: brave-free（GET api.search.brave.com）──

class BraveFreeProvider implements SearchProvider {
  readonly id = 'brave-free'
  readonly name = 'brave-free'
  private readonly apiKey = process.env.BRAVE_SEARCH_API_KEY ?? ''

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.apiKey) throw new Error('BRAVE_SEARCH_API_KEY environment variable not set')
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
      const raw = await fetchUrl(url, { 'X-Subscription-Token': this.apiKey })
      const parsed = JSON.parse(raw) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }
      return normalize(parsed.web?.results ?? [])
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: ddgs（DuckDuckGo，无 key）──

class DdgsProvider implements SearchProvider {
  readonly id = 'ddgs'
  readonly name = 'ddgs'

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return true }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const html = await fetchUrl(url)
      const rows: Array<{ title: string; url: string; description: string }> = []
      const blockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*result__body[^"]*"[^>]*>/gi
      let blockMatch: RegExpExecArray | null
      while ((blockMatch = blockRegex.exec(html)) !== null && rows.length < limit) {
        const block = blockMatch[0]
        const titleMatch = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
        const urlMatch = /<a[^>]*class="[^"]*result__a[^"]*"\s*href="([^"]+)"/i.exec(block)
        if (!titleMatch || !urlMatch) continue
        const snippetMatch = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
        rows.push({
          title: stripTags(titleMatch[1]),
          url: urlMatch[1].replace(/&amp;/g, '&'),
          description: snippetMatch ? stripTags(snippetMatch[1]).replace(/\s+/g, ' ') : ''
        })
      }
      return normalize(rows)
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: searxng（自托管，SEARXNG_URL）──

class SearxngProvider implements SearchProvider {
  readonly id = 'searxng'
  readonly name = 'searxng'
  private readonly baseUrl = process.env.SEARXNG_URL ?? ''

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.baseUrl.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.baseUrl) throw new Error('SEARXNG_URL environment variable not set')
      const url = `${this.baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`
      const raw = await fetchUrl(url)
      const parsed = JSON.parse(raw) as { results?: Array<{ title?: string; url?: string; content?: string }> }
      return normalize((parsed.results ?? []).slice(0, limit))
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: exa（POST api.exa.ai/search）──

class ExaProvider implements SearchProvider {
  readonly id = 'exa'
  readonly name = 'exa'
  private readonly apiKey = process.env.EXA_API_KEY ?? ''

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.apiKey) throw new Error('EXA_API_KEY environment variable not set')
      const body = JSON.stringify({ query, numResults: limit })
      const raw = await fetchUrl('https://api.exa.ai/search', { 'x-api-key': this.apiKey }, body)
      const parsed = JSON.parse(raw) as { results?: Array<{ title?: string; url?: string; text?: string }> }
      return normalize(parsed.results ?? [])
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: parallel（POST api.parallel.ai/v1/search）──

class ParallelProvider implements SearchProvider {
  readonly id = 'parallel'
  readonly name = 'parallel'
  private readonly apiKey = process.env.PARALLEL_API_KEY ?? ''

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.apiKey) throw new Error('PARALLEL_API_KEY environment variable not set')
      const body = JSON.stringify({ query, limit })
      const raw = await fetchUrl('https://api.parallel.ai/v1/search', { 'X-API-Key': this.apiKey }, body)
      const parsed = JSON.parse(raw) as
        | { web?: Array<{ title?: string; url?: string; description?: string }> }
        | { results?: Array<{ title?: string; url?: string; description?: string }> }
      const rows = 'web' in parsed ? (parsed.web ?? []) : ('results' in parsed ? (parsed.results ?? []) : [])
      return normalize(rows)
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: tavily（POST api.tavily.com/search）──

class TavilyProvider implements SearchProvider {
  readonly id = 'tavily'
  readonly name = 'tavily'
  private readonly apiKey = process.env.TAVILY_API_KEY ?? ''
  private readonly baseUrl = process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com'

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.apiKey) throw new Error('TAVILY_API_KEY environment variable not set. Get your API key at https://app.tavily.com/home')
      const body = JSON.stringify({ api_key: this.apiKey, query, max_results: limit })
      const raw = await fetchUrl(`${this.baseUrl}/search`, {}, body)
      const parsed = JSON.parse(raw) as { results?: Array<{ title?: string; url?: string; content?: string }> }
      return normalize(parsed.results ?? [])
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Provider: firecrawl（POST api.firecrawl.dev/v1/search）──

class FirecrawlProvider implements SearchProvider {
  readonly id = 'firecrawl'
  readonly name = 'firecrawl'
  private readonly apiKey = process.env.FIRECRAWL_API_KEY ?? ''
  private readonly baseUrl = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev'

  supportsSearch(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async search(query: string, limit: number): Promise<WebSearchResponseData> {
    try {
      if (!this.apiKey) throw new Error('FIRECRAWL_API_KEY environment variable not set')
      const body = JSON.stringify({ query, limit })
      const raw = await fetchUrl(`${this.baseUrl}/v1/search`, { Authorization: `Bearer ${this.apiKey}` }, body)
      const parsed = JSON.parse(raw) as { success?: boolean; data?: Array<{ title?: string; url?: string; description?: string }> }
      if (!parsed.success) throw new Error('Firecrawl search failed')
      return normalize(parsed.data ?? [])
    } catch (exc) {
      return { success: false, error: errMessage(exc) }
    }
  }
}

// ── Registry──

const providers: SearchProvider[] = [
  // 无 key 国内直连兜底优先（ddgs 国内不可达，放最后）
  new BingHtmlProvider(),
  new BraveFreeProvider(),
  new DdgsProvider(),
  new SearxngProvider(),
  new ExaProvider(),
  new ParallelProvider(),
  new TavilyProvider(),
  new FirecrawlProvider()
]

function getConfiguredBackend(): string | null {
  const backend = process.env.SHOWING_WEB_SEARCH_BACKEND ?? ''
  return backend.trim().length > 0 ? backend.trim() : null
}

function getProvider(id: string): SearchProvider | null {
  return providers.find(p => p.id === id) ?? null
}

/** availability-walk：优先有 key 的 provider，ddgs 这类无 key 免费后端最后兜底 */
function getActiveSearchProvider(): SearchProvider | null {
  const withKey = providers.find(p => p.isAvailable() && p.supportsSearch() && p.id !== 'ddgs')
  if (withKey) return withKey
  return providers.find(p => p.isAvailable() && p.supportsSearch()) ?? null
}

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
  constructor(renderer: PromptRenderer) {
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

      // 显式配置的 backend → 优先；不可用/不存在 → availability-walk
      const backend = getConfiguredBackend()
      let provider = backend ? getProvider(backend) : null
      if (!provider || !provider.supportsSearch() || !provider.isAvailable()) {
        provider = getActiveSearchProvider()
      }

      let responseData: WebSearchResponseData
      if (!provider) {
        responseData = {
          success: false,
          error: 'No web search provider configured. Set SHOWING_WEB_SEARCH_BACKEND or configure a provider API key.'
        }
      } else {
        responseData = await provider.search(query, limit)
      }

      const resultJson = JSON.stringify(responseData, null, 2)

      // Hermes 语义：success=false 时也把 JSON 返回给 LLM（模型能看到错误原因并重试/换工具）
      return ToolResult.sync(resultJson)
    } catch (exc) {
      const errorMsg = `Error searching web: ${errMessage(exc)}`
      debugCallData['error'] = errorMsg
      console.log('[web_search] call:', JSON.stringify(debugCallData))
      return ToolResult.sync(JSON.stringify({ success: false, error: errorMsg }))
    }
  }
}
