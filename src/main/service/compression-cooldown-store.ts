/**
 * compression-cooldown-store.ts — 压缩冷却 + 无效/fallback 检测存储
 *
 * 复刻 showing-agent CompressionCooldownStore（Redis → 本地内存）：
 * - 冷却（cooldown）：LLM 调用失败后暂停重试，TTL 自动过期（阶梯 60/300/900s）
 * - 无效压缩检测（ineffective）：连续多次无可压缩内容时停止触发
 * - fallback 连续抑制（fallback）：连续多次用静态占位符时停止主动压缩
 */

/** 冷却阶梯（秒）：首次 / 第 2 次 / 第 3 次及以上 */
const COOLDOWN_LADDER_BASE = 60
const COOLDOWN_LADDER_MEDIUM = 300
const COOLDOWN_LADDER_LONG = 900

/** 连续 >= 2 次无效压缩后阻止自动压缩 */
const INEFFECTIVE_BLOCK_THRESHOLD = 2

/** 连续 >= 2 次 fallback 后阻止自动压缩 */
const FALLBACK_BLOCK_THRESHOLD = 2

/** 冷却条目：失败计数 + 过期时间戳 */
interface CooldownEntry {
  failCount: number
  expiresAt: number
}

/** 压缩冷却存储（本地内存版） */
export class CompressionCooldownStore {
  /** 冷却表：sessionId → {failCount, expiresAt} */
  private readonly cooldowns = new Map<string, CooldownEntry>()
  /** 无效压缩计数：sessionId → count */
  private readonly ineffective = new Map<string, number>()
  /** fallback 计数：sessionId → count */
  private readonly fallback = new Map<string, number>()

  // ── 冷却 ──

  /** 检查 session 是否在冷却中 */
  isBlocked(sessionId: string): boolean {
    const entry = this.cooldowns.get(sessionId)
    if (!entry) {
      return false
    }
    if (entry.expiresAt <= Date.now()) {
      this.cooldowns.delete(sessionId)
      return false
    }
    return true
  }

  /** 记录一次压缩失败，累加连续失败次数并设置冷却 TTL */
  recordFailure(sessionId: string): void {
    const current = this.cooldowns.get(sessionId)?.failCount ?? 0
    const failCount = current + 1
    const ttl = cooldownFor(failCount)
    this.cooldowns.set(sessionId, {failCount, expiresAt: Date.now() + ttl * 1000})
  }

  /** 压缩成功后清除冷却 */
  clearCooldown(sessionId: string): void {
    this.cooldowns.delete(sessionId)
  }

  // ── 无效压缩检测 ──

  /** 检查 session 的无效压缩计数是否已达阈值 */
  isIneffectiveBlocked(sessionId: string): boolean {
    return (this.ineffective.get(sessionId) ?? 0) >= INEFFECTIVE_BLOCK_THRESHOLD
  }

  /** 递增无效压缩计数（DB 查到无可压缩对话时调用） */
  incrementIneffective(sessionId: string): void {
    this.ineffective.set(sessionId, (this.ineffective.get(sessionId) ?? 0) + 1)
  }

  /** 压缩成功时清除无效压缩计数 */
  clearIneffective(sessionId: string): void {
    this.ineffective.delete(sessionId)
  }

  // ── Fallback 连续抑制 ──

  /** 检查 session 的 fallback 计数是否已达阈值 */
  isFallbackBlocked(sessionId: string): boolean {
    return (this.fallback.get(sessionId) ?? 0) >= FALLBACK_BLOCK_THRESHOLD
  }

  /** 递增 fallback 计数（LLM 摘要失败，使用静态占位符时调用） */
  incrementFallback(sessionId: string): void {
    this.fallback.set(sessionId, (this.fallback.get(sessionId) ?? 0) + 1)
  }

  /** LLM 摘要成功时清除 fallback 计数 */
  clearFallback(sessionId: string): void {
    this.fallback.delete(sessionId)
  }

  /** 清理会话全部状态（clearAll 时调用） */
  clearAll(sessionId: string): void {
    this.cooldowns.delete(sessionId)
    this.ineffective.delete(sessionId)
    this.fallback.delete(sessionId)
  }
}

/** 冷却阶梯 */
function cooldownFor(failCount: number): number {
  if (failCount >= 3) return COOLDOWN_LADDER_LONG
  if (failCount >= 2) return COOLDOWN_LADDER_MEDIUM
  return COOLDOWN_LADDER_BASE
}
