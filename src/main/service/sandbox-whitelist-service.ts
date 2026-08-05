/**
 * sandbox-whitelist-service.ts — 沙箱白名单服务层
 *
 * 复刻 showing-agent ISandboxWhitelistService（本地单用户版，去 userId）：
 * URL 白名单 + 路径白名单的列表/添加/删除。
 */
import {UserUrlWhitelistRepository} from '../repository/user-url-whitelist-repository'
import {UserPathWhitelistRepository} from '../repository/user-path-whitelist-repository'
import type {UserUrlWhitelistEntity, UserPathWhitelistEntity} from '../repository/types'

/** 沙箱白名单服务 */
export class SandboxWhitelistService {
  constructor(
    private readonly urlRepo: UserUrlWhitelistRepository,
    private readonly pathRepo: UserPathWhitelistRepository
  ) {}

  // ── URL 白名单 ──

  /** 查询 profile 下启用的 URL 白名单 */
  listUrlWhitelist(profile: string): UserUrlWhitelistEntity[] {
    return this.urlRepo.findByProfile(profile)
  }

  /** 添加 URL 白名单 */
  addUrlWhitelist(entity: UserUrlWhitelistEntity): number {
    return this.urlRepo.insert(entity)
  }

  /** 删除 URL 白名单 */
  deleteUrlWhitelist(id: number, profile: string): boolean {
    return this.urlRepo.deleteById(id, profile) > 0
  }

  // ── 路径白名单 ──

  /** 查询 profile 下启用的路径白名单 */
  listPathWhitelist(profile: string): UserPathWhitelistEntity[] {
    return this.pathRepo.findByProfile(profile)
  }

  /** 添加路径白名单 */
  addPathWhitelist(entity: UserPathWhitelistEntity): number {
    return this.pathRepo.insert(entity)
  }

  /** 删除路径白名单 */
  deletePathWhitelist(id: number, profile: string): boolean {
    return this.pathRepo.deleteById(id, profile) > 0
  }
}
