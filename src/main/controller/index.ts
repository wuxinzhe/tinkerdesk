/**
 * controller/index.ts — Controller 层统一出口
 *
 * Local-client controllers: the IPC surface IS the exposed API (no HTTP controllers).
 * controller package (auth/registration/admin console removed).
 */
export {AgentController} from './agent-controller'
export {SessionController} from './session-controller'
export {MessageController} from './message-controller'
export {AgentCrudController} from './agent-manager-controller'
export {AgentConfigController} from './agent-config-controller'
export {ToolController} from './tool-controller'
export {SkillController} from './skill-controller'
export {PromptModuleController} from './prompt-module-controller'
export {SandboxController} from './sandbox-controller'
export {ModelController} from './model-controller'
export {McpController} from './mcp-controller'
export {AgentModeController} from './agent-mode-controller'
export {ok, okEmpty, fail} from './api-response'
export type {ApiResponse} from './api-response'
