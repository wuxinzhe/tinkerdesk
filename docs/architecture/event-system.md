# 事件推送协议

所有 main → renderer 事件统一走**单通道**：IPC `agent:message`——消息格式 `{ route, sessionId, data }`——route = **两级**（`'{一级路由}:{二级type}'` 单字段）。

## 通道

```
IPC_MESSAGE = 'agent:message'（preload 暴露 window.api.onMessage）
```

## Route 两级（一级路由 = 业务域）

| 一级 | 二级 | data | 说明 |
|:--|:--|:--|:--|
| chat | token | `{ chunks }` | 流式 token 批次 |
| chat | approval | ApprovalRequest | 工具审批请求 |
| chat | clarify | ClarifyRequest | 澄清确认请求 |
| chat | interaction_status | 状态 | 交互状态（pending/approved/...） |
| session | stats | SessionStats | 会话统计 |
| session | complete | MessageVO | 回合完成（最终消息） |
| session | title | 标题 | 会话标题生成 |
| session | budget | `{ remainingTokens, ... }` | 剩余 token 预算 |
| action | tool_start / tool_done | `{ toolName, toolCallId }` | 工具执行开始/完成 |
| tip | queued / working | 文本 | 提示（排队/长任务工作提示） |
| error | agent_error | 错误 | Agent 执行错误 |

客户端（chat-store）按 `route.split(':')` 解析一级 → 路由到各 handler——View → Store → API 单向依赖。

## 发送端（EventSenderService）

```
sendToken(sessionId, chunk)     → chat:token（流式）
sendAction(sessionId, evt, payload) → action:tool_start / tool_done
sendTips / sendError / sendSessionStats / sendTitle / sendBudget ...
全部经 webContents.send('agent:message', { route, sessionId, data })
```

## 对应 IPC 请求面（renderer → main）

| 频道 | 说明 |
|:--|:--|
| agent:chat | 发消息（返回 MessageVO + onToken 回调） |
| agent:toolResult | 异步工具结果提交 |
| agent:approval / agent:autoApprove | 审批响应 / 自动审批 |
| agent:interrupt / agent:interruptNoPending | 打断 / 无挂起打断（VAD 语音） |
| agent:revoke / agent:clearAll | 撤回消息 / 清空会话状态 |

## 事件埋点（agent_events 表——追溯用）

与推送协议不同维度：事件表是**落库留底**（审计轨迹——六域事件）——推送是**实时 UI**。两者互补：
- 推送：驱动前端渲染（毫秒级——不落库）
- 事件表：事后追溯（异步队列批量落库——环形上限）

## 相关文档

- [数据模型](data-model.md)
- [Agent 执行循环](agent-loop.md)
