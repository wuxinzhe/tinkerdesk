/**
 * session-controller.ts — 会话 IPC controller（class 形式）
 *
 * 复刻 tinker-agent SessionController（本地单用户版，去 userId）：
 * 会话列表 / 创建 / 重命名 / YOLO 查询与切换。
 * 分层：controller → service（SessionService），不直接访问 repository。
 * IPC 前缀：session:*
 *
 * 结构：register() 只做 ipcMain.handle 绑定，逻辑在独立具名方法（入参出参完整类型）。
 */
import { ipcMain } from 'electron'
import type { SessionService } from '../service/session-service'
import type { SessionEntity } from '../repository/types'
import type { ApiResponse } from './api-response'
import { ok, fail } from './api-response'
import type { SessionListItemVO, CreateSessionRequestDTO, UpdateSessionRequestDTO, ListSessionsQueryDTO } from './types'

/** 单次查询最大条数限制 */
const MAX_LIMIT = 200

/** SessionEntity → SessionListItemVO */
export function toSessionListItemVO(e: SessionEntity): SessionListItemVO {
  const ts = e.startedAt ? new Date(e.startedAt).getTime() : 0
  return {
    id: e.id,
    title: e.title || '新对话',
    createdAt: ts,
    updatedAt: ts,
    profile: e.profile || 'default',
    status: 'idle',
    yolo: e.yolo,
  }
}

/** 会话 controller */
export class SessionController {
  constructor(private readonly sessionService: SessionService) { }

  /** 注册全部 IPC handler（只做绑定，逻辑在独立具名方法） */
  register(): void {
    ipcMain.handle('session:list', (_event, payload) => this.listSessions(payload))
    ipcMain.handle('session:create', (_event, payload) => this.createSession(payload))
    ipcMain.handle('session:update', (_event, payload) => this.renameSession(payload))
    ipcMain.handle('session:getYolo', (_event, payload) => this.getYolo(payload))
    ipcMain.handle('session:toggleYolo', (_event, payload) => this.toggleYolo(payload))
  }

  // ══════════════════════════════════════════════════════════════
  // 各 IPC 方法（具名方法 + 完整入参出参类型）
  // ══════════════════════════════════════════════════════════════

  /** 查询会话列表（按 profile 限定 + 分页） */
  private listSessions(payload: ListSessionsQueryDTO): ApiResponse<SessionListItemVO[]> {
    const profile = payload?.profile ?? 'default'
    const limit = Math.min(payload?.limit ?? 50, MAX_LIMIT)
    const offset = payload?.offset ?? 0
    const entities = this.sessionService.listSessions(profile, limit, offset)
    return ok(entities.map(toSessionListItemVO))
  }

  /** 创建会话 */
  private createSession(payload: CreateSessionRequestDTO): ApiResponse<SessionListItemVO> {
    const profile = payload?.profile ?? 'default'
    const title = payload?.title ?? ''
    const entity = this.sessionService.create(profile, title)
    return ok(toSessionListItemVO(entity))
  }

  /** 重命名会话标题（profile 限定） */
  private renameSession(payload: UpdateSessionRequestDTO): ApiResponse<null> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    this.sessionService.updateTitle(payload.sessionId, payload.title, payload.profile)
    return ok(null)
  }

  /** 查询会话 YOLO 状态（profile 限定） */
  private getYolo(payload: { profile: string; sessionId: string }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    return ok(session.yolo)
  }

  /** 切换会话 YOLO 模式（profile 限定） */
  private toggleYolo(payload: { profile: string; sessionId: string }): ApiResponse<boolean> {
    const session = this.sessionService.findById(payload.sessionId, payload.profile)
    if (!session) {
      return fail('会话不存在')
    }
    const newYolo = this.sessionService.toggleYolo(payload.sessionId, session.profile)
    return ok(newYolo)
  }
}
