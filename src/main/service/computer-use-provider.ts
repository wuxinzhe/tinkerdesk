/**
 * computer-use-provider.ts — computer_use 工具的外部能力门面（provider + 插件化）
 *
 * computer_use depends on external cua-driver (independently installed —
 * PATH or the official install location).
 * Registered as a built-in plugin (builtin-cua-driver) — unified with the
 * tts/stt provider architecture:
 *   - 工具可用性 = provider 是否配置（插件声明 tool.computer_use 接口）
 *   - 插件自身可用性（cua-driver 是否安装）是插件系统自检的事——
 *     未安装/异常时执行抛错提示（CuaDriverUnavailableError），不拦工具注册
 */
import type { PluginManager } from '../core/plugin/plugin-manager'
import { CuaDriverClient } from '../tools/computer-use/cua-driver-client'

/** 系统开放接口：computer_use 工具的外部驱动（对齐 tool.tts / tool.stt） */
export const COMPUTER_USE_INTERFACE = 'tool.computer_use'
/** 内置 cua-driver 插件 id */
export const BUILTIN_CUA_DRIVER_PLUGIN = 'builtin-cua-driver'

/** computer_use 外部能力门面 */
export class ComputerUseProvider {
  constructor(private readonly pluginManager: PluginManager) {}

  /** 是否已配置 provider（有插件声明了 tool.computer_use 接口——内置插件注册即满足） */
  hasConfiguredProvider(): boolean {
    return this.pluginManager.getProviders(COMPUTER_USE_INTERFACE).length > 0
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
