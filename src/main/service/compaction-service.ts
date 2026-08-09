/**
 * compaction-service.ts — 上下文压缩服务（Token-based）
 *
 * 复刻 tinker-agent CompactionService（本地单用户版）：
 * - 触发条件：actualPromptTokens >= contextLimit × thresholdPercent（主动压缩检查）
 * - 压缩策略：从最旧对话开始，逐对话累计 token，保留尾部 tailRatio 不压缩
 * - 中间的旧对话消息 → 调用 LLM 汇总 → 摘要消息 → 归档旧消息
 * - LLM 摘要失败时使用 fallback 占位符，保证会话不会因压缩失败而永久死亡
 * - 冷却控制：失败后阶梯 TTL 暂停重试；无效/fallback 连续抑制
 */
import { RES_TEXT } from '../core/llm/llm-response'
import type { LlmRouter } from '../core/llm/llm-router'
import type { ApiMessage, ModelConfig } from '../core/llm/types'
import { SCENE_SUMMARY } from '../core/llm/types'
import { CONV_COMPRESSED } from '../core/loop/types'
import type { CompressionCooldownStore } from './compression-cooldown-store'
import type { ConversationService } from './conversation-service'
import type { MessageService } from './message-service'
import type { TodoService } from './todo-service'

/** 压缩服务 */
export class CompactionService {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly messageService: MessageService,
    private readonly conversationService: ConversationService,
    private readonly cooldownStore: CompressionCooldownStore,
    private readonly todoService?: TodoService
  ) { }

  /**
   * 检查刚完成的 LLM 调用是否已接近上下文上限（主动压缩检查）。
   * 冷却中 / 无效抑制 / fallback 抑制时跳过。
   */
  shouldCompact(sessionId: string, profile: string, mainConfig: ModelConfig, thresholdPercent: number, actualPromptTokens: number): boolean {
    // 冷却中则跳过压缩
    if (this.cooldownStore.isBlocked(sessionId)) {
      console.debug(`压缩冷却中，跳过 sessionId=${sessionId}`)
      return false
    }
    // 连续多次无可压缩内容，跳过压缩
    if (this.cooldownStore.isIneffectiveBlocked(sessionId)) {
      console.debug(`压缩无效计数已达上限，跳过 sessionId=${sessionId}`)
      return false
    }
    // 连续多次使用 fallback 占位符，跳过主动压缩（等溢出路径兜底）
    if (this.cooldownStore.isFallbackBlocked(sessionId)) {
      console.debug(`压缩 fallback 计数已达上限，跳过主动压缩 sessionId=${sessionId}`)
      return false
    }

    if (actualPromptTokens <= 0) {
      return false
    }

    // 使用 provider 返回的真实 prompt_tokens 判断（含 system + 摘要 + 历史 + 协议开销）
    const thresholdTokens = Math.floor(mainConfig.contextLimit * thresholdPercent)
    console.debug(`压缩判断 sessionId=${sessionId} actual=${actualPromptTokens} threshold=${thresholdTokens}`)
    return actualPromptTokens >= thresholdTokens
  }

  /**
   * 执行压缩：找需压缩的对话 → 加载消息 → LLM 汇总 → 保存摘要 → 归档旧对话。
   * @param sessionId 会话 ID
   * @param profile   配置档
   * @param contextLimit 主模型上下文限制
   * @param tailRatio 尾部保留比例（0.2 = 保留尾部 20% 不压缩）
   * @param compressConfig 压缩专用模型配置（可选，null 回退 mainConfig）
   */
  async compact(
    sessionId: string,
    profile: string,
    contextLimit: number,
    tailRatio: number,
    compressConfig: ModelConfig | null
  ): Promise<boolean> {
    const tailTokenBudget = Math.floor(contextLimit * tailRatio)

    // ── 一条 SQL 窗口函数找出需压缩的对话 ID ──
    const compressConvIds = this.conversationService.findCompressConvIds(sessionId, tailTokenBudget)
    console.log(`action=COMPACTION sessionId=${sessionId} compressConvIds=${compressConvIds.join(',')}`)

    if (compressConvIds.length === 0) {
      console.warn(`无可压缩对话（可能上下文大头为 system prompt/工具 schema），递增无效计数 sessionId=${sessionId}`)
      this.cooldownStore.incrementIneffective(sessionId)
      return false
    }

    // ── 加载旧摘要 + 需压缩的消息 → LLM 汇总 ──
    const existingSummary = this.messageService.loadLatestSummaryContent(sessionId, profile)
    const oldMessages = this.messageService.loadConversationsMessages(compressConvIds, sessionId, profile)
    const merMessages: ApiMessage[] = existingSummary ? [existingSummary, ...oldMessages] : oldMessages

    const summary = await this.summarize(sessionId, profile, merMessages, compressConfig)
    let usedFallback = false
    if (summary.trim() !== '') {
      this.cooldownStore.clearFallback(sessionId)
    } else {
      usedFallback = true
      this.cooldownStore.incrementFallback(sessionId)
      console.warn(`LLM 摘要失败，使用 fallback 占位符 sessionId=${sessionId}`)
    }

    // ── 无论 LLM 成功/失败，只要结构上有可压缩内容，就落盘 ──
    this.cooldownStore.clearCooldown(sessionId)
    this.cooldownStore.clearIneffective(sessionId)

    let finalSummary = summary.trim() !== '' ? summary : buildFallbackSummary(compressConvIds)

    // 压缩后注入活跃 todo 列表：
    // 只注入 pending/in_progress——completed/cancelled 会让模型在压缩后重复已完成工作。
    const todoBlock = this.formatTodoInjection(sessionId)
    if (todoBlock !== null) {
      finalSummary = (finalSummary !== '' ? finalSummary + '\n\n' : '') + todoBlock
    }

    this.messageService.saveSummary(sessionId, profile, finalSummary)
    this.conversationService.batchUpdateStatus(sessionId, compressConvIds, CONV_COMPRESSED)

    // 完整可追溯日志：压缩结果 + 影响范围（归档对话数/消息数/是否 fallback）
    console.log(
      `action=COMPACTION_DONE sessionId=${sessionId} ` +
      `convCount=${compressConvIds.length} msgCount=${oldMessages.length} ` +
      `summaryLen=${finalSummary.length} fallback=${usedFallback}`
    )
    if (usedFallback) {
      console.warn(
        `压缩摘要为 fallback（记忆未保留）：sessionId=${sessionId} ` +
        `归档对话=${compressConvIds.length} 条、消息=${oldMessages.length} 条——` +
        `该部分对话内容不会进入后续上下文`
      )
    }
    return true
  }

  /**
   * 格式化压缩后注入的活跃 todo 块。
   * 只包含 pending / in_progress 项；无活跃项返回 null（不注入）。
   * 格式：
   * [Your active task list was preserved across context compression]
   * - [>] task_1. 任务描述 (in_progress)
   * - [ ] task_2. 任务描述 (pending)
   */
  private formatTodoInjection(sessionId: string): string | null {
    if (!this.todoService) {
      return null
    }
    const items = this.todoService.read(sessionId)
    if (!items || items.length === 0) {
      return null
    }
    const active = items.filter((i) => i.status === 'pending' || i.status === 'in_progress')
    if (active.length === 0) {
      return null
    }
    const lines: string[] = ['[Your active task list was preserved across context compression]']
    for (const item of active) {
      const marker = item.status === 'in_progress' ? '[>]' : '[ ]'
      lines.push(`- ${marker} ${item.id}. ${item.content} (${item.status})`)
    }
    return lines.join('\n')
  }

  /** 记录压缩失败（冷却阶梯） */
  recordFailure(sessionId: string): void {
    this.cooldownStore.recordFailure(sessionId)
  }

  /** 清理会话压缩状态 */
  clearAll(sessionId: string): void {
    this.cooldownStore.clearAll(sessionId)
  }

  /** LLM 汇总调用（压缩场景，用压缩专用模型配置） */
  private async summarize(sessionId: string, profile: string, messages: ApiMessage[], compressConfig: ModelConfig | null): Promise<string> {
    try {
      const configs = compressConfig ? [compressConfig] : []
      if (configs.length === 0) {
        console.warn(`压缩场景未配置模型，使用 fallback sessionId=${sessionId}`)
        return ''
      }
      // 调用摘要 Operation（复用 LlmRouter 的 execute，scene=summary）
      const response = await this.llmRouter.execute({
        scene: SCENE_SUMMARY,
        messages,
        tools: [],
        modelConfigs: configs,
      })
      if (response.resType === RES_TEXT) {
        return response.text
      }
      console.warn(`压缩摘要响应异常 resType=${response.resType} error=${response.errorMessage}`)
      return ''
    } catch (e) {
      console.warn(`压缩摘要调用异常: ${(e as Error).message}`)
      return ''
    }
  }
}

/** 构建 fallback 摘要：LLM 无法生成摘要时使用 */
function buildFallbackSummary(compressConvIds: string[]): string {
  const convId = compressConvIds.length > 0 ? compressConvIds[0] : ''
  return `系统已压缩 ${compressConvIds.length} 轮对话以释放上下文空间。` +
    `当前摘要暂不可用，将通过自动重试恢复。` +
    (convId ? ` 首次压缩的对话 ID: ${convId}` : '')
}
