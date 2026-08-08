/**
 * model-api-client.ts — 供应商模型列表拉取客户端
 *
 * 复刻 tinker-agent OpenAiModelApiClient：
 * 调用 GET {baseUrl}/models，适用于 OpenAI、DeepSeek、OpenRouter 等
 * 所有兼容 OpenAI API 的供应商。
 */
import type { ModelInfoDTO } from './types'

/** 模型 API 异常 */
export class ModelApiException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelApiException'
  }
}

/**
 * 从 OpenAI 兼容供应商 API 获取可用模型列表。
 * @param baseUrl 供应商 API base URL
 * @param apiKey  API Key
 * @returns 可用模型信息 DTO 列表
 */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<ModelInfoDTO[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, '') + '/models'
  let response: Response
  try {
    response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    if (e instanceof TypeError) {
      throw new ModelApiException(`Endpoint 不可达: ${cleanUrl}`)
    }
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new ModelApiException('连接超时')
    }
    throw new ModelApiException(`获取模型列表失败: ${(e as Error).message}`)
  }

  if (response.status !== 200) {
    const body = await response.text()
    const msg = body.length > 200 ? body.substring(0, 200) : body
    throw new ModelApiException(`获取模型列表失败 [${response.status}]: ${msg}`)
  }

  return parseModels(await response.text())
}

/**
 * 解析 OpenAI 格式的模型列表 JSON 响应。
 * 从 JSON 的 data 数组中提取 object=model 的条目。
 */
function parseModels(json: string): ModelInfoDTO[] {
  let parsed: { data?: Array<{ id?: unknown; object?: unknown; owned_by?: unknown }> }
  try {
    parsed = JSON.parse(json) as { data?: Array<{ id?: unknown; object?: unknown; owned_by?: unknown }> }
  } catch {
    throw new ModelApiException('响应 JSON 解析失败')
  }
  if (!Array.isArray(parsed.data)) {
    throw new ModelApiException('响应缺少 data 数组')
  }
  return parsed.data
    .filter((m) => typeof m.id === 'string')
    .map((m) => ({
      id: m.id as string,
      object: typeof m.object === 'string' ? (m.object as string) : 'model',
      ownedBy: typeof m.owned_by === 'string' ? (m.owned_by as string) : '',
    }))
}
