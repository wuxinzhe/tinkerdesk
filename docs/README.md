# TinkerDesk 文档

> 本地优先的桌面 AI Agent 客户端——像跟人聊天一样让 AI 帮你干活。

本文档库按读者分域：**用户指南**（普通用户）、**架构/开发/插件**（开发者）、**设计决策**（历史记录）。

## 文档索引

### 👤 用户指南（user/）

| 文档 | 说明 |
|:--|:--|
| getting-started | 安装、首次启动、账号初始化（4 步向导） |
| chat-basics | 聊天、语音输入、打断、忙碌三模式 |
| settings | 设置页（Agent / 模型 / 通用） |
| troubleshooting | 常见问题排查（日志位置 / 事件表查询） |

### 🏗️ 架构（architecture/）

| 文档 | 说明 |
|:--|:--|
| overview | 三层架构总览（repository → service → core + renderer） |
| agent-loop | Agent 执行循环（TinkerAgent / Conversation / 三模式） |
| llm-layer | LLM 层（router / operation / client / 模型回退） |
| prompt-system | 提示词模块系统（15 模块 / 渲染管线 / 缓存） |
| data-model | 数据库 20 表（messages / sessions / agent_events …） |
| event-system | 事件推送协议（agent:message 单通道 / route 两级） |
| security | 安全模型（IPC 校验 / 三层门检 / 沙盒白名单） |
| process-isolation | Agent 进程隔离（B 方案——每会话独立进程跑 AgentLoop，对齐 dsh） |

### 🛠️ 开发（development/）

| 文档 | 说明 |
|:--|:--|
| setup | 环境要求 / 安装 / dev 启动 / 调试（CDP / 日志） |
| conventions | 编码规范（分层 / 命名 / 注释 / 提交） |
| testing | 测试（夹具 / e2e / 事件表验证） |
| packaging | 打包 / 发布（electron-builder / GitHub Releases / 更新） |

### 🔌 插件（plugins/）

| 文档 | 说明 |
|:--|:--|
| overview | 插件是什么 / 系统开放接口 / 生命周期 |
| manifest | manifest 规范（id / apiVersion / assetDeps / systemInterfaces） |
| provider-system | provider 机制（voice / tool / web 三系） |
| development | 开发一个插件（模板 / 调试 / 发布） |
| install | 安装（zip / 目录 / npm 依赖自动装 / 外部依赖自管） |

### 📜 设计决策（decisions/ — ADR）

| 文档 | 说明 |
|:--|:--|
| 0001-oo-agent-loop | Agent 循环 OO 化（TinkerAgent / Conversation / SessionRuntime） |
| 0002-message-busy-modes | 忙碌三模式（queue / redirect / interrupt） |
| 0003-event-table | 事件埋点（agent_events 表 — 审计轨迹） |
| … | 每个大决策一条，记录"为什么这么做" |

## 历史文档

已归档到 [docs/archive/](archive/)（旧方案 / 历史报告——参考用，非当前规范）。
