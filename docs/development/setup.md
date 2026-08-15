# 开发环境与调试

## 环境要求

```
Node.js ≥ 20（dev 需要——打包后用户不需要）
pnpm / npm（包管理）
Windows / macOS / Linux（桌面端——Windows 为主）
```

## 安装与启动

```bash
npm install
npm run dev:desktop    # electron-vite dev——主进程 + 渲染进程热载
```

打包（NSIS 安装包 + GitHub Releases 更新源）：

```bash
node scripts/package-npm.js   # 生成 resources/npm（打包进应用的 npm-cli——插件依赖安装用）
npx electron-vite build
npx electron-builder --config electron-builder.yml
# 产物：dist/TinkerDesk Setup X.Y.Z.exe + latest.yml + blockmap
```

## 目录速览

```
src/main/          主进程（repository/service/core/controller/tools/utils/security/providers）
src/preload/       contextBridge（window.api——IPC 封装）
src/renderer/      渲染进程（api/stores/views/components/styles/router）
docs/              文档（本文档库）
```

## 调试

### 日志

```
日志文件：%APPDATA%/tinkerdesk/logs/tinkerdesk.{yyyy-MM-dd}.log（按天滚动 30 天）
级别：生产默认 INFO（debug 不落盘）；dev 默认 DEBUG；LOG_LEVEL 环境变量覆盖
TK_DEBUG_CTX=1：LLM 调用前 dump 上下文尾部（定位 tool_calls 配对 400）
```

### 数据库

```
DB 文件：%APPDATA%/tinkerdesk/tinkerdesk.db（SQLite——WAL 模式）
事件表：agent_events（六域事件——排查执行链路）
  SELECT * FROM agent_events WHERE session_id='xxx' ORDER BY seq
```

### 前端调试

- Electron DevTools（F12）——渲染进程
- CDP（--remote-debugging-port=9222）——自动化/脚本化调试

## 验证清单（改动后）

```bash
npx tsc --noEmit -p tsconfig.node.json   # main 类型检查
npx vue-tsc --noEmit -p tsconfig.web.json # renderer 类型检查
npm run dev:desktop                       # 冒烟（启动 + 一轮对话）
```

## 相关文档

- [编码规范](conventions.md)
- [测试](testing.md)
- [打包与发布](packaging.md)
