/**
 * llm-operation.ts — LLM Operation 接口 + 场景常量
 *
 * 对应 showing-agent ILlmOperation：
 * - Phase 1 (buildInput)：构建请求消息列表
 * - Phase 2 (LlmRouter 内)：模型调用 + 回退（固定循环流程）
 * - Phase 3 (handle)：判决 LLM 返回结果，决定循环是否继续
 *
 * 类型定义集中在 types.ts，本文件仅保留语义注释 + 场景常量。
 */

/** 场景常量（对应 showing-agent ChatOperation / SummaryOperation / TitleOperation） */
export const SCENE_CHAT = 'chat'
export const SCENE_SUMMARY = 'summary'
export const SCENE_TITLE = 'title'

export type {LlmOperation, OperationContext} from './types'
