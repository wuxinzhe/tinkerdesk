/**
 * tool-loop-guardrail-service.ts — 工具循环防护服务
 *
 * ToolLoopGuardrail:
 * - exact_failure: same tool + same args failing consecutively → warn/block
 * - same_tool_failure：同工具连续失败（不同参数）→ warn/halt
 * - no_progress：幂等工具返回相同结果 → warn/block
 * 全部阈值由 AgentConfig 驱动（per-agent），默认值
 *
 * 与 ToolAuthService / SandboxWhitelistService 同属工具门检服务簇，
 * 由 TinkerAgent 在工具执行前后调用（beforeCall / afterCall）。
 */
import { createHash } from 'crypto'
import type { AgentConfig } from '../core/loop/types'
import { GuardrailAction } from './types'
import type { GuardrailDecision } from './types'
export { GuardrailAction } from './types'
export type { GuardrailDecision } from './types'

/** 只读/幂等工具：检测"相同结果重复" */
const IDEMPOTENT_TOOLS = new Set([
  'read_file', 'search_files', 'web_search', 'web_extract',
  'session_search', 'browser_snapshot', 'browser_console', 'browser_get_images',
  'desktop_tinker_read_file', 'desktop_tinker_search_files',
  'desktop_tinker_web_search', 'desktop_tinker_web_extract',
])

/** 变更工具：不做 no_progress 检测 */
const MUTATING_TOOLS = new Set([
  'terminal', 'execute_code', 'write_file', 'patch', 'todo', 'memory',
  'skill_manage', 'browser_click', 'browser_type', 'browser_press',
  'browser_scroll', 'browser_navigate', 'send_message', 'cronjob',
  'delegate_task', 'process', 'desktop_tinker_terminal', 'desktop_tinker_write_file',
  'desktop_tinker_patch', 'desktop_tinker_process',
])

/** 工具签名：工具名 + 参数规范化 hash */
interface ToolCallSignature {
  toolName: string
  argsHash: string
}

/** 结果记录：结果 hash + 重复次数 */
interface ResultRecord {
  resultHash: string
  repeatCount: number
}

/** 工具循环防护控制器 */
export class ToolLoopGuardrail {
  private readonly warningsEnabled: boolean
  private readonly hardStopEnabled: boolean
  private readonly exactFailureWarnAfter: number
  private readonly exactFailureBlockAfter: number
  private readonly sameToolFailureWarnAfter: number
  private readonly sameToolFailureHaltAfter: number
  private readonly noProgressWarnAfter: number
  private readonly noProgressBlockAfter: number

  private readonly exactFailureCounts = new Map<string, number>()
  private readonly sameToolFailureCounts = new Map<string, number>()
  private readonly noProgress = new Map<string, ResultRecord>()
  private haltDecision: GuardrailDecision | null = null

  /** 从 per-agent 配置构建（AgentConfig 全字段驱动） */
  constructor(config: AgentConfig) {
    this.warningsEnabled = config.warningsEnabled
    this.hardStopEnabled = config.hardStopEnabled
    this.exactFailureWarnAfter = config.exactFailureWarnAfter > 0 ? config.exactFailureWarnAfter : 2
    this.exactFailureBlockAfter = config.exactFailureBlockAfter > 0 ? config.exactFailureBlockAfter : 5
    this.sameToolFailureWarnAfter = config.sameToolFailureWarnAfter > 0 ? config.sameToolFailureWarnAfter : 3
    this.sameToolFailureHaltAfter = config.sameToolFailureHaltAfter > 0 ? config.sameToolFailureHaltAfter : 8
    this.noProgressWarnAfter = config.noProgressWarnAfter > 0 ? config.noProgressWarnAfter : 2
    this.noProgressBlockAfter = config.noProgressBlockAfter > 0 ? config.noProgressBlockAfter : 5
  }

  /** 每个对话轮次开始调用 */
  resetForTurn(): void {
    this.exactFailureCounts.clear()
    this.sameToolFailureCounts.clear()
    this.noProgress.clear()
    this.haltDecision = null
  }

  /** 执行前检查：block/halt 时不执行 */
  beforeCall(toolName: string, args: Record<string, unknown>): GuardrailDecision {
    const signature = this.signatureOf(toolName, args)
    if (!this.hardStopEnabled) {
      return this.decision(GuardrailAction.ALLOW, 'allow', '', toolName, 0)
    }
    const exactCount = this.exactFailureCounts.get(signature.argsHash) ?? 0
    if (exactCount >= this.exactFailureBlockAfter) {
      const d = this.decision(
        GuardrailAction.BLOCK,
        'repeated_exact_failure_block',
        `Blocked ${toolName}: the same tool call failed ${exactCount} times with identical arguments. Stop retrying it unchanged; change strategy or explain the blocker.`,
        toolName, exactCount
      )
      this.haltDecision = d
      return d
    }
    if (this.isIdempotent(toolName)) {
      const record = this.noProgress.get(signature.argsHash)
      if (record && record.repeatCount >= this.noProgressBlockAfter) {
        const d = this.decision(
          GuardrailAction.BLOCK,
          'idempotent_no_progress_block',
          `Blocked ${toolName}: this read-only call returned the same result ${record.repeatCount} times. Stop repeating it unchanged; use the result already provided or try a different query.`,
          toolName, record.repeatCount
        )
        this.haltDecision = d
        return d
      }
    }
    return this.decision(GuardrailAction.ALLOW, 'allow', '', toolName, 0)
  }

  /** 执行后检查：统计失败/无进展，warn 时附加引导 */
  afterCall(toolName: string, args: Record<string, unknown>, result: string, failed: boolean): GuardrailDecision {
    const signature = this.signatureOf(toolName, args)
    if (failed) {
      const exactCount = (this.exactFailureCounts.get(signature.argsHash) ?? 0) + 1
      this.exactFailureCounts.set(signature.argsHash, exactCount)
      this.noProgress.delete(signature.argsHash)
      const sameCount = (this.sameToolFailureCounts.get(toolName) ?? 0) + 1
      this.sameToolFailureCounts.set(toolName, sameCount)

      if (this.hardStopEnabled && sameCount >= this.sameToolFailureHaltAfter) {
        const d = this.decision(
          GuardrailAction.HALT,
          'same_tool_failure_halt',
          `Stopped ${toolName}: it failed ${sameCount} times this turn. Stop retrying the same failing tool path and choose a different approach.`,
          toolName, sameCount
        )
        this.haltDecision = d
        return d
      }
      if (this.warningsEnabled && exactCount >= this.exactFailureWarnAfter) {
        return this.decision(
          GuardrailAction.WARN,
          'repeated_exact_failure_warning',
          `${toolName} has failed ${exactCount} times with identical arguments. This looks like a loop; inspect the error and change strategy instead of retrying it unchanged.`,
          toolName, exactCount
        )
      }
      if (this.warningsEnabled && sameCount >= this.sameToolFailureWarnAfter) {
        return this.decision(
          GuardrailAction.WARN,
          'same_tool_failure_warning',
          this.failureRecoveryHint(toolName, sameCount),
          toolName, sameCount
        )
      }
      return this.decision(GuardrailAction.ALLOW, 'allow', '', toolName, exactCount)
    }

    this.exactFailureCounts.delete(signature.argsHash)
    this.sameToolFailureCounts.delete(toolName)

    if (!this.isIdempotent(toolName)) {
      this.noProgress.delete(signature.argsHash)
      return this.decision(GuardrailAction.ALLOW, 'allow', '', toolName, 0)
    }

    const resultHash = this.resultHash(result)
    const previous = this.noProgress.get(signature.argsHash)
    let repeatCount = 1
    if (previous && previous.resultHash === resultHash) {
      repeatCount = previous.repeatCount + 1
    }
    this.noProgress.set(signature.argsHash, { resultHash, repeatCount })

    if (this.warningsEnabled && repeatCount >= this.noProgressWarnAfter) {
      return this.decision(
        GuardrailAction.WARN,
        'idempotent_no_progress_warning',
        `${toolName} returned the same result ${repeatCount} times. Use the result already provided or change the query instead of repeating it unchanged.`,
        toolName, repeatCount
      )
    }
    return this.decision(GuardrailAction.ALLOW, 'allow', '', toolName, repeatCount)
  }

  getHaltDecision(): GuardrailDecision | null {
    return this.haltDecision
  }

  private isIdempotent(toolName: string): boolean {
    return !MUTATING_TOOLS.has(toolName) && IDEMPOTENT_TOOLS.has(toolName)
  }

  private failureRecoveryHint(toolName: string, count: number): string {
    const common = `${toolName} has failed ${count} times this turn. This looks like a loop. Do not switch to text-only replies; keep using tools, but diagnose before retrying. First inspect the latest error/output and verify your assumptions. `
    if (toolName === 'terminal' || toolName === 'desktop_tinker_terminal') {
      return common + 'For terminal failures, run a small diagnostic such as `pwd && ls -la` in the same tool, then try an absolute path, a simpler command, a different working directory, or a different tool such as read_file/write_file/patch.'
    }
    return common + 'Try different arguments, a narrower query/path, an absolute path when relevant, or a different tool that can make progress. If the blocker is external, report the blocker after one diagnostic attempt instead of repeating the same failing path.'
  }

  private signatureOf(toolName: string, args: Record<string, unknown>): ToolCallSignature {
    return { toolName, argsHash: this.sha256(this.canonicalArgs(args)) }
  }

  /** 参数规范化：排序键的紧凑 JSON */
  private canonicalArgs(args: Record<string, unknown>): string {
    if (!args || Object.keys(args).length === 0) {
      return '{}'
    }
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(args).sort()) {
      sorted[key] = args[key]
    }
    return JSON.stringify(sorted)
  }

  /** 结果 hash：优先解析 JSON 后规范化 */
  private resultHash(result: string): string {
    if (!result) {
      return this.sha256('')
    }
    try {
      const parsed = JSON.parse(result)
      return this.sha256(JSON.stringify(parsed))
    } catch {
      return this.sha256(result)
    }
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex')
  }

  private decision(action: GuardrailAction, code: string, message: string, toolName: string, count: number): GuardrailDecision {
    return { action, code, message, toolName, count }
  }
}

/**
 * 失败分类：
 * terminal 看 exit_code≠0；其余含 "error"/"failed"/Error 前缀。
 */
export function classifyToolFailure(toolName: string, result: string): boolean {
  if (!result) {
    return false
  }
  if (toolName === 'terminal' || toolName === 'desktop_tinker_terminal') {
    try {
      const data = JSON.parse(result) as { exit_code?: number }
      if (typeof data.exit_code === 'number' && data.exit_code !== 0) {
        return true
      }
      return false
    } catch {
      return false
    }
  }
  const lower = result.length > 500 ? result.substring(0, 500).toLowerCase() : result.toLowerCase()
  return lower.includes('"error"') || lower.includes('"failed"') || result.startsWith('Error')
}

/**
 * warn/halt 时附加引导文本到工具结果。
 */
export function appendGuardrailGuidance(result: string, decision: GuardrailDecision): string {
  if ((decision.action !== GuardrailAction.WARN && decision.action !== GuardrailAction.HALT) || !decision.message) {
    return result
  }
  const label = decision.action === GuardrailAction.HALT ? 'Tool loop hard stop' : 'Tool loop warning'
  const suffix = `\n\n[${label}: ${decision.code}; count=${decision.count}; ${decision.message}]`
  return (result ?? '') + suffix
}

/** 构造合成结果 */
export function syntheticGuardrailResult(decision: GuardrailDecision): string {
  return JSON.stringify({
    error: decision.message,
    guardrail: {
      action: decision.action,
      code: decision.code,
      message: decision.message,
      tool_name: decision.toolName,
      count: decision.count,
    },
  })
}
