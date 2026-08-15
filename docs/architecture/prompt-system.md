# 提示词模块系统

`src/main/core/prompt/`——系统提示词的模块化构建：AgentMode 定义模块顺序 → PromptManager 注册 → PromptModuleBuilder 按序渲染 → PromptRenderer 加载 .hbs 模板。

## 组件

| 组件 | 职责 |
|:--|:--|
| PromptManager | 启动扫描所有 IDynamicPromptModule——维护 模块标识 → 条目 映射 |
| PromptModuleBuilder | buildSystemPrompt(ctx)：动态模块按 moduleList 顺序渲染 + 静态模块（SQLite 用户自定义）——内存 Map 缓存 |
| PromptRenderer | 加载 .hbs 模板（resources/prompts/ + partials/）——Handlebars 渲染 |

渲染上下文 = **ConversationContext**（loop 层）——模块直接消费对话上下文（无中间 PromptContext 对象）。

## 模块清单（12 个）

| 模块 | 模板/来源 | 说明 |
|:--|:--|:--|
| SystemContextModule | context.hbs | Session ID / 日期 / 模型名 |
| RuntimeEnvironmentModule | runtime-environment.hbs | OS / 架构 / 客户端类型 / Shell / HomeDir + 平台标志 |
| SoulPromptModule | agent_soul_prompt 配置 | 灵魂提示词（未配置返回 null 跳过） |
| MemorySnapshotModule | memory-snapshot.hbs | memory 工具可用时——持久记忆条目注入 |
| UserProfileModule | user-profile.hbs | memory 可用时——用户画像条目（target='user'） |
| SkillsIndexModule | skills-index.hbs | 技能列表按分类分组索引 |
| ToolEnforcementModule | tool-enforcement.hbs | 工具使用规则 |
| TaskCompletionModule | task-completion.hbs | 任务完成语义 |
| OpenAIExecutionModule | openai-execution.hbs | OpenAI 工具调用执行格式 |
| GoogleOperationalModule | google-operational.hbs | 谷歌系操作语义 |
| MemoryGuidanceModule | memory-guidance.hbs | 记忆使用引导（memory 可用时） |
| SessionSearchModule | session-search.hbs | 会话搜索使用说明（session_search 可用时） |

预设模块继承 `HandlebarsPresetModule`（通过 PromptRenderer 加载 `{id}.hbs`——shouldLoad=true 默认无条件，子类可重写）。

## 构建管线

```
buildSystemPrompt(convCtx)
  → 按 AgentMode.moduleList 顺序遍历动态模块（每次实时渲染——运行时状态最新）
  → + 用户自定义静态模块（prompt_modules 表——{{变量}} 模板替换）
  → 拼接为 system 消息 → LLM 调用
缓存：内存 Map（替代 Redis + PG 两层——本地单用户）
  缓存失效：skill_manage / memory 等工具调用后（CACHE_AFFECTING_TOOLS）
```

## 相关文档

- [架构总览](overview.md)
- [Agent 执行循环](agent-loop.md)
