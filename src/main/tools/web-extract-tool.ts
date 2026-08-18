/**
 * web-extract.ts — 客户端工具
 *
 * web_extract_tool：
 * - 多 URL 输入（字符串或 {url}/{href} 对象），按原顺序返回结果
 * - 安全层：URL 内嵌密钥检测（前缀正则 + URL-decode + 敏感查询参数）+ SSRF 防护
 * - registry 分发：firecrawl / tavily / exa / parallel（API，需 key）→ 本地 cheerio 兜底
 * - char_limit clamp [2000, 500000]，非法值兜底 15000；超限 head+tail 截断 + footer
 * - base64 图片 → [IMAGE: alt] 占位符；完整文本存本地 + read_file 指引
 * - 返回 {"results": [{url, title, content, error}]} JSON 字符串（indent=2）
 */
import { promises as dns } from 'dns'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { BaseTool } from './base-tool'
import { ToolResult } from '../core/tool/tool-result'
import type { PromptRenderer } from '../core/prompt/renderer'
import type { ToolContext } from '../core/loop/types'
import type { WebProvider } from '../service/web-provider'
import {  errMessage } from '../utils/http'

import type { WebExtractParams, DebugCallData } from './types'
import { getExtractBackend, getExtractProvider, getActiveExtractProvider } from '../providers/extract'
import type { ExtractResultItem } from '../providers/extract/types'

/** 工具名 */
export const TOOL_NAME = 'desktop_tinker_web_extract'

// ── 常量──

const DEFAULT_EXTRACT_CHAR_LIMIT = 15000
const MAX_STORED_TEXT_CHARS = 2_000_000

// ── URL 规范化──

function webExtractUrl(item: unknown): string | null {
  let value: unknown = item
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    value = (typeof obj.url === 'string' && obj.url) || (typeof obj.href === 'string' && obj.href)
  }
  if (typeof value !== 'string') return null
  const v = value.trim()
  return v || null
}

function normalizeUrlForRequest(url: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) return url
  return `https://${url}`
}

// ── 安全层 1：URL 内嵌密钥检测──

const SECRET_PREFIX_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/,            // OpenAI / OpenRouter / Anthropic
  /ghp_[A-Za-z0-9]{10,}/,             // GitHub PAT (classic)
  /github_pat_[A-Za-z0-9_]{10,}/,     // GitHub PAT (fine-grained)
  /gho_[A-Za-z0-9]{10,}/,             // GitHub OAuth
  /ghu_[A-Za-z0-9]{10,}/,
  /ghs_[A-Za-z0-9]{10,}/,
  /ghr_[A-Za-z0-9]{10,}/,
  /xapp-\d+-[A-Za-z0-9-]{10,}/,       // Slack
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[A-Za-z0-9_-]{30,}/,           // Google
  /pplx-[A-Za-z0-9]{10,}/,            // Perplexity
  /fal_[A-Za-z0-9_-]{10,}/,           // Fal.ai
  /fc-[A-Za-z0-9]{10,}/,              // Firecrawl
  /bb_live_[A-Za-z0-9_-]{10,}/,       // BrowserBase
  /gAAAA[A-Za-z0-9_=-]{20,}/,         // Codex encrypted tokens
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,
  /xox[a-z]-[A-Za-z0-9-]{10,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ // JWT
]

function containsSecretPrefix(s: string): boolean {
  return SECRET_PREFIX_PATTERNS.some(re => re.test(s))
}

// ── 安全层 2：敏感查询参数──

const SENSITIVE_QUERY_PARAM_NAMES = new Set([
  'access_token', 'api_key', 'apikey', 'auth', 'authorization', 'awsaccesskeyid',
  'client_secret', 'credential', 'credentials', 'jwt', 'password', 'passwd',
  'secret', 'session_id', 'signature', 'token', 'x_amz_security_token',
  'x_amz_signature', 'x-amz-security-token', 'x-amz-signature'
])

function sensitiveQueryParamName(url: string): string | null {
  if (!url.includes('?')) return null
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.search) return null
    for (const [key, value] of parsed.searchParams.entries()) {
      if (value && SENSITIVE_QUERY_PARAM_NAMES.has(decodeURIComponent(key).toLowerCase())) {
        return key
      }
    }
  } catch {
    return null
  }
  return null
}

// ── 安全层 3：SSRF 防护──

const BLOCKED_HOSTNAMES = new Set(['metadata.google.internal', 'metadata.goog'])

const ALWAYS_BLOCKED_IPS = new Set([
  '169.254.169.254', '169.254.170.2', '169.254.169.253', '100.100.100.200',
  '::ffff:169.254.169.254', '::ffff:169.254.170.2', '::ffff:169.254.169.253', '::ffff:100.100.100.200'
])

function isPrivateOrBlocked(ip: string): boolean {
  if (ALWAYS_BLOCKED_IPS.has(ip)) return true
  // IPv4 私有/保留段
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [parseInt(v4[1]), parseInt(v4[2])]
    if (a === 10) return true                          // 10.0.0.0/8
    if (a === 127) return true                         // 127.0.0.0/8
    if (a === 0) return true                           // 0.0.0.0/8
    if (a === 169 && b === 254) return true            // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true   // 172.16.0.0/12
    if (a === 192 && b === 168) return true            // 192.168.0.0/16
    if (a >= 224) return true                          // 组播/保留
  }
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true
  if (ip.toLowerCase().startsWith('fe80:')) return true   // link-local IPv6
  if (ip.toLowerCase().startsWith('fc') || ip.toLowerCase().startsWith('fd')) return true // ULA
  return false
}

async function isSafeUrl(urlStr: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  const host = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(host)) return false
  if (host === 'localhost') return false
  try {
    const ips = await dns.lookup(host, { all: true })
    return ips.every(({ address }) => !isPrivateOrBlocked(address))
  } catch {
    // DNS 解析失败：如果 hostname 本身是 IP 文本则按 IP 检查
    if (isPrivateOrBlocked(host)) return false
    return true // 解析失败不阻断（可能是临时 DNS 问题），交给请求层
  }
}

// ── base64 图片 → 占位符──

function convertBase64ImagesToLinks(text: string): string {
  let out = text.replace(
    /!\[([^\]]*)\]\(\s*data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+\)/g,
    (_m, alt: string) => (alt.trim() ? `[IMAGE: ${alt.trim()}]` : '[IMAGE]')
  )
  out = out.replace(/\(\s*data:image\/[^;]+;base64,[A-Za-z0-9+/=\s]+\)/g, '[IMAGE]')
  out = out.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[IMAGE]')
  return out
}

// ── 完整文本本地存储 + 截断 footer──

function storeFullText(url: string, content: string): string | null {
  try {
    const cacheDir = path.join(os.tmpdir(), 'tinker-web-cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    let host = 'page'
    try { host = new URL(url).hostname.replace(/:/g, '_') } catch { /* keep */ }
    const slug = host.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || 'page'
    const digest = createHash('sha256').update(url, 'utf-8').digest('hex').slice(0, 10)
    const filePath = path.join(cacheDir, `${slug}-${digest}.md`)
    let stored = content
    if (stored.length > MAX_STORED_TEXT_CHARS) {
      stored = stored.slice(0, MAX_STORED_TEXT_CHARS)
        + `\n\n[... stored copy truncated at ${MAX_STORED_TEXT_CHARS.toLocaleString()} chars of ${content.length.toLocaleString()}; re-extract a more specific URL for the rest ...]`
    }
    fs.writeFileSync(filePath, stored, 'utf-8')
    return filePath
  } catch {
    return null
  }
}

function truncateWithFooter(content: string, url: string, charLimit: number): { text: string; truncated: boolean } {
  if (content.length <= charLimit) return { text: content, truncated: false }

  const headBudget = Math.floor(charLimit * 0.75)
  const tailBudget = charLimit - headBudget

  let head = content.slice(0, headBudget)
  let tail = content.slice(-tailBudget)
  const headNl = head.lastIndexOf('\n')
  if (headNl > headBudget * 0.5) head = head.slice(0, headNl)
  const tailNl = tail.indexOf('\n')
  if (tailNl >= 0 && tailNl < tailBudget * 0.5) tail = tail.slice(tailNl + 1)

  const total = content.length
  const storedPath = storeFullText(url, content)

  const footerLines: string[] = [
    '',
    '──────── [TRUNCATED] ────────',
    `Showing ${head.length.toLocaleString()} chars (head) + ${tail.length.toLocaleString()} chars (tail) of ${total.toLocaleString()} total clean characters.`
  ]
  if (storedPath) {
    const middleStartLine = head.split('\n').length + 1
    footerLines.push(`Full text saved to: ${storedPath}`)
    footerLines.push(
      `To read the omitted middle: read_file path="${storedPath}" offset=${middleStartLine} limit=200  (the file is the complete page; raise/lower offset to page through it).`
    )
  } else {
    footerLines.push('Full text could not be stored; re-run web_extract on a more specific URL or use browser_navigate for the complete page.')
  }
  footerLines.push('─────────────────────────────')

  return {
    text: head + '\n\n[... middle omitted — see footer ...]\n\n' + tail + '\n' + footerLines.join('\n'),
    truncated: true
  }
}

// ── registry 分发（内置 provider 在 providers/extract）──

/** char_limit clamp [2000, 500000]，非法兜底 15000 */
function clampCharLimit(raw: unknown): number {
  let value: number
  try {
    value = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
  } catch {
    value = Number.NaN
  }
  if (!Number.isFinite(value)) return DEFAULT_EXTRACT_CHAR_LIMIT
  return Math.max(2000, Math.min(value, 500_000))
}

// ── 工具类 ──

export class WebExtractTool extends BaseTool {
  readonly id = 'desktop_tinker_web_extract'
  readonly name = '网页提取'
  readonly description = 'Extract content from specific web pages using available extraction backend. '
    + 'Returns clean page content (markdown/text) with NO LLM summarization. '
    + 'Pages over char_limit are head+tail truncated with an explicit footer; the full text is stored locally and the footer tells you how to read_file the omitted middle.'
  readonly category = 'network'

  constructor(renderer: PromptRenderer, private readonly webProvider?: WebProvider) {
    super(renderer, TOOL_NAME)
  }

  check(): boolean {
    const provider = getActiveExtractProvider()
    return provider !== null
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const params = (ctx.toolCall.arguments ?? {}) as unknown as WebExtractParams
    const debugCallData: DebugCallData = {
      parameters: { urls: params.urls, format: params.format, char_limit: params.char_limit },
      error: null,
      pages_extracted: 0,
      pages_truncated: 0,
      original_response_size: 0,
      final_response_size: 0,
      truncation_metrics: [],
      processing_applied: []
    }
    try {
      const items = Array.isArray(params.urls) ? params.urls : [params.urls]
      const effectiveCharLimit = clampCharLimit(params.char_limit)

      // 1. URL 规范化 + 无效项记录
      const normalizedUrls: string[] = []
      const normalizedIndices: number[] = []
      const invalidUrls: Record<number, ExtractResultItem> = {}
      for (let index = 0; index < items.length; index++) {
        const item = items[index]
        const raw = webExtractUrl(item)
        if (raw === null) {
          invalidUrls[index] = {
            url: '', title: '', content: '',
            error: `Invalid URL item at index ${index}: expected a URL string or an object with a string 'url' or 'href' field`
          }
          continue
        }
        const normalized = normalizeUrlForRequest(raw)
        // 密钥检测（原始 / URL-decode / 规范化后）——命中即整体 Blocked
        const decoded = decodeURIComponent(raw)
        if (containsSecretPrefix(raw) || containsSecretPrefix(decoded)
          || containsSecretPrefix(normalized) || containsSecretPrefix(decodeURIComponent(normalized))) {
          return ToolResult.sync(JSON.stringify({
            success: false,
            error: 'Blocked: URL contains what appears to be an API key or token. Secrets must not be sent in URLs.'
          }, null, 2))
        }
        const sensitiveKey = sensitiveQueryParamName(normalized)
        if (sensitiveKey) {
          return ToolResult.sync(JSON.stringify({
            success: false,
            error: `Blocked: URL contains a credential-like query parameter (${sensitiveKey}). Web extract backends are third-party readers; remove the sensitive query parameter or use a local browser session when this access is explicitly required.`
          }, null, 2))
        }
        normalizedUrls.push(normalized)
        normalizedIndices.push(index)
      }

      // 2. SSRF 过滤
      const safeUrls: string[] = []
      const safeIndices: number[] = []
      const ssrfBlocked: Record<number, ExtractResultItem> = {}
      for (let i = 0; i < normalizedUrls.length; i++) {
        const url = normalizedUrls[i]
        const index = normalizedIndices[i]
        if (!(await isSafeUrl(url))) {
          ssrfBlocked[index] = {
            url, title: '', content: '',
            error: 'Blocked: URL targets a private or internal network address'
          }
        } else {
          safeUrls.push(url)
          safeIndices.push(index)
        }
      }

      // 3. registry 分发提取（扩展 provider 优先，未激活/失败回退内置）
      let results: ExtractResultItem[] = []
      if (safeUrls.length > 0) {
        let providerDone = false
        if (this.webProvider) {
          try {
            const providerResults: ExtractResultItem[] = []
            for (const url of safeUrls) {
              const providerRes = await this.webProvider.callProvider<{ content?: string; title?: string; error?: string }>('web.extract', { url, limit: effectiveCharLimit })
              if (providerRes?.content) {
                providerResults.push({ url, title: providerRes.title ?? '', content: providerRes.content, error: null })
              } else {
                providerResults.push({ url, title: '', content: '', error: providerRes?.error ?? '扩展未返回内容' })
              }
            }
            if (providerResults.length > 0) { results = providerResults; providerDone = true }
          } catch (e) {
            if (!this.webProvider.allowFallback()) {
              return ToolResult.sync(JSON.stringify({ success: false, error: `抓取扩展失败: ${errMessage(e)}` }))
            }
            console.warn('[web_extract] 扩展 provider 失败，回退内置:', errMessage(e))
          }
        }
        if (!providerDone) {
          const backend = getExtractBackend()
          let provider = backend ? getExtractProvider(backend) : null
          if (!provider || !provider.supportsExtract() || !provider.isAvailable()) {
            provider = getActiveExtractProvider()
          }
          if (provider) {
            results = await provider.extract(safeUrls, params.format)
          } else {
            results = safeUrls.map(url => ({
              url, title: '', content: '',
              error: 'No web extract provider configured. Set SHOWING_WEB_EXTRACT_BACKEND or configure a provider API key.'
            }))
          }
        }
      }

      // 4. 顺序重建（invalid / ssrf_blocked / safe 按原 index）
      if (Object.keys(invalidUrls).length > 0 || Object.keys(ssrfBlocked).length > 0) {
        const safeResults: Record<number, ExtractResultItem> = {}
        safeIndices.forEach((index, position) => {
          safeResults[index] = results[position] ?? {
            url: safeUrls[position], title: '', content: '',
            error: 'Extract backend returned no result for this URL'
          }
        })
        const byIndex: Record<number, ExtractResultItem> = { ...safeResults, ...ssrfBlocked, ...invalidUrls }
        results = items.map((_it, index) => byIndex[index] ?? {
          url: '', title: '', content: '', error: 'Extract backend returned no result for this URL'
        })
      }

      const response: { results: ExtractResultItem[] } = { results }
      debugCallData['pages_extracted'] = response.results.length
      debugCallData['original_response_size'] = JSON.stringify(response).length
      debugCallData['processing_applied'].push('truncate_and_store')

      // 5. 截断 + base64 图片转换
      for (const result of response.results) {
        if (result.error) continue
        const rawContent = result.content || ''
        if (!rawContent) continue
        const clean = convertBase64ImagesToLinks(rawContent)
        const { text, truncated } = truncateWithFooter(clean, result.url, effectiveCharLimit)
        result.content = text
        if (truncated) {
          debugCallData.pages_truncated += 1
          debugCallData.truncation_metrics.push({
            url: result.url,
            original_size: clean.length,
            sent_size: text.length
          })
        }
      }

      // 6. trim 输出：只留 url/title/content/error
      const trimmedResponse = {
        results: response.results.map(r => ({
          url: r.url,
          title: r.title,
          content: r.content,
          error: r.error ?? null
        }))
      }

      let resultJson: string
      if (trimmedResponse.results.length === 0 || trimmedResponse.results.every(r => r.error)) {
        resultJson = JSON.stringify({ success: false, error: 'Content was inaccessible or not found' }, null, 2)
      } else {
        resultJson = JSON.stringify(trimmedResponse, null, 2)
      }
      const cleanedResult = convertBase64ImagesToLinks(resultJson)
      debugCallData['final_response_size'] = cleanedResult.length
      debugCallData['processing_applied'].push('base64_image_conversion')
      console.log('[web_extract] call:', JSON.stringify(debugCallData))

      return ToolResult.sync(cleanedResult)
    } catch (exc: unknown) {
      const errorMsg = `Error extracting content: ${errMessage(exc)}`
      debugCallData['error'] = errorMsg
      console.log('[web_extract] call:', JSON.stringify(debugCallData))
      return ToolResult.sync(JSON.stringify({ success: false, error: errorMsg }))
    }
  }
}

