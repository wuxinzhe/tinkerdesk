# deepseek-harness × TinkerDesk 架构对比

> 2026-08-13 通读对比（3 路并行子代理通读 deepseek-harness 源码——核心架构/能力包/应用层）。
> deepseek-harness：DeepSeek 插件化 Agent harness（一切皆插件——Cordis 基座——238 workspace——dsh cli + web 客户端）。
> TinkerDesk：本地 Electron 桌面 Agent 客户端（Vue3 + electron-vite——核心循环 + 工具系统 + 插件起步）。

## 一、定位与哲学

| | deepseek-harness | TinkerDesk |
|---|---|---|
| 定位 | Agent **harness**（框架——无特权核心——一切皆插件） | Agent **客户端**（产品——核心循环硬编码——插件化起步） |
| 基座 | Cordis 插件框架（类 Koishi DI）——Service/事件/Effect | 单体（core/loop 硬编码 + Service 互注 + Provider 三系起步） |
| 分发 | profile + bundle + patch 分层（行级覆盖——`--dump-config`） | 单体仓库 + 插件目录（manifest + 内置插件） |
| 客户端形态 | web（127.0.0.1:3080）+ CLI | Electron 桌面（原生——文件/系统集成） |

**TinkerDesk 的优势**：桌面原生（文件系统/麦克风/系统集成——VAD 语音打断是 harness 没有的）、本地 SQLite、面向普通人开箱即用。
**harness 的优势**：架构纯度（插件化/事件化/可替换 seam）——重构参考价值高。

## 二、会话模型（最大差距）

```
harness：append-only 事件日志（Session.append——lossless JSON + deep-freeze）
  → 模型历史 = surface 派生投影（deriveMessages——O(新节点) 增量）
  → 免费获得：replay / fork / compaction / UI 保真 / "model-visible means logged"
  → inbox（next-turn/next-step）也持久化为事件——重启重建

TinkerDesk：messages 表（普通存储）——tempMessages 内存缓冲 + flush
  → 无事件溯源——replay/checkpoint 无——历史只能按行重放
  → pendingRedirect/pendingInterrupt 在内存（重启丢）
```

**借鉴优先级 P0**：消息存储改"事件日志 + 派生历史"——replay/compaction/中断恢复全免费——这是 harness 架构上最大的亮点。

## 三、agent-loop 对比

| 维度 | harness | TinkerDesk |
|---|---|---|
| 回合语义 | turn = 多 step；step = 一次模型请求+工具；`turn/end` 带原因（completed/aborted/blocked/error/max-tokens/interrupted） | conversation.run 循环（while + handleLoopAbort）——忙碌三态策略（queue/redirect/interrupt） |
| 输入通道 | inbox 三通道：followup（next-turn+唤醒）/ steer（next-step+唤醒）/ inject（next-step 不唤醒） | chat 入口 + pendingRedirect/pendingInterrupt/pendingBarge |
| 中断 | cancel(cause) + wakeRequested latch——abort 后唤醒重放 | abort + 忙碌模式策略（redirect 注入/interrupt 新回合）——barge 打断 |
| 流式 | `assistant/chunk` 事件 + BlockAssembler——UI 保真 | 流式 token 事件（content/reasoning 三段） |
| 并发工具 | isConcurrencySafe 分类 + staged 调度（prepare→dispatch→finalize）——并行有界池——结果按模型序提交 | 串行（handleToolCalls for 循环）——delegate 内部并发 3 |

**TinkerDesk 特有的强项**：忙碌模式三态（queue/redirect/interrupt——harness 没有等价物——它只有 cancel）。redirect 注入修正重试 + VAD barge 打断是 TinkerDesk 独有的交互设计。

## 四、工具系统

```
harness：ToolDefinition（强制 output schema/render/presentCall/presentResult）
  → guard(fn) monotonic 门检（不能 force-allow 已拒）
  → 三 waterfall 管线（tools/pre-execute / execute / post-execute）
  → 审批 = 可选 seam（ctx.get('approval') 缺席降级 deny）
  → scope 机制（global 层 + per-agent 层——restrict 交集）
  → code mode（全部折叠 run_code + SDK 提示节）

TinkerDesk：BaseTool/ToolManager + ToolCallExecutor（guardrail 门检 +
  三层安全检查（灾难 DENY/风险 ASK/沙箱 ASK） + 审批）
  → 无 waterfall 事件（硬编码调用链）
  → 无 isConcurrencySafe（工具串行）
  → 无 scope 分层（per-agent 工具集靠配置）
```

**借鉴 P1**：① 工具执行管线事件化（pre-tool 审批/门检瀑布——解耦）② 工具并行调度（staged + 并发安全分类）。

## 五、子代理（delegate）

```
harness：SubagentRuntime（provider 注册——spawn 零上下文 / fork 继承父日志）
  → 隔离核心：child 自己 Cordis scope + approval 'never'（子不可审批）+
    沙箱策略下沉到子会话日志（source:'delegation'）+ 固定 delegation context 语句
  → result 永不 reject（stopReason 分类）——interrupt 传播（continuation manager——
    keepInbox——冷恢复）
  → fail-loud 能力声明（UNSUPPORTED_CAPABILITY 绝不接受后忽略）

TinkerDesk：delegate 工具（同步 await——已加并发 3/中断传播/心跳）
  → 子代理独立会话 + ephemeral prompt + MAX_DEPTH=1
  → 中断传播（父 abort → child.interrupt）已落地
```

**借鉴 P1**：子代理策略下沉（approval never + 沙箱策略写日志）+ fork 继承（父日志平衡前缀作 seed——比"零上下文"更适合接力任务）。

## 六、安全/沙箱（harness 强项）

```
harness：SandboxProvider.confine（fail-closed——无后端抛错绝不静默放行）
  → Linux bwrap + Landlock；macOS Seatbelt；Windows WRITE_RESTRICTED restricted token
    （CreateRestrictedToken——写权限交集检查——workspace 确定性 SID——temp 每会话独立）
  → 拒绝分类（denialSignatures 方言 + runnerFailureRules——区分"被拒"vs"没起来"）
  → 升级纪律（同命令只允许一次 sandbox_permissions+justification 重试）

TinkerDesk：三层审批（灾难 DENY/风险 ASK/沙箱 ASK + 白名单）——逻辑沙箱
  → 无 OS 级沙箱（子进程全权限——依赖审批拦截）
```

**借鉴 P2**：Windows ACL restricted token 沙箱（子进程真降权——比审批拦截强一层）。

## 七、UI 架构

```
harness：React + 插件图（ui-* 独立 npm 包——host yml 声明名单）
  → Slot 系统（single/list/keyed/chain——chain 按 priority 路由——
    overlay 保草稿状态）——UI 组件也可插拔
  → 数据层裸 observable（zustand/vanilla + immer + rAF 批量）——
    React 侧唯一 hook 构造器（useSyncExternalStoreWithSelector）

TinkerDesk：Vue3 + stores（chat/session/agent）——L3 三层导航——
  组件直接 props/store 绑定——输入方式抽屉/VAD 波形等自绘
  → 无插槽系统（组件固定装配）
```

**借鉴 P2**：composer 等关键位的 chain 插槽（多实现按优先级路由——overlay 保状态）。

## 八、通信/API 层

```
harness：四象限 RPC（ClientRequest/ServerResponse/ServerRequest/ClientResponse）
  → 物理信道解耦（web=HTTP POST + 双 WS downlink；Electron=IPC bridge）
  → RpcMethodMap 单一事实源（56 方法——加方法=一行 map）
  → Typert 类型图生成器（TS Analyzer → 跨包模型 → host/client 双侧 dts）
  → 信任栅栏（/api Host 白名单 + PRIVILEGED_METHODS 钉死 loopback）

TinkerDesk：Electron IPC（preload/controller——handleTrusted）——本地单客户端
  → 简单直接——够用——无多客户端需求
```

**TinkerDesk 无需对齐**（本地单客户端——IPC 已够）。Typert 的价值在多客户端场景。

## 九、配置

```
harness：profile/bundle/cordis.patch.yml/--patch 四层补丁（行级 id 覆盖——
  structuredClone 防引用别名——dump-config 无 boot 诊断）

TinkerDesk：application.yml（环境变量注入 ${KEY:默认}）+ agent_configs 表
  + 前端 localStorage（会话级偏好）——简单直接
```

**TinkerDesk 的配置哲学（环境变量 + 简单分层）对普通用户更友好**——harness 的四层补丁是插件生态需求。

## 十、TinkerDesk 可借鉴清单（按优先级）

```
P0（架构级——价值最高）：
  ① 事件溯源会话：消息存储改 append-only 事件日志 + surface 派生历史
     —— replay/compaction/中断恢复/UI 保真全免费（大改——需规划）

P1（中等——直接收益）：
  ② 工具执行管线事件化（pre-tool 审批/门检瀑布——解耦硬编码调用链）
  ③ 工具并行调度（isConcurrencySafe 分类 + staged prepare/dispatch/finalize）
  ④ 子代理策略下沉（approval never + 策略写入子会话日志——可重建）

P2（增强）：
  ⑤ skill 分层（项目>用户>bundled + watch 失效 + fs/observed 联动）
  ⑥ OS 级沙箱（Windows ACL restricted token——子进程真降权）
  ⑦ UI chain 插槽（composer 可插拔——overlay 保状态）

P3（暂不需要）：
  ⑧ Typert 类型化 RPC（多客户端才需要——本地 IPC 够用）
  ⑨ 四层补丁配置（插件生态需求——当前配置哲学已够）
```

## 十一、TinkerDesk 独有（harness 没有的）

```
① 忙碌模式三态（queue/redirect/interrupt）——消息分发策略——harness 只有 cancel
② VAD 语音打断 + 持续输入（barge-in——本地麦克风）
③ 三层审批 UX（灾难/风险/沙箱——面向普通人）
④ Electron 桌面原生（文件/系统集成——harness 是 web/CLI）
⑤ api_content/content 字段级分离（显示与 LLM 上下文分离）
```

## 结论

```
架构上 harness 更"纯"（插件化/事件化/可替换 seam）——是重构参考样板；
产品上 TinkerDesk 更"实"（桌面原生/语音/审批 UX/忙碌模式——面向普通人）。
最大借鉴价值：事件溯源会话（P0）——其余按需。
```
