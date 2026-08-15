# ADR-0003: 事件埋点（agent_events 表）

- 状态：已实施（2026-08-14）
- 日期：2026-08-14

## 背景

Agent 执行是黑盒——出问题只能翻日志文件（非结构化、难关联）。目标：**执行过程透明可追溯**——一段时间内的完整审计轨迹——遇问题快速定位。

## 决策

独立事件表 `agent_events`（8 列）+ EventRecorder 服务：

```
agent_events：id / session_id / conversation_id / seq / event_type /
              event_name / payload(JSON) / latency_ms / created_at
索引：(session_id, seq) + (event_type, event_name)

EventRecorder：异步队列（record() 入队 <1ms——主链路不碰 DB）
  → 200ms / 50 条批量 INSERT（单事务——严格顺序）
  → before-quit flushSync（正常退出不丢）
  → 环形清理（maxRows 默认 50000——超了删最旧）

事件类型（六域 + error）：
  conversation: turn_start / turn_end / redirect / abort
  llm:          request / response / retry / fallback / error
  stream:       chunk（逐 chunk 留底——text/reasoning/args/finishReason）
  tool:         call / approval / result / error
  message:      saved
  interaction:  voice_stt / voice_barge
  error:        llm_error / tool_error / system_error（全局异常）
```

配置：app_settings（`agentEvents.enabled` 默认开 / `agentEvents.maxRows` 50000）。

## 理由

- **完整留底**（参考 dsh 逐 chunk 记录）——膨胀靠环形总量解决（一段时间内可追溯——非永久）
- 异步 + 批量 + append-only + WAL——单机 SQLite 打不爆（写余量 100 倍）
- 正常链路 + 异常链路全覆盖——排查一条 SQL 看完整时间线
- 与推送协议互补：事件表 = 落库留底（追溯）——推送 = 实时 UI（不落库）

## 影响

- 六域埋点遍布执行链路（conversation/llm-router/event-sender/tool-executor/message-service/voice）
- system.error 挂到 safeError（全局异常也进表）
- 消息内容重复等疑难问题：stream.chunk + llm.response.text 对照定位

## 相关

- [数据模型](../architecture/data-model.md)
- [事件推送协议](../architecture/event-system.md)
- [故障排查](../user/troubleshooting.md)
