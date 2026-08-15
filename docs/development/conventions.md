# 编码规范

## 分层

```
controller → service → repository（三层——controller 不直接访问 repository）
core/loop（Agent 引擎）→ core/llm / core/prompt / core/tool（领域组件）
tools（工具实现）→ 可直连 repository 或调 service
bootstrap（App 层）→ 跨域编排——依赖组装

规则：
- 同域 Service 互注；跨域编排走 App 层
- 多表写事务归 service（withTransaction——node:sqlite 同步事务 + SAVEPOINT）
- profile 铁律：per-agent 方法 profile 必传（前端传入——main 不硬编码默认值）
  scene_models 按 profile 隔离；custom_models 全局共享
```

## Controller 规范

```
- 每个 IPC 一个独立具名方法（业务语义命名——禁 handleXxx）
- register() 只做 ipcMain.handle 绑定（经 handleTrusted——来源校验）
- 入参出参完整类型（RequestDTO / VO——不用 unknown）
- IPC 前缀按域（agent: / session: / message: / model: / skill: ...）
```

## 命名

```
- 文件：kebab-case（agent-config-service.ts）
- 类/接口：PascalCase；函数/变量：camelCase
- 常量：UPPER_SNAKE（BUSY_MODE_* 在 core/loop/types.ts；工具名在 core/constants/tools.ts）
- 类型：统一归位 types.ts（repository/types.ts / llm/types.ts / controller/types.ts ...）
```

## 注释（英文）

```
- 只写英文；只解释本类/本方法/本成员的功能
- 不记录代码构建来源 / 外部项目名 / 设计思路（"为什么"放 docs/decisions/）
- 类头部 = 英文功能摘要（职责 + 关键方法 + 生命周期）
- 内部行注释解释"为什么这样写"（不解释"写了什么"——代码自明）
```

## 工具

```
- 通用工具契约不因特定引擎扩展参数（tts 只传 text——个性化走 MCP/插件 provider）
- 工具命名：desktop_tinker_*（桌面）/ 内置域（memory/todo/clarify/skill_*）
- 工具注册：bootstrap 统一注册（ToolManager——check 可用性 → 缓存可用 map）
- 新工具：BaseTool 继承（schema 从 tool-schemas/{name}.hbs 加载）
```

## Git

```
- 分支：main（稳定——禁止直接开发）+ feat/*（日常开发）+ tag 发版
- 提交：分阶段（docs: / feat: / fix: / refactor: / chore: 前缀——一行摘要）
- 发版：tag vX.Y.Z + GitHub Releases（exe + latest.yml + blockmap 三件套）
- 测试脚本用完即删（e2e 夹具不留在仓库）
```

## 相关文档

- [开发环境](setup.md)
- [测试](testing.md)
- [打包与发布](packaging.md)
