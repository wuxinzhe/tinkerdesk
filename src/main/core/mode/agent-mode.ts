/**
 * core/mode/agent-mode.ts — Agent Mode SPI（类型归位 types.ts）
 *
 * IAgentMode（@AgentMode 注解 + 生命周期钩子 + 提示词注入）：
 * - 实现类为无状态单例（TS 版单例或构造注入）
 * - 元数据：id/version/name/description/promptTemplate
 * - getModuleList：动态提示词模块渲染顺序
 * - getDefaultConfig：agent_configs 无行时的配置兜底（硬编码）
 *
 * 类型定义统一归位 ./types.ts，本文件仅 re-export 保持旧导入兼容。
 */
export type { AgentModeMeta, IAgentMode, ModeInfoDTO, ModeOptionDTO } from './types'
