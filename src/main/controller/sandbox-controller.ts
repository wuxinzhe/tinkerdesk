/**
 * sandbox-controller.ts — 沙盒白名单 IPC controller（class 形式）
 *
 * 复刻 tinker-agent SandboxController（本地单用户版，去 userId）：
 * URL 白名单 + 路径白名单 CRUD。
 * 分层：controller → service（SandboxWhitelistService）。
 * IPC 前缀：sandbox:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */

import { handleTrusted } from '../security/ipc-guard'
import type { SandboxWhitelistService } from '../service/sandbox-whitelist-service'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { UrlWhitelistRequestDTO, PathWhitelistRequestDTO, WhitelistIdRequestDTO } from './types'

/** 沙盒 controller */
export class SandboxController {
  constructor(private readonly whitelistService: SandboxWhitelistService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    // ── URL 白名单 ──
    handleTrusted('sandbox:listUrl', (_event, profile) => this.listUrlWhitelist(profile))
    handleTrusted('sandbox:addUrl', (_event, payload) => this.addUrlWhitelist(payload))
    handleTrusted('sandbox:deleteUrl', (_event, payload) => this.deleteUrlWhitelist(payload))
    // ── 路径白名单 ──
    handleTrusted('sandbox:listPath', (_event, profile) => this.listPathWhitelist(profile))
    handleTrusted('sandbox:addPath', (_event, payload) => this.addPathWhitelist(payload))
    handleTrusted('sandbox:deletePath', (_event, payload) => this.deletePathWhitelist(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询 URL 白名单（按 profile 限定） */
  private listUrlWhitelist(profile?: string): ApiResponse<unknown> {
    return ok(this.whitelistService.listUrlWhitelist(profile ?? 'default'))
  }

  /** 添加 URL 白名单条目 */
  private addUrlWhitelist(payload: UrlWhitelistRequestDTO): ApiResponse<{ id: number; profile: string; urlPattern: string }> {
    const profile = payload?.profile ?? 'default'
    if (!payload?.urlPattern) {
      return fail('urlPattern 不能为空')
    }
    const id = this.whitelistService.addUrlWhitelist({
      profile,
      urlPattern: payload.urlPattern,
      description: payload.description ?? '',
      enabled: true,
    })
    return ok({ id, profile, urlPattern: payload.urlPattern })
  }

  /** 删除 URL 白名单条目 */
  private deleteUrlWhitelist(payload: WhitelistIdRequestDTO): ApiResponse<null> {
    const deleted = this.whitelistService.deleteUrlWhitelist(payload.id, payload?.profile ?? 'default')
    return deleted ? ok(null) : fail('白名单条目不存在')
  }

  /** 查询路径白名单（按 profile 限定） */
  private listPathWhitelist(profile?: string): ApiResponse<unknown> {
    return ok(this.whitelistService.listPathWhitelist(profile ?? 'default'))
  }

  /** 添加路径白名单条目 */
  private addPathWhitelist(payload: PathWhitelistRequestDTO): ApiResponse<{ id: number; profile: string; pathPattern: string }> {
    const profile = payload?.profile ?? 'default'
    if (!payload?.pathPattern) {
      return fail('pathPattern 不能为空')
    }
    const id = this.whitelistService.addPathWhitelist({
      profile,
      pathPattern: payload.pathPattern,
      description: payload.description ?? '',
      enabled: true,
    })
    return ok({ id, profile, pathPattern: payload.pathPattern })
  }

  /** 删除路径白名单条目 */
  private deletePathWhitelist(payload: WhitelistIdRequestDTO): ApiResponse<null> {
    const deleted = this.whitelistService.deletePathWhitelist(payload.id, payload?.profile ?? 'default')
    return deleted ? ok(null) : fail('白名单条目不存在')
  }
}
