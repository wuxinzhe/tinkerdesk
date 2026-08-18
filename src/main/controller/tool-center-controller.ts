/**
 * tool-center-controller.ts — 工具中心 IPC controller（class 形式）
 *
 * Tool Center admin interface (local):
 * 工具市场查询（npm 搜索 tinkerdesk-tool-*）+ 已装工具清单 + 工具安装。
 * Layering: controller → service (tool-market-service) + ToolCenter（生命周期）。
 * IPC prefix: tool:*
 */

import { handleTrusted } from '../security/ipc-guard'
import type { ToolCenter } from '../core/tool/tool-center'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import { getMarketToolDetail, listMarketTools, type MarketToolListResult } from '../service/tool-market-service'

/** 工具中心控制器 */
export class ToolCenterController {
  constructor(private readonly toolCenter: ToolCenter) {}

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('tool:market-list', (_event, payload?: { search?: string }) => this.marketList(payload))
    handleTrusted('tool:market-detail', (_event, payload: { name: string }) => this.marketDetail(payload))
    handleTrusted('tool:list', () => this.list())
    handleTrusted('tool:install', (_event, payload: { pkg: string; registry?: string }) => this.install(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 工具市场列表（installed 状态对比本地已装清单） */
  private async marketList(payload?: { search?: string }): Promise<ApiResponse<MarketToolListResult>> {
    const installedIds = this.toolCenter.list().map((i) => i.id)
    try {
      return ok(await listMarketTools({ installedIds, search: payload?.search }))
    } catch (e) {
      return ok({ items: [], categories: [] })
    }
  }

  /** 工具市场细节（详情页展示） */
  private async marketDetail(payload: { name: string }): Promise<ApiResponse<unknown>> {
    const installedIds = this.toolCenter.list().map((i) => i.id)
    try {
      return ok(await getMarketToolDetail(payload?.name ?? '', installedIds))
    } catch {
      return ok(undefined)
    }
  }

  /** 已装工具清单（含可用性检查结果） */
  private list(): ApiResponse<unknown> {
    return ok(this.toolCenter.list())
  }

  /** 安装工具包（走 ToolCenter 委托安装器分步——npm 下载 → toolsDir → 注册） */
  private async install(payload: { pkg: string; registry?: string }): Promise<ApiResponse<{ id: string }>> {
    try {
      if (!payload?.pkg) return fail('缺少包名')
      const result = await this.toolCenter.installFromNpm(payload.pkg, payload.registry ? { registry: payload.registry } : undefined)
      return ok(result)
    } catch (e) {
      return fail((e as Error).message)
    }
  }
}
