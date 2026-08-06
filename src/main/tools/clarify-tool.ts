/**
 * clarify-tool.ts — 澄清确认工具
 *
 * 复刻 tinker-agent ClarifyTool：
 * LLM 需要用户从多个选项中选择时调用，向客户端发送 clarify_request 事件，
 * 前端据此渲染 ClarifyCard 交互组件。
 */
import type { PromptRenderer } from '../core/prompt/renderer'
import { BaseTool } from './base-tool'
import type { ToolContext } from '../core/loop/types'
import { ToolResult } from '../core/tool/tool-result'
import type { MessageService } from '../service/message-service'
import { MessageFactory } from '../service/message-service'

/** 工具名 */
export const TOOL_NAME = 'builtin_tinker_clarify'

/** 澄清请求消息类型 */
const TYPE_CLARIFY_REQUEST = 'clarify_request'
/** 澄清请求事件名 */
const EVENT_CLARIFY_REQUEST = 'clarify_request'

/** 澄清确认工具 */
export class ClarifyTool extends BaseTool {
  private readonly messageService: MessageService

  constructor(renderer: PromptRenderer, messageService: MessageService) {
    super(renderer, TOOL_NAME)
    this.messageService = messageService
  }

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const { sessionId, conversationId, profile, toolCall } = ctx

    // 持久化一条 clarify_request 消息供前端渲染 ClarifyCard
    const clarifyOnly = {
      [toolCall.id]: { name: toolCall.name, arguments: toolCall.arguments },
    }
    const clarifyMsg = MessageFactory.buildAssistantToolCall(conversationId, sessionId, profile, '', clarifyOnly)
    clarifyMsg.messageType = TYPE_CLARIFY_REQUEST
    this.messageService.saveTempMessage(clarifyMsg)

    // 将工具参数发往客户端处理（sender 消息通道）
    ctx.sendMessage(EVENT_CLARIFY_REQUEST, {
      toolCallId: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
    })

    // 异步工具：等待客户端选择结果
    return ToolResult.async()
  }
}
