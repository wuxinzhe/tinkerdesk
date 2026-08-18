/**
 * providers/extract/index.ts — 网页抓取内置 provider 注册表
 *
 * 3 个内置实现（local-cheerio / firecrawl / tavily）+ registry 分发
 * （显式 backend 优先；availability-walk：有 key 的 API provider 优先，本地兜底）。
 *
 * 环境变量：SHOWING_WEB_EXTRACT_BACKEND / FIRECRAWL_API_KEY / FIRECRAWL_API_URL /
 *   TAVILY_API_KEY / TAVILY_BASE_URL
 */
import * as cheerio from 'cheerio'
import type { Element } from 'domhandler'
import { stripTags } from '../../../utils/html-utils'
import { fetchUrl, errMessage } from '../../../utils/http'
import type { ExtractProvider, ExtractResultItem } from './types'

export type { ExtractProvider, ExtractResultItem } from './types'

// ── 本地提取器（cheerio → markdown/html）──

function elementToMarkdown($: cheerio.CheerioAPI, el: Element): string {
  const tag = el.tagName?.toLowerCase() ?? ''
  let text = ''
  $(el).contents().each((_i, child) => {
    if (child.type === 'text') {
      text += (child.data || '').replace(/\s+/g, ' ').trim()
    } else if (child.type === 'tag') {
      const ct = child.tagName.toLowerCase()
      const inner = elementToMarkdown($, child)
      if (ct === 'a') { const href = $(child).attr('href') || ''; text += inner ? `[${inner}](${href})` : '' }
      else if (['h1','h2','h3','h4','h5','h6'].includes(ct)) text += `\n${'#'.repeat(parseInt(ct[1]))} ${inner}\n`
      else if (['b','strong'].includes(ct)) text += `**${inner}**`
      else if (['i','em'].includes(ct)) text += `*${inner}*`
      else if (ct === 'br') text += '\n'
      else if (ct === 'p') text += `\n${inner}\n`
      else if (ct === 'li') text += `\n- ${inner}`
      else if (ct === 'code') text += `\`${inner}\``
      else if (ct === 'pre') text += `\n\`\`\`\n${inner}\n\`\`\`\n`
      else if (ct === 'img') { const src = $(child).attr('src') || ''; const alt = $(child).attr('alt') || ''; text += src ? `![${alt}](${src})` : alt }
      else text += inner
    }
  })
  if (['p','div','section','article','header','footer','nav','aside','main'].includes(tag)) text = `\n${text.trim()}\n`
  return text
}

// ── Provider: local（本地 cheerio 解析，无 key 兜底）──

class LocalCheerioProvider implements ExtractProvider {
  readonly id = 'local'
  readonly name = 'local-cheerio'

  supportsExtract(): boolean { return true }
  isAvailable(): boolean { return true }

  async extract(urls: string[], format?: string): Promise<ExtractResultItem[]> {
    const results: ExtractResultItem[] = []
    for (const urlStr of urls) {
      const item: ExtractResultItem = { url: urlStr, title: '', content: '' }
      try {
        const raw = await fetchUrl(urlStr)
        if (format === 'html') {
          item.content = raw
          const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)
          item.title = m ? stripTags(m[1]) : ''
          results.push(item)
          continue
        }
        const $ = cheerio.load(raw)
        item.title = $('title').first().text().trim()
        let container = $('article').first()
        if (!container.length) container = $('main').first()
        if (!container.length) container = $('[role="main"]').first()
        if (!container.length) container = $('body').first()
        if (container.length) item.content = elementToMarkdown($, container.get(0)!).replace(/\n{3,}/g, '\n\n').trim()
        // 未提取到内容 → 尝试 body 全文
        if (!item.content) item.content = $('body').text().replace(/\s+/g, ' ').trim()
        if (!item.content) {
          item.error = 'Content was inaccessible or not found'
        }
      } catch (exc: unknown) {
        item.error = errMessage(exc)
      }
      results.push(item)
    }
    return results
  }
}

// ── Provider: firecrawl（API，有 key 时优先，支持 JS 渲染）──

class FirecrawlExtractProvider implements ExtractProvider {
  readonly id = 'firecrawl'
  readonly name = 'firecrawl'
  private readonly apiKey = process.env.FIRECRAWL_API_KEY ?? ''
  private readonly baseUrl = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev'

  supportsExtract(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async extract(urls: string[], format?: string): Promise<ExtractResultItem[]> {
    const results: ExtractResultItem[] = []
    for (const url of urls) {
      const item: ExtractResultItem = { url, title: '', content: '' }
      try {
        if (!this.apiKey) throw new Error('FIRECRAWL_API_KEY environment variable not set')
        const body = JSON.stringify({ url, formats: [format === 'html' ? 'html' : 'markdown'] })
        const raw = await fetchUrl(`${this.baseUrl}/v1/scrape`, { Authorization: `Bearer ${this.apiKey}` }, body)
        const parsed = JSON.parse(raw) as { success?: boolean; data?: { title?: string; markdown?: string; html?: string } }
        if (!parsed.success) throw new Error('Firecrawl scrape failed')
        item.title = parsed.data?.title ?? ''
        item.content = format === 'html' ? (parsed.data?.html ?? '') : (parsed.data?.markdown ?? '')
        if (!item.content) item.error = 'Content was inaccessible or not found'
      } catch (exc: unknown) {
        item.error = errMessage(exc)
      }
      results.push(item)
    }
    return results
  }
}

// ── Provider: tavily（API extract）──

class TavilyExtractProvider implements ExtractProvider {
  readonly id = 'tavily'
  readonly name = 'tavily'
  private readonly apiKey = process.env.TAVILY_API_KEY ?? ''
  private readonly baseUrl = process.env.TAVILY_BASE_URL ?? 'https://api.tavily.com'

  supportsExtract(): boolean { return true }
  isAvailable(): boolean { return this.apiKey.length > 0 }

  async extract(urls: string[], _format?: string): Promise<ExtractResultItem[]> {
    const results: ExtractResultItem[] = []
    for (const url of urls) {
      const item: ExtractResultItem = { url, title: '', content: '' }
      try {
        if (!this.apiKey) throw new Error('TAVILY_API_KEY environment variable not set')
        const body = JSON.stringify({ api_key: this.apiKey, urls: [url] })
        const raw = await fetchUrl(`${this.baseUrl}/extract`, {}, body)
        const parsed = JSON.parse(raw) as { results?: Array<{ url?: string; title?: string; raw_content?: string; content?: string }> }
        const r = (parsed.results ?? [])[0]
        item.title = r?.title ?? ''
        item.content = r?.raw_content ?? r?.content ?? ''
        if (!item.content) item.error = 'Content was inaccessible or not found'
      } catch (exc: unknown) {
        item.error = errMessage(exc)
      }
      results.push(item)
    }
    return results
  }
}

// ── Registry ──

const extractProviders: ExtractProvider[] = [
  new FirecrawlExtractProvider(),
  new TavilyExtractProvider(),
  new LocalCheerioProvider()
]

/** 显式配置的 backend（SHOWING_WEB_EXTRACT_BACKEND） */
export function getExtractBackend(): string | null {
  const backend = process.env.SHOWING_WEB_EXTRACT_BACKEND ?? ''
  return backend.trim().length > 0 ? backend.trim() : null
}

/** 按 id 查 provider */
export function getExtractProvider(id: string): ExtractProvider | null {
  return extractProviders.find(p => p.id === id) ?? null
}

/** availability-walk：优先有 key 的 API provider，本地 cheerio 最后兜底 */
export function getActiveExtractProvider(): ExtractProvider | null {
  const withKey = extractProviders.find(p => p.isAvailable() && p.supportsExtract() && p.id !== 'local')
  if (withKey) return withKey
  return extractProviders.find(p => p.isAvailable() && p.supportsExtract()) ?? null
}

/** 全部内置 provider 清单（供 WebProvider/工具壳展示） */
export function listBuiltinExtractProviders(): Array<{ id: string; name: string; available: boolean }> {
  return extractProviders.map(p => ({ id: p.id, name: p.name, available: p.isAvailable() }))
}
