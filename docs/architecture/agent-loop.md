# Agent 执行循环

Agent 引擎在 `src/main/core/loop/`——OO 化设计：聚合根 TinkerAgent → 每轮 Conversation → 支撑组件 SessionRuntime / ApprovalManager / ToolCallExecutor / BusyMode 策略。

## 组件总览

| 组件 | 文件 | 职责 |
|:--|:--|:--|
| TinkerAgent | `tinker-agent.ts` | 聚合根——一个实例服务一个会话（sessionId + profile 绑定）——消息入口 + 处理循环 |
| Conversation | `conversation.ts` | 一轮对话（turn）——run() 调度 + 响应分支策略 |
| SessionRuntime | `session-runtime.ts` | 会话级活跃状态：消息队列 / abort 控制 / pending（redirect/interrupt/barge）/ 工具执行标记 |
| ApprovalManager | `approval-manager.ts` | 审批挂起（requestApproval / waitToolResult / autoApprove——300s 超时） |
| ToolCallExecutor | `tool-call-executor.ts` | 单工具执行链：防护 → 三层门检 → 执行 |
| BusyMode 策略 | `strategies/` | 忙碌时新消息处置（queue 默认 / redirect / interrupt） |

## 消息入口（TinkerAgent.chat）

```
用户消息（agent:chat IPC）→ SessionContextFactory.build（装载 AgentConfig/环境/YOLO/回调）
  → TinkerAgent.chat(ctx, message)
       ├─ 处理中（isProcessing）→ 按忙碌模式：
       │    queue    → 入队（per-session 队列——处理完自动取）
       │    redirect → requestRedirect（挂起修正——回合内注入重试）
       │    interrupt→ requestInterrupt（打断——工具完成后安全边界退出）
       └─ 空闲 → 入队 + processLoop（串行取队列消息，一轮轮处理）
```

processLoop 细节：设 processing 锁 → while：清队检查 → takePendingInterrupt（打断消息优先——不等队列）→ 预算驱动取数 → 合并多条消息 → 起一轮 Conversation.run → 队列空退出。

## 一轮对话（Conversation.run）

```
run(sessionId, profile, ctx, userMessage)
  1. 注册 abort 控制（runtime.setAbort——redirect 竞态窗口统一处理）
  2. 创建 IN_PROGRESS 对话 + 构建 ConversationContext（工具清单 + 全模型配置）
  3. 忙碌模式策略固定（构建时读一次——回合内不变）
  4. 用户消息入暂存 → 上下文加载（摘要+历史+暂存）→ repairMessageSequence 防御修复
  5. 提示词构建（promptModuleBuilder.buildSystemPrompt → system 消息）
  6. while 循环：
       ├─ handleLoopAbort（redirect 注入修正后继续 / interrupt 退出）
       ├─ maxIter 检查（AgentConfig.maxIterations——超了 handleMaxIteration）
       ├─ llmRouter.chat（流式——每 chunk：累计 streamTextAccum + sender.sendToken 推送）
       ├─ tokenAccum 累计（prompt/completion/cacheRead/cacheWrite——会话统计源）
       ├─ emitBudgetUpdate（剩余预算——contextLimit × 0.85 - promptTokens）
       └─ 响应分支（按 resType 策略化 dispatch）：
            text      → handleText：保存 assistant 文本 → 压缩检查 → finishCycle
            tool_calls → handleToolCalls：保存 → 工具执行 → 回填上下文 → 继续循环
            reasoning → handleReasoning：纯推理（thinking prefilling）→ 继续
            truncated → handleTruncated：截断处置
            empty     → handleEmpty：空响应重试（emptyRetry 计数）
            overflow  → handleOverflowResponse：上下文溢出 → 压缩
            error     → handleError：错误 → 结束
  7. finishCycle：flush 落库 + usage 统计 + turn_end 事件 + 标题生成 + 压缩检查
```

## 工具执行链（ToolCallExecutor.execute）

```
guardrail.beforeCall（循环防护——相同工具+参数连续失败/无进展检测）
  → ① 灾难检查（CATASTROPHIC——rm -rf 等）→ DENY（绝对不执行——不进审批）
  → ② 授权检查（tool-auth-service——危险参数模式）→ ASK → ApprovalManager.requestApproval
  → ③ 沙盒检查（sandbox-whitelist——URL/路径白名单）→ ASK → 审批（批准自动加白名单）
  → 审批拒绝 → APPROVAL_REJECTED 返回
  → 执行（本地执行器 / MCP 转发）→ guardrail.afterCall（记录结果）
  → 缓存失效（skill_manage/memory 等影响 prompt 缓存的工具）
```

工具执行期间 `runtime.setExecutingTools(true)`——redirect/interrupt 策略据此决定 abort 时机（**不杀工具**——等安全边界）；工具完成后的 pendingInterrupt/pendingBarge 在此兑现（abort.abort()——下个迭代退出）。

## 忙碌三模式（BusyMode 策略）

| 模式 | 行为 | 实现 |
|:--|:--|:--|
| queue（默认） | 新消息入队——当前回合正常跑完再消费 | `queue-strategy.ts`——loop 不主动 abort |
| redirect | 挂起修正 + abort（只断 LLM 流）→ 注入修正 → 重建 abort → 继续循环重试 | `redirect-strategy.ts`——工具执行中不 abort |
| interrupt | 打断当前回合——LLM 流立即 abort / 工具执行中标记——安全边界退出——新消息作为新回合处理 | `interrupt-strategy.ts`——退出前 flush 内存消息 |

## 审批模型（ApprovalManager）

```
requestApproval(convCtx, toolCall, reason) → 挂起（approvalWaiters——300s 超时）
  → 前端 ApprovalCard 渲染 → 用户响应（agent:approval IPC）
  → 响应 → resolve waiter → 工具继续执行
autoApprove（agent:autoApprove IPC）→ 按 convId 记入 autoApprove 集合（后续自动通过）
异步工具（isAsync）：waitToolResult——外部工具结果经 agent:toolResult IPC 恢复
```

## 事件埋点（事件表——审计轨迹）

每轮产生的事件链（`agent_events` 表——异步队列批量落库）：

```
conversation.turn_start（回合开始）→ llm.request/response（每次模型调用）
  → stream.chunk（逐 chunk 留底——text/reasoning/args）→ tool.call/approval/result
  → message.saved（消息产生）→ conversation.turn_end（回合结束——含原因/耗时/迭代数）
异常：llm.error / tool.error / system.error（uncaught/unhandledRejection）
```

## 相关文档

- [架构总览](overview.md)
- [LLM 层](llm-layer.md)
- [事件推送协议](../architecture/event-system.md)
- [安全模型](security.md)
