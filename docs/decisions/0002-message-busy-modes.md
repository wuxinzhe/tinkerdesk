# ADR-0002: 忙碌三模式（queue / redirect / interrupt）

- 状态：已实施（2026-08）
- 日期：2026-08-13

## 背景

Agent 执行中用户发新消息——行为不明确（曾经是静默排队/或直接冲突）。用户语音场景（VAD）更需要可预测的打断语义。

## 决策

per-agent 配置 `messageBusyMode`——三模式策略（BusyMode 策略模式——`core/loop/strategies/`）：

```
queue（默认）   新消息入队——当前回合正常跑完——再消费
redirect        挂起修正 + abort（只断 LLM 流——工具执行中不 abort——
                等安全边界）→ 注入修正 → 重建 abort → 继续循环重试
interrupt       打断当前回合（LLM 流立即 abort；工具执行中标记——
                工具跑完在安全边界退出）——新消息作为新回合处理
                退出前 flush 内存消息（否则新回合读历史丢消息）
```

补充机制：

```
- pendingInterrupt / pendingRedirect / pendingBarge（VAD 语音打断）——
  SessionRuntime 持有——回合退出后兑现
- 工具执行中不 abort（setExecutingTools 标记——避免打断工具破坏状态）
- redirect 剥离 reasoning（注入时）；interrupt 退出 flush
- 打断按钮仅 queue 模式显示（语音按住不打断——VAD 细节见语音方案）
```

## 理由

- 三模式覆盖真实交互：排队（长任务）、修正（跑偏）、打断（插话）
- 工具安全边界（不杀工具）避免半执行状态
- 策略模式——新增模式不改循环代码

## 影响

- TinkerAgent.chat 入口按模式分流（redirect/interrupt 挂 pending——不入队——避免重复处理）
- 前端按模式渲染提示（EVT_TIP_QUEUED 等）

## 相关

- [Agent 执行循环](../architecture/agent-loop.md)
- [聊天基础](../user/chat-basics.md)
