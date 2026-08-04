/**
 * api-message.ts — API 消息工厂函数
 *
 * 对应 showing-agent ApiMessage：表示 LLM API 会话中的单条消息。
 * 类型定义集中在 types.ts，本文件只提供构造工厂。
 */
import type {ApiMessage, ApiMessageRole} from './types'

// ── 静态工厂（对应 Java Builder 的 role()/system()/user()/assistant()/tool()） ──

/** 创建指定角色的消息 */
export function apiMessageRole(role: ApiMessageRole, content = ''): ApiMessage {
  return {role, content}
}

/** system 消息 */
export function systemMessage(content: string): ApiMessage {
  return {role: 'system', content}
}

/** user 消息 */
export function userMessage(content: string): ApiMessage {
  return {role: 'user', content}
}

/** assistant 消息（可带推理内容/工具调用） */
export function assistantMessage(content = ''): ApiMessage {
  return {role: 'assistant', content}
}

/** tool 消息（工具执行结果） */
export function toolMessage(content: string, toolCallId: string, name?: string): ApiMessage {
  return {role: 'tool', content, toolCallId, name}
}

/** 带完整字段构造（对应 Builder 链式调用） */
export function buildMessage(
  role: ApiMessageRole,
  content: string,
  extra?: {
    reasoningContent?: string
    toolCall?: string
    toolCallId?: string
    name?: string
  }
): ApiMessage {
  return {role, content, ...extra}
}
