/**
 * api/index.ts — 数据层统一导出
 * 默认实例（使用默认 HttpClient）
 */
import { HttpClient, http as defaultHttp } from './http-client'
import { AuthApi } from './auth-api'
import { SessionsApi } from './sessions-api'
import { MessagesApi } from './messages-api'
import { AgentsApi } from './agents-api'
import { ModelsApi } from './models-api'
import { SkillsApi } from './skills-api'
import { ToolsApi } from './tools-api'
import { SandboxApi } from './sandbox-api'

/** 使用默认 HttpClient 的单例实例 */
export const authApi = new AuthApi(defaultHttp)
export const sessionsApi = new SessionsApi(defaultHttp)
export const messagesApi = new MessagesApi(defaultHttp)
export const agentsApi = new AgentsApi(defaultHttp)
export const modelsApi = new ModelsApi(defaultHttp)
export const skillsApi = new SkillsApi(defaultHttp)
export const toolsApi = new ToolsApi(defaultHttp)
export const sandboxApi = new SandboxApi(defaultHttp)

export {
  HttpClient,
  AuthApi, SessionsApi, MessagesApi, AgentsApi,
  ModelsApi, SkillsApi, ToolsApi, SandboxApi,
}

export type { TokenResponse, InitStatusResponse, InitCheckItem } from '@/defines/api/auth-types'
export type { UrlWhitelistItem, PathWhitelistItem } from '@/defines/api/sandbox-types'
export type { CustomModelTestResult, UpdateSceneModelRequest, BindSceneModelRequest, ReorderSceneBindingsRequest, UpdateCustomModelParams } from '@/defines/api/model-types'
export type { CheckedTool, McpServerConfig, McpDiscoveredTool, McpServerState, RegisteredTool, ToolCenterState } from '@/defines/api/tool-center-types'
