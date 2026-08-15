# TinkerDesk Agent 推送事件协议

> 状态：定稿（2026-08）
> 范围：main → renderer 的所有推送消息（IPC 通道 `agent:message`）

---

## 1. 背景与演进

| 阶段 | 形态 | 问题 |
|:--|:--|:--|
| Java showing-agent | STOMP 单队列 `/queue/messages` + EventEnvelope `{event, sessionId, payload{type, data}}` 两级 | —（服务端基准） |
| TinkerDesk 早期 | 4 个 IPC 通道（agent:token / agent:action / agent:queueTip / agent:approvalRequest） | 通道名即协议——两套事件名并存 |
| 统一过渡 | 单通道 IPC_MESSAGE + `{type: EVT_*, data, sessionId}` | 丢了一级路由（业务域）——type 大杂烩 |
| **定稿（本文）** | 单通道 + **单字段两级路由** `{一级}:{二级}` | 业务域清晰 + 协议对齐 Java |

## 2. 协议结构

```
IPC 通道：agent:message（IPC_MESSAGE——传输层单一出口）
消息体：
  {
    route: 'chat:token',        // 单字段两级（可变深度——未来三级直接追加 ':{三级}'）
    sessionId: 'xxx',
    data: ...                    // 业务数据（chat/action 是对象；tip/error 是消息字符串）
  }

客户端解析：
  const parts = route.split(':')
  parts[0] 一级路由（业务域）→ 分发到 5 类 handler
  parts[1] 二级 type → 各类内细分
  parts[2] 三级（未来，按需取）
```

## 3. 一级路由（业务域划分）

| 一级路由 | 业务域 | 原则 |
|:--|:--|:--|
| `chat` | 对话内容流 | 对话内的消息/交互卡片（token、审批、澄清、卡片状态） |
| `session` | 会话数据/状态 | 会话级统计与元数据（面板、标题、上下文预算） |
| `action` | 行为动作（兜底） | 工具执行行为（开始/完成） |
| `tip` | 提示信息 | 轻提示（入队、工作中） |
| `error` | 报错 | 错误信号 |

> thinking 已取消（推理内容由 `chat:token` 的 reasoning 字段承载）。
> action 是兜底域——太零碎或暂不必要独立归类的动作放这里；未来事件增多可按域再拆（如 `tool`）。

## 4. 路由场景表（定稿）

### chat（对话内容流）
| 二级 type | 完整 route | data | 消费端 |
|:--|:--|:--|:--|
| `token` | `chat:token` | StreamToken（text/reasoning/toolCallArgs/isFinish） | 流式渲染 + 思考气泡 + 工具参数合并 |
| `approval` | `chat:approval` | {toolCallId, name, arguments, reason, conversationId} | 审批卡片 |
| `clarify` | `chat:clarify` | {toolCallId, name, arguments} | ClarifyCard |
| `interaction_status` | `chat:interaction_status` | {toolCallId, interactionStatus, content, messageType} | 审批/工具卡片状态（超时——main 控制） |

### session（会话数据/状态）
| 二级 type | 完整 route | data | 消费端 |
|:--|:--|:--|:--|
| `stats` | `session:stats` | statsData（model/promptTokens/hitRate/contextLimit...） | 数据面板实时 |
| `complete` | `session:complete` | statsData（与 stats 同数据） | 面板本轮 + 会话卡片 |
| `title` | `session:title` | {title} | 会话标题 |
| `budget` | `session:budget` | {remainingTokens, contextLimit} | 上下文预算条 |

### action（行为动作）
| 二级 type | 完整 route | data | 消费端 |
|:--|:--|:--|:--|
| `tool_start` | `action:tool_start` | {toolName} | 工具 loading |
| `tool_done` | `action:tool_done` | {toolCallId, toolName, success} | 隐藏 loading |

### tip（提示）
| 二级 type | 完整 route | data | 消费端 |
|:--|:--|:--|:--|
| `queued` | `tip:queued` | "消息已入队" / "对话已中断" | GlobalTipToast |
| `working` | `tip:working` | "⏳ Tinker 工作中…" / "已达最大迭代" | GlobalTipToast |

### error（报错）
| 二级 type | 完整 route | data | 消费端 |
|:--|:--|:--|:--|
| （对话处理异常/连续空响应/errMsg） | `error:*` | 错误文案 | GlobalTipToast（error 样式） |

## 5. 发送端（IEventSender——对齐 Java 5 方法语义）

```ts
interface IEventSender {
  sendMessage(sessionId, type, data): void    // route = 'chat:' + type    （token/approval/clarify/interaction_status）
  sendAction(sessionId, type, data): void     // route = 'action:' + type   （tool_start/tool_done）
  sendSession(sessionId, type, data): void    // route = 'session:' + type  （stats/complete/title/budget）
  sendTips(sessionId, type, message): void    // route = 'tip:' + type      （queued/working）
  sendError(sessionId, type, message): void   // route = 'error:' + type
}
```

## 6. 接收端（preload 分发）

```ts
ipcRenderer.on(IPC_MESSAGE, (_, payload) => {
  const [route1, route2] = payload.route.split(':')
  switch (route1) {
    case 'chat':    onChat(route2, payload); break
    case 'session': onSession(route2, payload); break
    case 'action':  onAction(route2, payload); break
    case 'tip':     onTip(route2, payload); break
    case 'error':   onError(route2, payload); break
  }
})
```

## 7. 扩展规则

- **三级路由**：未来需要时追加 `:{三级}`（如 `chat:tool_call:executing`）——结构不变，客户端按需取 `parts[2]`
- **新增一级路由**：业务域确实独立时新增（如未来 `tool` 域独立出 action）
- **分隔符约定**：每一级的值**禁止包含 `:`**（现有值均为小写连字符）
- **兼容**：route 是协议字符串——新增层级/type 不改传输结构
