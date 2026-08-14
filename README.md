# TinkerDesk

> 本地优先的桌面 AI Agent 客户端——像跟人聊天一样让 AI 帮你干活。

TinkerDesk 是一个面向普通用户的本地 AI Agent 桌面应用（Electron + Vue 3）。它不是一个"聊天框"，而是一个**能自己动手干活的助手**：读文件、跑命令、上网查资料、调用工具、甚至语音对话——所有数据都留在你的电脑本地。

## 核心特性

- **🗣️ 语音交互**：按住说话 / VAD 免提监听，说完了直接发给 Agent；Agent 也可以开口回答（TTS）。支持本地离线语音（Sherpa-ONNX）与高质量音色克隆（IndexTTS）。
- **🤖 真正的 Agent 循环**：思考 → 调工具 → 看结果 → 继续，直到把事干完。支持多模型、模型场景路由与自动回退。
- **🛠️ 工具系统**：文件读写、终端命令、网页搜索、多模态识别……统一的门检/审批机制，危险操作先问你。
- **📦 插件体系**：manifest + 入口文件的轻量插件规范；内置语音（voice）/ 工具（tool）/ 网络（web）三类 Provider，可自由扩展。
- **🔄 忙碌模式**：Agent 忙的时候，新消息按策略处理——排队（queue）/ 重定向修正（redirect）/ 打断（interrupt）。
- **📱 多端适配**：桌面三栏工作台 + 手机窄屏自适应（抽屉导航 / 全屏对话）。
- **🔒 本地优先**：SQLite 本地存储，会话/配置/统计全在本地；IPC 校验 + CSP + 沙箱审批，安全可控。

## 快速开始

### 环境要求

- Node.js ≥ 20（推荐 22+）
- pnpm（或 npm）

### 安装与启动

```bash
pnpm install
pnpm dev:desktop        # 桌面开发模式（HMR）
```

### 生产构建

```bash
pnpm build:desktop      # electron-vite 构建
pnpm preview:desktop    # 预览构建产物
```

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 35 + electron-vite 5 |
| 前端 | Vue 3 + Naive UI + Pinia |
| 主进程 | TypeScript（Node 24 内置 SQLite `node:sqlite`） |
| LLM | OpenAI 兼容 / Anthropic / Google 多客户端 + 模型路由 |
| 语音 | Web Audio + VAD（RMS 阈值 + 静音切段）+ Sherpa-ONNX / IndexTTS |
| 存储 | SQLite（消息 / 会话 / 配置 / 用量统计） |

## 项目结构

```
src/
  main/                 # Electron 主进程
    core/               # 核心逻辑（agent 循环 / LLM 客户端 / 工具 / 插件 / 提示词）
    service/            # 业务服务（消息 / 会话 / 事件分发 / 语音 / 设置）
    controller/         # IPC 控制器（preload 桥接面）
    repository/         # SQLite 数据层
  preload/              # 安全桥（IPC 封装）
  renderer/             # Vue 前端
    views/              # 页面（三栏工作台 / 设置 / 会话）
    components/         # 组件（会话列表 / 消息气泡 / 输入区 / 数据面板）
    stores/             # 状态（chat / session / agent）
  docs/                 # 架构与设计文档
```

## 插件开发

TinkerDesk 插件 = `manifest.json` + `index.js`（CommonJS），能力通过接口声明：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["tool"],
  "systemInterfaces": [{ "id": "tool.my_tool", "version": 1 }]
}
```

插件可注册工具（tool.*）、语音能力（voice.* / tool.stt / tool.tts）、系统接口（system.*），并声明模型依赖（modelDeps——设置页引导下载）。安装支持目录 / zip / Agent 自动化（install.md 由安装 Agent 执行）。

参考文档：[插件 Provider 架构](docs/plugin-provider-architecture.md)

## 架构文档

- [事件协议](docs/event-protocol.md)——前端与主进程的通信协议
- [语音与忙碌模式设计](docs/voice-busy-mode-design.md)——VAD / 三模式消息策略
- [UI 设计（Apple HIG）](docs/ui-redesign-apple-hig.md)
- [工坊应用生态](docs/workshop-app-ecosystem.md)
- [Agent OO 化重构](docs/agent-oo-refactor.md)

## 开发命令

```bash
pnpm typecheck          # 类型检查（main + renderer）
pnpm lint               # ESLint
pnpm build:desktop      # 构建桌面
```

## 协议

MIT
