/**
 * constants/tool.ts — 工具类型常量
 * 对齐 showing-agent ToolConstants。
 */
export const TOOL_TYPE_SERVER = 'server'
export const TOOL_TYPE_DESKTOP = 'desktop'
export const TOOL_TYPE_WEB = 'web'
export const TOOL_TYPE_IPHONE = 'iPhone'
export const TOOL_TYPE_ANDROID = 'Android'
export const TOOL_TYPE_MCP = 'mcp-ext'
export const TOOL_TYPE_WEB_EXTENSION = 'web-ext'
export const TOOL_TYPE_SHARED = 'shared'

/** 客户端工具类型集合（对齐 Java TOOL_TYPES_CLIENT） */
export const TOOL_TYPES_CLIENT = [
  TOOL_TYPE_DESKTOP,
  TOOL_TYPE_WEB,
  TOOL_TYPE_IPHONE,
  TOOL_TYPE_ANDROID,
  TOOL_TYPE_WEB_EXTENSION,
]
