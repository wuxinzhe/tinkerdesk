/**
 * computer-use-provider.ts — computer_use 工具的外部能力门面（provider + 扩展化）
 *
 * computer_use depends on external cua-driver (independently installed —
 * PATH or the official install location).
 * Registered as a built-in provider (builtin-cua-driver) — unified with the
 * tts/stt provider architecture:
 *   - 工具可用性 = provider 是否配置（扩展声明 tool.computer_use 接口）
 *   - 扩展自身可用性（cua-driver 是否安装）是扩展系统自检的事——
 *     未安装/异常时执行抛错提示（CuaDriverUnavailableError），不拦工具注册
 */
import type { ProviderManager } from '../core/provider/provider-manager'
import { CuaDriverClient } from '../tools/computer-use/cua-driver-client'

/** 系统开放接口：computer_use 工具的外部驱动（对齐 tool.tts / tool.stt） */
export const COMPUTER_USE_INTERFACE = 'tool.computer_use'
/** 内置 cua-driver 扩展 id */
export const BUILTIN_CUA_DRIVER_PLUGIN = 'builtin-cua-driver'

/** computer_use 外部能力门面 */
export class ComputerUseProvider {
  constructor(private readonly providerManager: ProviderManager) {}

  /** 是否已配置 provider（有扩展声明了 tool.computer_use 接口——内置扩展注册即满足） */
  hasConfiguredProvider(): boolean {
    return this.providerManager.getProviders(COMPUTER_USE_INTERFACE).length > 0
  }

  /** 按会话获取/创建 cua-driver 客户端（会话级隔离——per-session backend） */
  private readonly clients = new Map<string, CuaDriverClient>()

  getClient(sessionId: string): CuaDriverClient {
    let client = this.clients.get(sessionId)
    if (!client) {
      client = new CuaDriverClient()
      this.clients.set(sessionId, client)
    }
    return client
  }

  /** 会话结束时释放（由 TinkerAgent dispose 链调用） */
  dispose(sessionId: string): void {
    const client = this.clients.get(sessionId)
    if (client) {
      void client.endSession()
      client.stop()
      this.clients.delete(sessionId)
    }
  }
}
