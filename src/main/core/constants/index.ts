/**
 * constants/ — 本地端统一常量包
 *
 * 对齐 showing-agent core/constant 包，云端/本地数据同构（迁移零转换）。
 * 对照关系：
 *   event.ts        ← EventConstants
 *   llm.ts          ← LlmConstants（RES_* / ERROR_*）
 *   message.ts      ← MessageConstants（MSG_TYPE_* / FINISH_* / STATUS_*）
 *   conversation.ts ← ConversationConstants（CONV_*）
 *   role.ts         ← MessageConstants（消息角色）+ RoleConstants（账号角色）
 *   tool.ts         ← ToolConstants（TOOL_TYPE_*）
 *   client.ts       ← ClientConstants（OS_* / TYPE_*）
 * 场景标识 SCENE_* 在 core/llm/types（对齐 Java LlmConstants SCENE 语义）。
 */
export * from './event'
export * from './llm'
export * from './message'
export * from './conversation'
export * from './role'
export * from './tool'
export * from './client'
