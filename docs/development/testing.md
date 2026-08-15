# 测试

## 验证层级

```
① 类型检查（每次改动后必跑）：
   npx tsc --noEmit -p tsconfig.node.json     # main
   npx vue-tsc --noEmit -p tsconfig.web.json  # renderer

② 冒烟（手动——dev 启动 + 一轮对话）：
   - 应用正常启动（无 ENOENT/无 fatal）
   - 发消息 → agent 回复（流式 token 正常）
   - 工具调用（让 agent 干活——terminal/read-file 等）

③ 事件表验证（执行链路追溯）：
   SELECT event_type, event_name, payload FROM agent_events
     WHERE session_id='xxx' ORDER BY seq
   —— 应看到 conversation.turn_start → llm.request/response → stream.chunk
      → tool.call/result → message.saved → conversation.turn_end 完整链

④ e2e（插件安装等场景——CDP 驱动）：
   - 造测试插件夹具（manifest + index.js + package.json）
   - CDP 调 window.api 接口（WS URL 动态获取——过滤 page url startsWith http）
   - 验证 npm 依赖安装 / 加载 / 自检
   - 测完清理夹具（测试脚本用完即删——不留在仓库）
```

## 排查工具

```
- 日志：%APPDATA%/tinkerdesk/logs/（TK_DEBUG_CTX=1 上下文尾部 dump）
- DB：tinkerdesk.db（messages/agent_events/llm_usage_log）
- CDP：--remote-debugging-port=9222（自动化调试）
- 生产包验证：win-unpacked/TinkerDesk.exe 直接跑（不装——验证资源/启动）
```

## 约定

- 测试夹具/脚本用完即删（不进仓库）
- 排查先定位根因再改（事件表/日志证据驱动——不猜）
- 新功能必跑类型检查 + 冒烟；涉及安装/打包的跑 e2e + win-unpacked 验证

## 相关文档

- [开发环境](setup.md)
- [打包与发布](packaging.md)
