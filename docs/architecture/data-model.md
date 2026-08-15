# 数据模型

SQLite（node:sqlite——同步 API）——单文件 `tinkerdesk.db`（userData 目录）——WAL 模式。共 **20 张表**。

## 表清单

### 核心对话

| 表 | 关键列 | 说明 |
|:--|:--|:--|
| sessions | id / title / profile / status / token 统计 / yolo / reasoning_depth | 会话——per-profile 隔离 |
| conversations | id / session_id / status / title / summary / token 统计 | 对话（回合）——IN_PROGRESS 进行中 |
| messages | id / session_id / conversation_id / role / content / api_content / reasoning_content / tool_call / tool_call_id / tool_name / finish_reason / interaction_status / message_type / deleted / usage 四列 | 消息——**content/api_content 字段级分离**（展示 vs LLM 原文）——usage 列是命中率数据源（不展示） |
| llm_usage_log | request_id UNIQUE / profile / model_name / scene / status / 耗时 / token | 每次 LLM 请求的用量与失败率统计 |
| agent_events | session_id / conversation_id / seq / event_type / event_name / payload / latency_ms / created_at | 事件埋点（审计轨迹）——索引 (session_id, seq) + (event_type, event_name) |

### Agent 与配置

| 表 | 说明 |
|:--|:--|
| agents | Agent 列表（id / profile / 名称 / 角色设定 / 模式绑定 / is_default） |
| agent_configs | per-agent 运行参数（拍平字段——非 JSONB）——PK=profile |
| custom_models | 用户接入模型（id / profile / model_name / provider_id / api_key / base_url / context_limit / api_mode）——**全局共享**（查询/CRUD 不按 profile 过滤） |
| system_providers | 预置供应商模板（内置种子——首次启动导入） |
| user_scene_models | 场景模型绑定（scene → 主模型 + 备用 priority）——per-profile 隔离 |
| prompt_modules | 用户自定义静态提示词模块（纯文本 + {{变量}} 模板） |

### 技能

| 表 | 说明 |
|:--|:--|
| private_skills | 用户私有技能（UNIQUE(profile, name)——含运行时条件过滤/触发条件/配置声明） |
| private_skill_files | 技能文件（SKILL.md 等）——FK → private_skills |
| private_skill_related | 技能关联（related / prerequisite 等） |

### 安全

| 表 | 说明 |
|:--|:--|
| user_url_whitelist | URL 白名单（沙盒检查） |
| user_path_whitelist | 路径白名单 |
| user_disabled_tools | 工具黑名单（PK(profile, tool_name)——空表 = 全部可用） |

### 插件与工具

| 表 | 说明 |
|:--|:--|
| mcp_servers | MCP 服务器配置（名称/传输方式/启动命令或 URL） |
| mcp_tools | 从 MCP 服务器发现的工具（含 schema） |

### 设置

| 表 | 说明 |
|:--|:--|
| app_settings | 应用级通用设置（key-value——快捷键/主题/agentEvents 配置等） |

## 关键设计

```
① 时间全部 UTC（nowDb = toISOString 截断）——前端显示时转本地（解析加 Z）
② messages 的 content/api_content 分离：
     content = 展示用（前端渲染）；api_content = LLM 原文（严格 provider 校验用）
③ usage 四列在 messages 上（每轮每请求）——命中率/成本数据源——不向前端展示
④ agent_events 只记录不投影（审计轨迹——非事件溯源——消息表是权威）
⑤ 环形清理：agent_events 超 maxRows（默认 50000）删最旧——一段时间内可追溯
⑥ 外键：messages → sessions（ON DELETE CASCADE）、conversations
```

## 相关文档

- [架构总览](overview.md)
- [事件推送协议](event-system.md)
