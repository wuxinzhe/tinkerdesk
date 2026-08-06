/**
 * sandbox-whitelist-service.ts — 沙箱白名单服务层
 *
 * 复刻 tinker-agent ISandboxWhitelistService + SandboxService.check（本地单用户版，去 userId）：
 * URL 白名单 + 路径白名单的列表/添加/删除 + 门检（check）。
 */
import type { UserPathWhitelistEntity, UserUrlWhitelistEntity } from '../repository/types'
import { UserPathWhitelistRepository } from '../repository/user-path-whitelist-repository'
import { UserUrlWhitelistRepository } from '../repository/user-url-whitelist-repository'
import { SandboxDecision } from './types'
export { SandboxDecision } from './types'

/** URL 匹配正则（粗匹配 http/https 开头） */
const URL_REGEX = /^https?:\/\/[^\s]+/i

/** 沙箱白名单服务 */
export class SandboxWhitelistService {
  constructor(
    private readonly urlRepo: UserUrlWhitelistRepository,
    private readonly pathRepo: UserPathWhitelistRepository
  ) { }

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

  // ── 沙盒门检（对齐 SandboxService.check） ──

  /**
   * 检查工具调用的目标（URL/路径）是否被白名单允许。
   * 从工具参数提取目标，分别与白名单前缀匹配；任意目标不在白名单 → ASK。
   */
  check(profile: string, toolName: string, args: Record<string, unknown>): SandboxDecision {
    const urls = this.extractUrls(args)
    const paths = this.extractPaths(args)

    if (urls.length > 0) {
      const whitelist = this.listUrlWhitelist(profile).map((e) => e.urlPattern)
      for (const url of urls) {
        if (!this.isWhitelisted(url, whitelist)) {
          return SandboxDecision.ASK
        }
      }
    }

    if (paths.length > 0) {
      const whitelist = this.listPathWhitelist(profile).map((e) => e.pathPattern)
      for (const p of paths) {
        if (!this.isWhitelisted(p, whitelist)) {
          return SandboxDecision.ASK
        }
      }
    }

    return SandboxDecision.ALLOW
  }

  /** 前缀匹配：目标以白名单中任意模式开头即匹配 */
  private isWhitelisted(target: string, patterns: string[]): boolean {
    for (const p of patterns) {
      if (p && target.startsWith(p)) return true
    }
    return false
  }

  /** 从工具参数提取所有目标 URL（url/urls/query 字段 + 递归扫描文本值） */
  private extractUrls(args: Record<string, unknown>): string[] {
    const result: string[] = []
    if (!args || Object.keys(args).length === 0) return result

    const pushIfUrl = (v: unknown): void => {
      if (typeof v === 'string' && URL_REGEX.test(v.trim())) {
        result.push(v.trim())
      }
    }

    pushIfUrl(args.url)
    if (Array.isArray(args.urls)) {
      for (const u of args.urls) pushIfUrl(u)
    }
    pushIfUrl(args.query)

    // 递归扫描对象/数组中的文本值
    const scan = (node: unknown): void => {
      if (node === null || node === undefined) return
      if (Array.isArray(node)) {
        for (const item of node) {
          if (typeof item === 'string') pushIfUrl(item)
          else if (typeof item === 'object') scan(item)
        }
      } else if (typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) {
          if (typeof value === 'string') pushIfUrl(value)
          else if (typeof value === 'object') scan(value)
        }
      }
    }
    scan(args)
    return result
  }

  /** 从工具参数提取所有目标路径（path/paths 字段） */
  private extractPaths(args: Record<string, unknown>): string[] {
    const result: string[] = []
    if (!args || Object.keys(args).length === 0) return result

    if (typeof args.path === 'string') {
      result.push(args.path)
    }
    if (Array.isArray(args.paths)) {
      for (const p of args.paths) {
        if (typeof p === 'string') result.push(p)
      }
    }
    return result
  }
}
