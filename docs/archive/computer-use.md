# computer_use 移植文档（架构案例）

> 桌面后台控制工具——把外部 MCP 服务封装为内建工具的**架构案例**。
> 未来遇到"外部能力是 MCP 服务但需要封装语义"的工具时，照此模式做。

## 背景

TinkerDesk 移植 hermes 的 `computer_use` 工具（功能 1:1）：后台驱动桌面——截图、鼠标、键盘、滚动、拖拽——不抢用户光标/键盘焦点。

- **后端**：`cua-driver`（trycua 项目——Rust 实现——macOS/Windows/Linux）——本身是 **MCP 服务器**（`cua-driver mcp` stdio 传输——55 个裸工具）
- **前端**：`computer_use` 内建工具（24 个 action 语义封装）

## 架构（核心案例）

```
cua-driver（外部程序——MCP 服务器，55 个裸工具：click/type_text/list_apps/start_recording...）
    ↑ 按需 spawn（CuaDriverClient = StdioTransport 薄封装）
    │
computer_use（内建工具——工具池注册的是它）
    ├─ action 分发（24 个：capture/click/type/key/scroll/drag/wait/list/focus/browser 系列）
    ├─ 安全门检（危险按键组合/危险文本——硬封锁）
    ├─ action 级审批（capture 免费 / destructive ASK）
    └─ 结果格式化（AX 树截断/SOM 编号）
```

### 关键决策：封装而非裸 MCP 注册

**问题**：cua-driver 是 MCP 服务——为什么不注册进 MCP 服务器列表（mcp-tool-center），让 55 个工具直接暴露？

**答案**（三条理由——通用决策依据）：

1. **token 成本**：55 个裸工具（含 `start_recording`/`replay_trajectory`/`install_ffmpeg` 等无关工具）全进 prompt——模型每轮付 token。封装成 1 个工具（24 action 一个 schema）成本低得多。
2. **安全门检**：裸暴露后模型可直接调 `click`/`type_text` **无需审批**——危险。封装后 action 级门检：capture 免费、click 走审批、危险组合硬封锁。
3. **语义封装**：capture 不是 cua-driver 的单个工具（是 list_windows + get_window_state 组合 + 窗口解析 + AX 树截断）；click 的 element 索引（SOM）依赖 capture 的编号上下文。裸工具没有这层语义。

**hermes 同款设计**：hermes 也没把 cua-driver 注册为裸 MCP——而是用 Python mcp SDK 封装成 1 个 computer_use 工具。

### 复用而非重写

- **复用**：`StdioTransport`（tinkerdesk 已有 MCP stdio 传输——JSON-RPC 通信）——CuaDriverClient 是它的薄封装（路径解析 + start_session 会话态 + 工具名缓存）
- **不写**：JSON-RPC/握手/超时/缓冲（StdioTransport 已有）
- **不进**：mcp-tool-center（MCP 服务器管理列表）——cua-driver 是 computer_use 内部按需 spawn 的

## 文件结构

```
src/main/tools/computer-use/
  ├─ cua-driver-client.ts      CuaDriverClient（StdioTransport 薄封装——spawn/会话/工具名缓存）
  ├─ schema.ts                 24 action 常量 + 安全模型（BLOCKED combos/patterns + SAFE/DESTRUCTIVE）
  └─ computer-use-tool.ts      ComputerUseTool（BaseTool——action 分发 + 门检 + 结果格式化）
src/main/resources/tool-schemas/computer_use.hbs   工具 schema（JSON）
```

## 安全模型（与 hermes 1:1）

| 层 | 内容 | tinkerdesk 映射 |
|:--|:--|:--|
| SAFE_ACTIONS | capture/wait/list_apps/list_windows/cua_browser_state | **免费**（ToolAuthService ALLOW） |
| DESTRUCTIVE_ACTIONS | click/type/key/drag/scroll/set_value/focus_app/browser 系列 | **ASK**（审批三层——ToolAuthService → ApprovalManager） |
| BLOCKED_KEY_COMBOS | cmd+shift+backspace（清废纸篓）/cmd+ctrl+q（锁屏）/cmd+shift+q（登出）/win+l/ctrl+alt+delete/alt+f4 | **DENY**（硬封锁——工具内 + ToolAuthService 双保险） |
| BLOCKED_TYPE_PATTERNS | curl\|bash / sudo rm -rf / fork bomb | **DENY** |

- 门检位置：**ToolAuthService.check**（按 args.action 判定——`checkComputerUse`）+ **工具内部**（execute 入口双保险）

## 关键实现细节（踩坑记录）

1. **capture 不是单工具**：`get_window_state`（新驱动把截图折叠进来；老驱动用 `screenshot`）——需要先 `list_windows` 解析 pid/window_id——**跳过 cua-driver 自身窗口**（拒绝操作自己的授权进程）
2. **wait 不是 cua-driver 工具**：hermes 是 `time.sleep`——tinkerdesk 用 TS `setTimeout`（不调 cua-driver）
3. **浏览器工具名**：`browser_state` → `get_browser_state`（MCP 实际工具名）
4. **list_windows 解析**：宽松逐行正则（`pid\s+(\d+)` + `window_id:\s*(\d+)`）——格式有变体，严格正则会错位
5. **图像不返回**：当前主模型无视觉——capture 的 398KB base64 撑爆上下文——只返回 AX 树（含 [N] 编号可点击）——未来接视觉模型时按 supportsVision 返回 image_data_url
6. **路径解析**：cua-driver 不在系统 PATH（桌面应用启动的 shell PATH 窄）——resolveCuaDriverCmd 兜底官方安装目录（`%LOCALAPPDATA%\Programs\Cua\cua-driver\bin\`）

## 安装

```powershell
# Windows（cua-driver 官方安装）
irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex
```

安装后 `cua-driver mcp` 在 PATH（或官方目录）——computer_use 的 `check()` 自动检测，未装则不入工具池。

## 已知限制

- deepseek-v4-flash 等文本模型**不主动选 computer_use**（工具 40+ 参数——模型偏好小工具）——非 bug——工具已注册可用
- destructive action 实测需审批（用户点审批卡片）
- capture 图像返回（视觉模型）待接入
- 权限模式：cua-driver standard（默认——promptless 自动化）——bounded/unrestricted 需显式配置

## 未来类似工具的接入模式（案例通用化）

当外部能力是 MCP 服务但需要封装语义时：

```
1. 写封装工具（BaseTool）——action 语义 + 安全门检 + 审批接入 + 结果格式化
2. 写轻客户端（薄封装 StdioTransport）——路径解析 + 会话态 + 能力探测
3. 注册进 builtin 池（check() 检测外部依赖——未装不入池）
4. 不进 mcp-tool-center（裸暴露危险/费 token）——除非工具本身无封装需求
```

判断裸注册 vs 封装的标准：**裸工具是否有安全/审批/语义封装需求**——有 → 封装；纯读取无副作用 → 可裸注册。
