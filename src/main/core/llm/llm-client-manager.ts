import type { LlmClient, ModelConfig } from './types'

/**
 * llm-client-manager.ts — LLM client manager
 *
 * LlmClientManager: unified registration/query entry.
 * Registers clients indexed by apiMode; the orchestration layer routes
 * via getClient() by ApiMode to the matching client implementation.
 */

export class LlmClientManager {
  /** 客户端缓存：apiMode → LlmClient 实例 */
  private readonly clientCache = new Map<'openai' | 'anthropic' | 'google', LlmClient>()

  /** 注册客户端列表（每个 apiMode 只能有一个实现） */
  constructor(clients: LlmClient[]) {
    for (const client of clients) {
      const mode = client.apiMode
      if (this.clientCache.has(mode)) {
        throw new Error(`LlmClient apiMode 重复: ${mode}`)
      }
      this.clientCache.set(mode, client)
    }
  }

  /** 按 ModelConfig.apiMode 返回对应客户端 */
  getClient(config: ModelConfig): LlmClient {
    const client = this.clientCache.get(config.apiMode)
    if (!client) {
      throw new Error(`未找到 apiMode=${config.apiMode} 对应的 LLM 客户端实现`)
    }
    return client
  }
}
