# TinkerDesk Agent 面向对象化重构技术方案

> 状态：草案（待用户审查）
> 目标：把"服务端无状态式"的 Agent 执行层重构为"面向对象实例化"形态——`new Agent(config, services) → run() → dispose()`，为 delegate 子代理铺路。

---

## 1. 背景与动机

当前执行层是**全局单例 AgentLoop + sessionId 驱动的无状态写法**（从 showing-agent Java 服务端复刻）：

```
AgentLoop（bootstrap 单例，所有会话共用）
├─ queueStore: MessageQueueStore（sessionId → 消息队列 + processing 标志）
├─ abortControllers: Map<sessionId, AbortController>
├─ autoApproveConversations: Map<convId, boolean>
└─ 方法全部带 sessionId/convId 参数（sendChatMessage / interrupt / submitToolResult ...）
```

**问题**：
1. **状态所有权分散**——每个 Map 都是隐式契约（set/delete 配对散在 6+ 处），漏一对 = 常驻泄漏
2. **无状态的价值在客户端不成立**——单用户 1-3 个会话，不需要水平扩展；却付着 Map 管理的认知成本
3. **delegate 子代理无法自然落地**——子代理必须实例隔离，无状态式做子代理要发明"context 树"

**hermes 实证**：AIAgent 就是 `new AIAgent(config)` → `chat()`/`run_conversation()` → 释放，生产验证过完整生态（delegate/cron/多平台）。

## 2. 现状状态挂载点（代码事实）

| 状态 | 位置 | 生命周期 | 清理点 |
|:--|:--|:--|:--|
| 消息队列 | `agent-loop.ts:85` queueStore | 会话级 | clearQueue（中断时） |
| AbortController | `agent-loop.ts:92` Map | 对话级 | 442/569 delete |
| 自动批准标记 | autoApproveConversations | 轮次级 | 655 delete |
| ConversationContext | session-context-factory 构建 | 对话级 | 临时对象，用完即丢 |

## 3. 目标架构

```
Agent（实例——每个会话一个）
├─ 构造：注入 services（llmRouter/toolManager/messageService/sessionService/
│         conversationService/compactionService/promptModuleBuilder/modelConfigService）
│       + config（agentConfig / profile / modelConfigs / 场景模型绑定）
├─ 字段（状态内聚，dispose() 一处清完）：
│     queue: MessageQueueStore（实例级）
│     abortController: AbortController | null
│     autoApproveConversations: Set<convId>
│     sender: IEventSender（实例持有）
├─ 方法：
│     run(userMessage) → 走现有 executeCycle 循环（循环体不动）
│     interrupt() / submitToolResult() / respondApproval()
│     dispose() → 清队列/abort/批准标记（幂等）
└─ 共享：services 仍单例注入（Agent 之间只共享无状态服务，不共享会话状态）
```

**关键决策**：
- **核心循环不重写**——executeCycle/工具/压缩/事件全保留，只改**状态挂载点**（Map → 实例字段）+ **装配方式**（构造注入 vs 传参）
- **IPC 签名不变**——前端零改动。AgentController 内部从"直调单例"改为 `Map<sessionId, Agent>` 寻址，找不到实例时惰性创建（按 session 的 profile/config 装配）
- **AgentLoop 角色变化**：从"执行器单例"变为"装配工厂"（`createAgent(sessionId, profile) → Agent`）+ 保留共享的工厂方法

## 4. 映射表

| 现在（无状态） | 目标（OO） |
|:--|:--|
| `agentLoop.sendChatMessage(sessionId, req)` | `agents.get(sessionId).run(req)`（无实例则 create） |
| `agentLoop.interruptSession(sessionId)` | `agents.get(sessionId)?.interrupt()` |
| `queueStore.enqueue(sessionId, ...)`（单例） | `agent.queue.enqueue(...)`（实例字段） |
| `abortControllers.set/delete` | `agent.abortController`（dispose 清理） |
| `autoApproveConversations.delete(convId)` | `agent.autoApprove.delete(convId)` |
| ConversationContext（factory 构建） | Agent 内部持有（构造时装配） |
| 会话删除（controller clearAll） | `agents.get(sessionId)?.dispose(); agents.delete(sessionId)` |

## 5. delegate 子代理（复用同一 Agent 类）

```
builtin_tinker_delegate 工具（schema + handler）
├─ leaf（默认）：子 Agent 工具集剔除 delegate
├─ orchestrator：保留 delegate（max_spawn_depth 限制）
├─ 装配：new Agent(子代理配置)
│     └─ ephemeralSystemPrompt = 父 persona + delegated_task_context 注入
│     └─ skipMemory = true（子代理不加载记忆）
├─ run(task.goal) → 同步等待 → 收集 JSON 结果
└─ dispose()（结束即释放）
```

## 6. 分阶段实施

| 阶段 | 内容 | 验证 |
|:--|:--|:--|
| P1 | Agent 类 + 状态迁移（queue/abort/autoApprove → 实例字段） | `tsc` 0 + 发送/中断/审批回归 |
| P2 | AgentController 实例寻址（Map<sessionId, Agent> + 惰性创建 + dispose） | IPC 全链路回归（前端零改动） |
| P3 | delegate 工具（leaf/orchestrator + depth 限制） | 子代理实测：单任务/批量/嵌套 |

## 7. 风险与对策

| 风险 | 对策 |
|:--|:--|
| 多会话并发（客户端 1-3 会话） | 实例独立队列/abort，互不干扰；services 共享无状态 |
| IPC 语义变化 | 签名完全不变，只改 controller 内部寻址；逐 IPC 实测 |
| 会话删除泄漏 | dispose() 幂等 + controller 统一清理；clearAll 覆盖 |
| 热更新配置 | Agent 实例化时快照 config；改配置后下次 run 重建（符合客户端语义） |

## 8. 实测清单（P1/P2 完成后）

- [ ] 发送消息（流式 token 正常、工具调用、统计落库）
- [ ] 中断对话（abort 生效、队列清理）
- [ ] 审批流（风险工具 ASK/DENY）
- [ ] 多会话并发（A 会话流式中切 B 会话发消息）
- [ ] 上下文压缩触发（会话内长对话）
- [ ] 会话删除/清空（实例释放、无残留）
- [ ] 数据面板（每轮 stats 事件照常）
