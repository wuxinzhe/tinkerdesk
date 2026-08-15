# 架构总览

TinkerDesk 是本地优先的桌面 AI Agent：Electron 主进程承载完整的 Agent 执行引擎，Vue 3 渲染进程提供聊天 UI，两者通过 IPC 通信。无服务端、无云依赖（模型 API 除外）。

## 进程模型

```
┌─────────────────────────────────────────────────┐
│ Electron 主进程（Node.js）                       │
│  ┌───────────────────────────────────────────┐  │
│  │ 三层：repository → service → core         │  │
│  │  core/loop = Agent 执行引擎（TinkerAgent） │  │
│  │  core/llm = LLM 路由/客户端/回退           │  │
│  │  core/prompt = 提示词模块系统              │  │
│  │  core/tool = 工具注册/执行/MCP             │  │
│  └───────────────┬───────────────────────────┘  │
│                  │ IPC（handleTrusted 来源校验） │
└──────────────────┼──────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────┐
│ Electron 渲染进程（Vue 3 + Pinia）               │
│  View → Store → API（单向依赖）                  │
│  聊天 / 会话 / 设置 / 工具管理 / 插件管理         │
└─────────────────────────────────────────────────┘
```

## 三层职责

| 层 | 目录 | 职责 |
|:--|:--|:--|
| repository | `src/main/repository/` | SQLite 数据访问（node:sqlite）——20 张表——只做数据读写 |
| service | `src/main/service/` | 业务逻辑——组合 repository——被 controller/core 调用 |
| core | `src/main/core/` | Agent 执行引擎（loop / llm / prompt / tool / mode） |
| controller | `src/main/controller/` | IPC 通道（一个 IPC 一个具名方法——`register()` 只绑定） |

## 分层规则

- **同域 Service 互注**；跨域编排走 App 层（bootstrap）
- **tool 层**可直连 repository 或调 service（工具是执行者）
- **多表写事务**归 service（`withTransaction`——node:sqlite 同步事务 + SAVEPOINT）
- **controller 不访问 repository**——一律经 service
- **profile 铁律**：per-agent 方法 profile 必传（前端传入——main 不硬编码默认值）

## Agent 执行链路（核心路径）

```
用户消息（IPC agent:chat）
  → SessionContextFactory.build（装载 AgentConfig/环境/YOLO/sender）
  → TinkerAgent（聚合根——三级上下文 SessionContext → ConversationContext → ToolContext）
  → Conversation.run（一轮循环）
       ├─ 提示词构建（prompt 模块系统 → system）
       ├─ LLM 流式调用（llm-router → Operation → Client）
       ├─ 响应分支（text / tool_calls / reasoning / empty / overflow / error）
       ├─ 工具执行（ToolCallExecutor：循环防护 → 三层门检 → 执行）
       └─ 收尾（flush 落库 + 统计 + 事件 + 标题生成 + 压缩检查）
  → 流式 token 推送（event-sender：agent:message 单通道）
```

## 关键机制速览

| 机制 | 位置 | 说明 |
|:--|:--|:--|
| 忙碌三模式 | `core/loop/strategies/` | queue（默认）/ redirect / interrupt——新消息到达策略 |
| 三层门检 | `tool-call-executor.ts` | 灾难 DENY → 授权 ASK → 沙盒 ASK（审批自动加白名单） |
| 模型回退 | `llm-router.ts` | 按 modelConfigs 顺序尝试——Operation 判决回退——本地重试 |
| 上下文压缩 | `compaction-service.ts` | token 阈值触发——旧对话 LLM 摘要——冷却抑制 |
| 事件埋点 | `agent_events` 表 | 六域事件——异步队列批量落库——环形上限 50000 |
| IPC 安全 | `security/ipc-guard.ts` | senderFrame 来源校验——只允许应用页面调用 |

## 数据流（消息）

```
消息产生（MessageFactory）→ 内存暂存（tempMessages——未完成回合）
  → 回合结束 flush 落库（messages 表——content/apiContent 字段级分离）
  → 前端读取（MessageVO——同一数据源）
```

## 相关文档

- [Agent 执行循环](agent-loop.md)
- [LLM 层](llm-layer.md)
- [提示词模块系统](prompt-system.md)
- [数据模型](data-model.md)
- [事件推送协议](event-system.md)
- [安全模型](security.md)
