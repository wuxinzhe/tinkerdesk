# TinkerDesk

> 本地优先的桌面 AI Agent——像跟人聊天一样让 AI 帮你干活。

TinkerDesk 是一个运行在桌面的 AI 助手客户端：聊天、语音、工具调用、技能与插件——Agent 不再只是聊天框，而是能真正操作你电脑的助手（终端、文件、搜索、网页、语音……）。所有执行过程**透明可追溯**（事件表留底）。

## 特性

- 🗣️ **对话式 Agent**——流式回复、打断/重定向/排队三模式、语音输入（按住说话）
- 🛠️ **真·工具调用**——终端 / 文件读写 / 代码补丁 / 搜索 / 网页抓取 / 定时器 / 计算机控制
- 🔐 **安全门检**——危险操作三层检查（灾难拦截 / 危险审批 / 沙盒白名单）——透明审批卡片
- 🧠 **记忆与技能**——持久记忆（Agent + 用户画像）、可安装技能（SKILL.md）
- 🔌 **插件体系**——独立 Worker 线程隔离——voice/tool/web 三系 provider——音色克隆、本地识别
- 📊 **事件埋点**——完整执行链路留底（agent_events 表）——问题可追溯不黑盒
- 🔄 **自动更新**——GitHub Releases 更新源——后台下载

## 快速开始

```
1. 下载安装包：GitHub Releases（TinkerDesk Setup X.Y.Z.exe）
2. 首次启动 4 步初始化（创建 Agent → 配置模型 API Key）
3. 开始聊天——"帮我整理这个文件夹" / "搜索一下 XX 是什么"
```

无需安装 Node.js 等任何依赖（应用自带运行环境）。详见 [快速开始](docs/user/getting-started.md)。

## 文档

完整文档库：[docs/README.md](docs/README.md)

| 读者 | 入口 |
|:--|:--|
| 普通用户 | [用户指南](docs/user/getting-started.md)（聊天/设置/排查） |
| 开发者 | [架构](docs/architecture/overview.md) / [开发](docs/development/setup.md) / [规范](docs/development/conventions.md) |
| 插件作者 | [插件体系](docs/plugins/overview.md) / [manifest 规范](docs/plugins/manifest.md) |
| 决策记录 | [ADR](docs/decisions/0001-oo-agent-loop.md) |

## 技术栈

```
Electron 35 + electron-vite 5       桌面壳（主进程 + 渲染进程 IPC）
Vue 3 + Pinia + Naive UI            渲染层（View → Store → API 单向依赖）
TypeScript                          全栈（main + renderer + preload）
SQLite（node:sqlite）              本地数据（WAL 模式——20 张表）
Handlebars                          提示词模板（.hbs——模块化系统）
```

## 项目结构

```
src/main/          主进程
  ├─ core/         Agent 引擎（loop 执行循环 / llm 模型层 / prompt 提示词系统 / tool 工具）
  ├─ repository/   SQLite 数据访问（20 表）
  ├─ service/      业务逻辑（会话/消息/压缩/事件埋点/安全门检）
  ├─ controller/   IPC 通道（一个 IPC 一个具名方法）
  ├─ tools/        工具实现（desktop 桌面工具 / computer-use / provider 门面）
  └─ utils/        工具函数（时间/日志/资源路径/脱敏）
src/preload/       contextBridge（window.api）
src/renderer/      Vue 3 渲染（api / stores / views / components）
docs/              文档库（见上）
```

## 插件生态

- 插件 = manifest + JS 入口——**独立 Worker 线程**运行（崩溃不拖垮主进程）
- 依赖三分层：npm 依赖自动装（用户无需 Node）→ assetDeps 资源声明下载 → 外部引擎用户自管
- 系统开放接口：voice.stt / voice.tts / tool.tts / tool.stt / tool.computer_use / web.search / web.extract

## 许可证

[MIT](LICENSE)
