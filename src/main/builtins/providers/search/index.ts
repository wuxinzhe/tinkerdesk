/**
 * providers/search/index.ts — 网页搜索内置 provider 注册表
 *
 * 8 个内置实现（bing-html / brave-free / ddgs / searxng / exa / parallel / tavily / firecrawl）
 * + registry 分发（显式 backend 优先，availability-walk 自动回退）。
 *
 * 环境变量：SHOWING_WEB_SEARCH_BACKEND / TAVILY_API_KEY / TAVILY_BASE_URL /
 *   FIRECRAWL_API_KEY / FIRECRAWL_API_URL / BRAVE_SEARCH_API_KEY / EXA_API_KEY /
 *   PARALLEL_API_KEY / SEARXNG_URL
 */
import { stripTags } from '../../../utils/html-utils'
import { fetchUrl, errMessage } from '../../../utils/http'
import type { SearchProvider, WebSearchResponseData } from './types'

export type { SearchProvider, SearchResultItem, WebSearchResponseData } from './types'

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

// ── Registry ──

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

/** 显式配置的 backend（SHOWING_WEB_SEARCH_BACKEND） */
export function getConfiguredBackend(): string | null {
  const backend = process.env.SHOWING_WEB_SEARCH_BACKEND ?? ''
  return backend.trim().length > 0 ? backend.trim() : null
}

/** 按 id 查 provider */
export function getProvider(id: string): SearchProvider | null {
  return providers.find(p => p.id === id) ?? null
}

/** availability-walk：优先有 key 的 provider，ddgs 这类无 key 免费后端最后兜底 */
export function getActiveSearchProvider(): SearchProvider | null {
  const withKey = providers.find(p => p.isAvailable() && p.supportsSearch() && p.id !== 'ddgs')
  if (withKey) return withKey
  return providers.find(p => p.isAvailable() && p.supportsSearch()) ?? null
}

/** 全部内置 provider 清单（供 WebProvider/工具壳展示） */
export function listBuiltinSearchProviders(): Array<{ id: string; name: string; available: boolean }> {
  return providers.map(p => ({ id: p.id, name: p.name, available: p.isAvailable() }))
}
