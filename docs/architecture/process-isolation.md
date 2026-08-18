# Agent 进程隔离（B 方案）

> **状态**：设计定稿（未实施）｜**范围**：每会话独立进程运行 AgentLoop，对齐 dsh 的进程隔离｜**目标**：多 profile/会话并发时互不阻塞、崩溃互不影响。

## 背景与动机

当前工具调用与 AgentLoop 都在 **Electron 主进程单线程** 内同步 `await`。多 profile/会话并发时：
- **async 工具**（终端子进程 / 网络 / 异步文件）不阻塞——事件循环让出，两个会话可并行推进；
- **同步 CPU 密集工具**（大文件 patch、`execSync`、耗时同步逻辑）会**霸占主线程**——另一会话的 AgentLoop、LLM 流式、renderer 消息**全部卡住**。

**参考**：dsh（DeepSeek Harness）工具/代码执行委托独立 `worker_thread` / `subprocess` / E2B 沙盒子进程，多 agent（GRID）进程级隔离；Hermes 每个工具发到独立 `ThreadPoolExecutor` 线程。本方案取 dsh 的**进程隔离**路线（用户已选 B）。

## 一、架构总览

```
┌─────────────────────────── 主进程（Electron main）───────────────────────────┐
│  Renderer 桥接（ws/HTTP）   ·   AgentWorkerHost（进程池管理）   ·   审批协调   │
│  Repository / SQLite（唯一写入者）  ·  ProviderCenter（设备/生命周期/voice）  │
└──────────────────────────────▲──────────────────────────────▲──────────────┘
                        IPC (utilityProcess / MessagePort)      │
   ┌──────────────────────────┘                                │
   │  每个活跃会话 = 一个隔离 AgentWorker 进程                   │
   ▼                                                            │
┌───────────────────────── AgentWorker<profile>────────────────┐ │
│  SessionContext / Conversation（AgentLoop）                   │ │
│  llmRouter（流式）· ToolCallExecutor · TinkerAgent · prompt   │ │
│  ToolManager / 工具执行（terminal 子进程 / file / web）        │ │
└──────────────────────────────────────────────────────────────┘ │
   Worker 经 IPC 向主进程请求：DB 读写 / 审批 / Provider 调用 ────┘
```

**核心转移**：AgentLoop（conversation 主循环）、工具执行、LLM 路由、prompt 构建**全部搬进 worker 进程**。主进程只保留四样：**路由桥接、代理进程生命周期管理、DB（唯一写入者）、审批 / Provider 协调**。

## 二、进程选择：`utilityProcess.fork`

Electron 主进程内的 child process：
- 独立 Node 进程、可 `postMessage` 双向 IPC；
- 官方支持 nodeIntegration 的脚本入口（复用构建输出，`process.parentPort` 通信）；
- 比裸 `child_process.fork` 更贴近 Electron。

**每个活跃会话 spawn 一个**。

## 三、隔离粒度：session 粒度

- 「同时与两个 profile 对话」→ 两个会话两个进程，**真不互相卡**；
- 同一 profile 连续开两窗口 = 两个进程（state 各自隔离）；
- 会话关闭/超时（建议 idle 30s）→ 销毁进程释放；
- 崩溃 → 仅重启该会话进程，不伤其他。

> ⚠️ **待拍板**：session 粒度（推荐） vs profile 粒度（每 profile 一进程，进程数少但同 profile 多会话仍共享）。

## 四、职责边界（避免跨进程对象陷阱）

`SessionContext` 里全是**对象引用**（工具句柄、provider、回调）——**不能直接序列化跨进程**。因此拆成「进程内逻辑」+「跨进程 RPC」两层。

### 进程内（私有不跨进程）

- Conversation / TinkerAgent / llmRouter / ToolCallExecutor / prompt-builder
- 工具调用 → 执行（terminal 子进程 = worker 的孙子进程）
- SessionContext 的对象图（不序列化，进程内 new）

### 跨进程 RPC（仅纯 JSON 数据）

| 方向 | 消息 | 说明 |
|---|---|---|
| worker→main | `persist:save{kind,id,data}` | 写消息/会话/tool 记录（主进程 Repository 唯一写入） |
| worker→main | `persist:load{kind,id}` | 读历史 |
| worker→main | `approval:request{id,tool,args}` | 危险工具挂起，等主进程回复 `approval:decide` |
| worker→main | `provider:invoke{providerId,kind,args}` | voice/stt/tts（ProviderCenter 在主进程） |
| worker→main | `chat:stream{chunk}` / `agent:done` / `agent:error` | 流式回 UI |
| main→worker | `agent:prompt{userMsg}` | 新用户消息入口 |
| main→worker | `approval:decide{id,ok}` | 审批结果 → 恢复 waitToolResult |
| main→worker | `cancel{id}` | 中断 |

**审批恢复链**（原 waitToolResult）：危险工具 → worker 内 `waitToolResult` 挂起 → `approval:request` → main → renderer 弹窗 → 用户决定 → main `approval:decide` → worker `waitToolResult.resolve` 恢复/取消。**链路不变，只是跨了进程**。

## 五、持久化：DB 归主进程（唯一写入者）

SQLite 单文件，**主进程独占写**（避免并发写锁竞争）。worker 所有读写走 `persist:*` RPC。渲染层看到的会话/消息一致性由主进程统一保证。

> ⚠️ **待拍板**：DB 归主进程（推荐） vs worker 直连 DB（需额外锁机制）。

## 六、异常与生命周期

- `AgentWorkerHost`：`spawn(profile) → bind IPC → onMessage 路由 → onExit 回收`；同 profile 消息排队，旧会话结束再分发。
- 崩溃自动重启该 profile 的 worker；已 persist 的数据保留，未完成从 DB 恢复提示。
- 启动即 `spawn(default profile)`，避免首消息冷启动延迟。

## 七、改造清单（代码级）

1. **新增 `src/worker/worker-main.ts`**——进程入口：new TinkerAgent/SessionContext/conversation，监听 `process.parentPort`，把 `agent:prompt` 接进 conversation，把流式/审批/持久化经 IPC 发回主进程。
2. **新增 `src/main/core/agent/agent-worker-host.ts`**——主进程侧宿主：spawn/回收/路由/审批 bridge/持久化 proxy/`dispatchToAgent(profile,msg)`。
3. **`index.ts` / controller**——消息入口从"直接调 conversation"改为 `agentWorkerHost.dispatch(profile,msg)`；返回路径从 conversation 回调改为 worker↔main IPC。
4. **`conversation.ts` 重构**——把依赖主进程的回调（持久化/流式/审批/provider）抽成**可注入的 `WorkerRpc` 接口**（主进程内联实现 = 原样；worker 内实现 = IPC 封装）——同一套代码可主进程内跑（降级/调试）也可 worker 跑。
5. **Repository** 暴露读写两个 async RPC 方法（主进程实现，worker 经 IPC 调）。
6. **工厂拆分**：ToolManager / ProviderCenter —— 主进程实例（仅 ProviderCenter）+ worker 实例（工具 + provider-客户端）。
7. **审批**：`ApprovalManager` 决策回调抽成 `ApprovalDecider`（主进程实现 → renderer；worker 实现 → IPC）。
8. **electron.vite / tsconfig**：加 worker 入口的 build target（node / utilityProcess）。

## 八、降级与取舍

- **保留主进程内路径**（`WorkerRpc` 内联实现）——单 profile/低配调试直接主进程跑，不强制 worker（dsh 也有 headless 内跑）。
- **成本最高点**：DB 归主进程后 worker 每次读写有 IPC 往返 → **批量化**（一个 prompt 回合攒批写，非逐条）——需注意性能。
- **工具状态跨进程隔离**（terminal session 等）——换进程即丢，属预期（隔离换取安全）。
- **Renderer 完全无感**：仍只连 main，main 把 worker 当"远程 agent"，消息协议不变。

## 九、里程碑

1. **M1**：WorkerRpc 抽象改造 conversation（主进程内跑，回归验证 AgentLoop 不变）——纯重构，行为零变。
2. **M2**：utilityProcess + worker-main.ts 跑通最小闭环（spawn→prompt→LLM 流式→UI）。
3. **M3**：持久化 / 审批 / 工具执行跨进程打通。
4. **M4**：进程池生命周期 + 崩溃重启 + 并发多 profile 实测。

## 待拍板

1. 隔离粒度：session vs profile。
2. DB 归属：主进程独占（推荐） vs worker 直连。
3. 降级路径：保留主进程内跑 vs 纯 worker 必跑。

拍板后定稿类签名 + 消息 Schema + 文件清单。
