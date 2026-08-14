/**
 * tool-call-executor.ts — 工具执行器（OO 化拆分 P3）
 *
 * 单个工具调用的完整执行链内聚于此：
 * 循环防护 → 三层门检（灾难/授权/沙盒）→ 执行/挂起 → 循环防护 → 缓存失效。
 * 审批走 ApprovalManager（requestApproval/waitToolResult）。
 *
 * 生命周期 = 无状态（每轮 Conversation 持有同一实例或新建）。
 */
import { SandboxDecision } from '../../service/sandbox-whitelist-service'
import { eventRecorder } from '../../service/event-recorder'
import { AuthzDecision } from '../../service/tool-auth-service'
import { GuardrailAction, ToolLoopGuardrail, appendGuardrailGuidance, classifyToolFailure, syntheticGuardrailResult } from '../../service/tool-loop-guardrail-service'
import { APPROVAL_REJECTED_MSG } from '../constants'
import type { ToolCall } from '../llm/types'
import type { ConversationContext } from './context'
import { buildToolCtx } from './context'
import type { ToolCallExecutorDeps } from './types'
import { CACHE_AFFECTING_TOOLS } from '../constants'


/** 工具执行器 */
export class ToolCallExecutor {
  constructor(private readonly deps: ToolCallExecutorDeps) { }

  /** 执行单个工具调用（guardrail 门检 + 三层安全检查 + 审批 + 本地执行） */
  async execute(convCtx: ConversationContext, toolCall: ToolCall, guardrail: ToolLoopGuardrail): Promise<string> {
    const { toolAuthService, sandboxWhitelistService, toolManager, promptModuleBuilder } = this.deps
    const toolCtx = buildToolCtx(convCtx, toolCall, this.deps.runtime.getAbort()?.signal)
    const args = (toolCall.arguments ?? {}) as Record<string, unknown>
    const startedAt = Date.now()
    // 事件埋点：工具调用
    eventRecorder.record({
      sessionId: convCtx.sessionId,
      conversationId: convCtx.conversationId,
      eventType: 'tool',
      eventName: 'call',
      payload: { toolName: toolCall.name, toolCallId: toolCall.id, argsSummary: JSON.stringify(args).slice(0, 80) },
    })

    // ── 工具循环防护：执行前检查（block/halt 时不执行，返回合成结果） ──
    const before = guardrail.beforeCall(toolCall.name, args)
    if (before.action === GuardrailAction.BLOCK || before.action === GuardrailAction.HALT) {
      console.warn(`工具循环防护拦截 tool=${toolCall.name} code=${before.code} count=${before.count}`)
      return syntheticGuardrailResult(before)
    }

    // ── 三层门检：灾难 → 授权 → 沙盒 ──
    // ① YOLO 模式跳过所有安全检查
    if (!toolCtx.yolo) {
      // ② 授权检查：灾难命令 → DENY（绝对不执行，不进审批）；危险参数模式 → ASK
      const authz = toolAuthService.check(toolCall.name, args)
      if (authz === AuthzDecision.DENY) {
        console.warn(`灾难性命令拦截 tool=${toolCall.name} 不执行`)
        return JSON.stringify({
          output: '',
          exit_code: -1,
          error: `Command denied: catastrophic operation detected and blocked. Rephrase the command.`,
          status: 'blocked'
        })
      }
      if (authz === AuthzDecision.ASK) {
        const approved = await this.deps.approvalManager.requestApproval(convCtx, toolCall, '危险操作，需要审批')
        eventRecorder.record({
          sessionId: convCtx.sessionId,
          conversationId: convCtx.conversationId,
          eventType: 'tool',
          eventName: 'approval',
          payload: { toolName: toolCall.name, toolCallId: toolCall.id, reason: 'danger', decision: approved ? 'approved' : 'rejected' },
        })
        if (!approved) {
          return APPROVAL_REJECTED_MSG
        }
      }
      // ③ 沙盒检查（URL/路径白名单 → ASK；审批通过后自动加入白名单）
      const sandbox = sandboxWhitelistService.check(convCtx.profile, toolCall.name, args)
      if (sandbox === SandboxDecision.ASK) {
        const approved = await this.deps.approvalManager.requestApproval(convCtx, toolCall, '沙盒限制')
        eventRecorder.record({
          sessionId: convCtx.sessionId,
          conversationId: convCtx.conversationId,
          eventType: 'tool',
          eventName: 'approval',
          payload: { toolName: toolCall.name, toolCallId: toolCall.id, reason: 'sandbox', decision: approved ? 'approved' : 'rejected' },
        })
        if (!approved) {
          return APPROVAL_REJECTED_MSG
        }
        this.autoWhitelistApproved(convCtx.profile, args)
      }
    }

    // ── 执行（ToolContext 直接传入，无中间转换） ──
    let result: string
    try {
      const execResult = await toolManager.execute(toolCtx)
      if (execResult.async) {
        // 异步工具：挂起等待外部回调（onToolResult 恢复）
        return this.deps.approvalManager.waitToolResult(convCtx, toolCall.id)
      }
      result = execResult.result
    } catch (e) {
      result = `Error: Tool execution failed: ${(e as Error).message}`
      // 事件埋点：工具执行失败（异常定位）
      eventRecorder.record({
        sessionId: convCtx.sessionId,
        conversationId: convCtx.conversationId,
        eventType: 'error',
        eventName: 'tool_error',
        payload: { toolName: toolCall.name, toolCallId: toolCall.id, error: (e as Error).message.slice(0, 300) },
      })
    }

    // ── 工具循环防护：执行后检查（warn 时附加引导文本） ──
    const after = guardrail.afterCall(toolCall.name, args, result, classifyToolFailure(toolCall.name, result))
    if (after.action === GuardrailAction.WARN || after.action === GuardrailAction.HALT) {
      console.log(`工具循环防护提示 tool=${toolCall.name} code=${after.code} count=${after.count}`)
      result = appendGuardrailGuidance(result, after)
    }

    // ── 缓存失效（skill_manage/memory 改变 prompt 缓存内容） ──
    if (CACHE_AFFECTING_TOOLS.has(toolCall.name)) {
      console.log(`清除提示词缓存: tool=${toolCall.name} sessionId=${convCtx.sessionId}`)
      promptModuleBuilder.invalidateSessionCache(convCtx.sessionId, convCtx.profile)
    }

    // 事件埋点：工具结果
    eventRecorder.record({
      sessionId: convCtx.sessionId,
      conversationId: convCtx.conversationId,
      eventType: 'tool',
      eventName: 'result',
      payload: { toolName: toolCall.name, toolCallId: toolCall.id, success: !result.startsWith('Error:'), resultLen: result.length },
      latencyMs: Date.now() - startedAt,
    })

    return result
  }

  /** 沙盒审批通过后：将本次访问的 URL/路径自动加入白名单 */
  private autoWhitelistApproved(profile: string, args: Record<string, unknown>): void {
    try {
      const urls = this.deps.sandboxWhitelistService.extractTargetUrls(args)
      for (const u of urls) {
        if (!u) continue
        this.deps.sandboxWhitelistService.addUrlWhitelist({
          profile, urlPattern: u, description: '审批通过自动添加', enabled: true,
        })
        console.log(`[sandbox] 审批通过自动加 URL 白名单 profile=${profile} pattern=${u}`)
      }
      const paths = this.deps.sandboxWhitelistService.extractTargetPaths(args)
      for (const p of paths) {
        if (!p) continue
        this.deps.sandboxWhitelistService.addPathWhitelist({
          profile, pathPattern: p, description: '审批通过自动添加', enabled: true,
        })
        console.log(`[sandbox] 审批通过自动加路径白名单 profile=${profile} pattern=${p}`)
      }
    } catch (e) {
      console.warn(`自动加白名单失败: ${(e as Error).message}`)
    }
  }
}
