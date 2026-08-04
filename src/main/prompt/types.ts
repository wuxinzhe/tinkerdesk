/**
 * types.ts — 提示词模块系统统一类型定义
 *
 * 复刻 showing-agent core/prompt：
 * IDynamicPromptModule / PromptModuleEntry / PromptModuleMeta。
 */

/** 提示词模块渲染上下文（本地版：对齐 ConversationContext 核心字段） */
export interface PromptContext {
  sessionId: string
  profile: string
  /** 客户端环境 */
  clientEnv?: {
    os: string
    arch?: string
    clientType: string
    shell: string
    homeDir: string
    pathFormat: string
  }
  /** 可用工具名列表 */
  toolNames?: string[]
  /** 其他自定义上下文（模块自取） */
  [key: string]: unknown
}

/** 动态提示词模块接口（对应 IDynamicPromptModule） */
export interface IDynamicPromptModule {
  /** 模块标识（全局唯一） */
  readonly id: string
  /** 判断本次对话是否需要加载此模块 */
  shouldLoad(ctx: PromptContext): boolean
  /** 渲染提示词文本（空/null 表示无输出） */
  loadPrompt(ctx: PromptContext): string | null
  /** 关联数据变更时刷新内部缓存（默认 no-op） */
  refreshCache?(): void
}

/** 动态模块条目（对应 PromptModuleEntry：id + module 包装） */
export interface PromptModuleEntry {
  id: string
  module: IDynamicPromptModule
}
