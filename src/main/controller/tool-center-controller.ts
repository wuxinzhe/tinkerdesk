/**
 * tool-center-controller.ts — 工具中心 IPC controller（class 形式）
 *
 * Tool Center admin interface (local):
 * 工具市场查询（npm 搜索 tinkerdesk-tool-*）+ 已装工具清单。
 * 安装接口后续接入（ToolCenter.installFromNpm 已有——IPC 暴露留待安装 UX）。
 * Layering: controller → service (tool-market-service) + ToolCenter（已装清单）。
 * IPC prefix: tool:*
 */

import { handleTrusted } from '../security/ipc-guard'
import type { ToolCenter } from '../core/tool/tool-center'
import type { ApiResponse } from './api-response'
import { ok } from './api-response'
import { getMarketToolDetail, listMarketTools, type MarketToolListResult } from '../service/tool-market-service'

/** 工具中心控制器 */
export class ToolCenterController {
  constructor(private readonly toolCenter: ToolCenter) {}

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    handleTrusted('tool:market-list', (_event, payload?: { search?: string }) => this.marketList(payload))
    handleTrusted('tool:market-detail', (_event, payload: { name: string }) => this.marketDetail(payload))
    handleTrusted('tool:list', () => this.list())
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
}