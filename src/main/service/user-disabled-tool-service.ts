/**
 * user-disabled-tool-service.ts — 用户禁用工具服务层
 *
 * UserDisabledToolRepository 对应服务（本地单用户版，去 userId）：
 * 禁用工具黑名单的查询/添加/移除。
 */
import { UserDisabledToolRepository } from '../repository/user-disabled-tool-repository'

/** 禁用工具服务 */
export class UserDisabledToolService {
  constructor(private readonly disabledRepo: UserDisabledToolRepository) { }

  /** 查询 profile 下禁用的工具名集合 */
  listDisabled(profile: string): string[] {
    return this.disabledRepo.findByProfile(profile)
  }

  /** 工具是否被禁用 */
  isDisabled(profile: string, toolName: string): boolean {
    return this.disabledRepo.findByProfile(profile).includes(toolName)
  }

  /** 禁用工具（已禁用则忽略） */
  disable(profile: string, toolName: string): boolean {
    return this.disabledRepo.insert(profile, toolName) > 0
  }

  /** 解除禁用 */
  enable(profile: string, toolName: string): boolean {
    return this.disabledRepo.delete(profile, toolName) > 0
  }

  /** 全量加载（应用启动注入 ToolManager） */
  listAll(): Record<string, string[]> {
    return this.disabledRepo.listAll()
  }

  /** 整体替换某 profile 的禁用列表（ToolManager 持久化回调用） */
  replaceProfile(profile: string, toolNames: string[]): void {
    this.disabledRepo.replaceProfile(profile, toolNames)
  }
}
