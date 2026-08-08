/**
 * constants/ — 本地端统一常量包
 *
 * 常量单一来源——main 与 renderer 共用同一份定义。
 * 对照关系：
 *   event.ts        ← EventConstants
 *   llm.ts          ← LlmConstants（RES_* / ERROR_*）
 *   message.ts      ← MessageConstants（MSG_TYPE_* / FINISH_* / STATUS_*）
 *   conversation.ts ← ConversationConstants（CONV_*）
 *   role.ts         ← MessageConstants（消息角色）+ RoleConstants（账号角色）
 *   tool.ts         ← ToolConstants（TOOL_TYPE_*）
 *   client.ts       ← ClientConstants（OS_* / TYPE_*）
 * 场景标识 SCENE_* 在 core/llm/types。
 */
export * from './ipc'
export * from './route'
export * from './llm'
export * from './message'
export * from './conversation'
export * from './role'
