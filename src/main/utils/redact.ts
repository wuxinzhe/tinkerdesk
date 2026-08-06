/**
 * redact.ts — 敏感信息脱敏工具
 *
 * 一比一复刻 Hermes agent/redact.py redact_sensitive_text(file_read=True)：
 * - 20+ 已知前缀（对齐 _PREFIX_PATTERNS）+ 边界断言（(?<![A-Za-z0-9_-])…(?![A-Za-z0-9_-])）
 * - PRIVATE KEY 块 / Authorization 头 / JSON 敏感字段 / JWT / DB connstring
 */

const PREFIX_PATTERNS = [
  'sk-[A-Za-z0-9_-]{10,}',           // OpenAI / OpenRouter / Anthropic (sk-ant-*)
  'ghp_[A-Za-z0-9]{10,}',            // GitHub PAT (classic)
  'github_pat_[A-Za-z0-9_]{10,}',    // GitHub PAT (fine-grained)
  'gho_[A-Za-z0-9]{10,}',            // GitHub OAuth access token
  'ghu_[A-Za-z0-9]{10,}',            // GitHub user-to-server token
  'ghs_[A-Za-z0-9]{10,}',            // GitHub server-to-server token
  'ghr_[A-Za-z0-9]{10,}',            // GitHub refresh token
  'xapp-\\d+-[A-Za-z0-9-]{10,}',     // Slack app-level token
  'xox[baprs]-[A-Za-z0-9-]{10,}',    // Slack bot/app/user tokens
  'AIza[A-Za-z0-9_-]{30,}',          // Google API keys
  'pplx-[A-Za-z0-9]{10,}',           // Perplexity
  'fal_[A-Za-z0-9_-]{10,}',          // Fal.ai
  'fc-[A-Za-z0-9]{10,}',             // Firecrawl
  'bb_live_[A-Za-z0-9_-]{10,}',      // BrowserBase
  'gAAAA[A-Za-z0-9_=-]{20,}',        // Codex encrypted tokens
  'AKIA[A-Z0-9]{16}',                // AWS Access Key ID
  'sk_live_[A-Za-z0-9]{10,}',        // Stripe secret key (live)
  'sk_test_[A-Za-z0-9]{10,}',        // Stripe secret key (test)
  'rk_live_[A-Za-z0-9]{10,}',        // Stripe restricted key
  'SG\\.[A-Za-z0-9_-]{10,}',         // SendGrid API key
  'hf_[A-Za-z0-9]{10,}',             // HuggingFace token
  'r8_[A-Za-z0-9]{10,}',             // Replicate API token
  'npm_[A-Za-z0-9]{10,}',            // npm access token
  'pypi-[A-Za-z0-9_-]{10,}',         // PyPI API token
  'dop_v1_[A-Za-z0-9]{10,}'          // DigitalOcean PAT
]

const KNOWN_PREFIX_RE = new RegExp('(?<![A-Za-z0-9_-])(' + PREFIX_PATTERNS.join('|') + ')(?![A-Za-z0-9_-])', 'g')

const PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g

const AUTH_HEADER_RE = /([Pp]roxy-[Aa]uthorization|[Aa]uthorization):\s*(?:[A-Za-z0-9._\-]+)\s+([^\s,;]+)/g

const JSON_FIELD_RE = /"([^"]*(?:api[_-]?key|token|secret|password|passwd|client[_-]?secret)[^"]*)":\s*"([^"]+)"/gi

const JWT_RE = /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g

const DB_CONNSTR_RE = /(\w+:\/\/[^:\s/]+:)([^@\s/]+)(@)/g

/** file_read 语义：non-reusable sentinel（对齐 Hermes «redacted:ghp_…»） */
function maskToken(value: string): string {
  if (value.length <= 8) return '«redacted:' + value + '»'
  return '«redacted:' + value.slice(0, 8) + '…»'
}

export function redactSensitiveText(text: string): string {
  if (!text) return text
  text = text.replace(KNOWN_PREFIX_RE, (m) => maskToken(m))
  text = text.replace(PRIVATE_KEY_RE, '[REDACTED PRIVATE KEY]')
  text = text.replace(AUTH_HEADER_RE, (_m, p1, p2) => `${p1}: ${maskToken(p2)}`)
  text = text.replace(JSON_FIELD_RE, (_m, key, value) => `"${key}": "${maskToken(value)}"`)
  text = text.replace(JWT_RE, (m) => maskToken(m))
  text = text.replace(DB_CONNSTR_RE, (_m, pre, _pw, at) => `${pre}«redacted»${at}`)
  return text
}
