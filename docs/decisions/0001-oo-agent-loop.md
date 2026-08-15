# ADR-0001: Agent 循环 OO 化

- 状态：已实施（2026-08）
- 日期：2026-08-08

## 背景

Agent 执行层最初是"无状态函数 + 闭包"形态（agentLoop 大函数）——每轮对话的状态散在参数与闭包中，中断/审批/工具异步恢复等横切逻辑难以组织，可测试性差。

## 决策

重构为实例化形态：

```
TinkerAgent（聚合根——一个实例服务一个会话）
  ├─ SessionRuntime（会话级活跃状态：队列/中断控制/pending）
  ├─ ApprovalManager（审批挂起/工具结果等待/autoApprove）
  └─ 每轮 new Conversation（一轮对话的状态 = 实例字段——run() 返回即弃）
        ├─ ToolCallExecutor（无状态——工具执行链）
        └─ BusyMode 策略（queue/redirect/interrupt——策略模式）
```

身份（sessionId/profile）向下传递——每会话实例 + dispose 幂等。

## 理由

- 状态显式（实例字段）——生命周期清晰（一轮/一会话）
- 中断/redirect 竞态统一处理（abort + pending——不再散在闭包）
- 可测试（每组件可单测——注入 deps）

## 影响

- loop/ 从函数式改为类——调用方（controller）只面对 TinkerAgent
- 配置在对话开始前一次性装载（SessionContext）——贯穿周期

## 相关

- [Agent 执行循环](../architecture/agent-loop.md)
