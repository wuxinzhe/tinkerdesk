/**
 * constants/role.ts — 消息角色 + 账号角色常量
 * 消息角色对齐 showing-agent MessageConstants（ROLE_USER/ASSISTANT/TOOL/APPROVAL/SYSTEM）；
 * 账号角色对齐 RoleConstants（ROLE_USER/ROLE_ADMIN）。
 */
/** 消息角色 */
export const ROLE_SYSTEM = 'system'
export const ROLE_USER = 'user'
export const ROLE_ASSISTANT = 'assistant'
export const ROLE_TOOL = 'tool'
export const ROLE_APPROVAL = 'approval'

/** 账号角色（对齐 RoleConstants） */
export const ROLE_ACCOUNT_USER = 'user'
export const ROLE_ACCOUNT_ADMIN = 'admin'

/** 审批拒绝返回文案（工具执行中止原因） */
export const APPROVAL_REJECTED_MSG = '用户拒绝执行'
