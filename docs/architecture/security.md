# 安全模型

纵深防御——从渲染层到执行层共五道防线。

## ① 渲染层（renderer）

- **无 BrowserView/webview**——不加载任意网页（无远程内容）
- 用户消息 / 工具结果 / 文件名等内容渲染走转义（不裸插 HTML）
- 多媒体附件走自定义协议 `app-media://`（只读 media 目录——CSP 白名单）

## ② IPC 来源校验（ipc-guard）

所有 `ipcMain.handle` 经 `handleTrusted`（替代原生 handle）——校验 senderFrame 来源：

```
prod：senderFrame.url 必须是 file://（打包后 index.html 从本地加载）
dev：必须是 vite dev server（localhost/127.0.0.1:5173）
其它来源一律拒绝（抛错）
```

效果：即使 renderer 被 XSS 注入恶意脚本（iframe/外链/污染上下文）——**无法调用任何 IPC 通道**（攻破后的保险丝）。

## ③ 工具三层门检（tool-call-executor）

每次工具执行前：

```
① 灾难检查（CATASTROPHIC_PATTERNS——rm -rf / 格式化 / 危险命令）
   → DENY：绝对不执行——不进审批（硬封锁）
② 授权检查（DANGEROUS_ARG_PATTERNS——危险参数模式）
   → ASK：触发用户审批（ApprovalCard）
③ 沙盒检查（user_url_whitelist / user_path_whitelist）
   → ASK：审批（批准自动加入白名单——后续免审批）
```

本地单用户无 DENY 语义（拒绝即审批拒绝）——危险操作一律走审批——审批 300s 超时自动拒绝。

## ④ 插件隔离（worker_threads）

- 外部插件在**独立 Worker 线程**运行（plugin-host-worker）——插件代码阻塞只影响自己的 worker——**main 进程事件循环零影响**
- API/ctx 经消息代理转发（createWorkerApiProxy / createWorkerCtxProxy）
- 插件崩溃/死循环不拖垮主进程（terminateWorker 兜底）
- 接口契约校验：声明的 systemInterfaces 必须注册 requiredChannel——否则终止加载
- v1 信任制：用户手动下载解压 = 主动信任（非自动安装任意代码）

## ⑤ 路径与内容安全

| 防线 | 实现 |
|:--|:--|
| 敏感路径守卫 | checkSensitivePath（Windows 系统目录 + Unix）——write-file/patch 拒绝 |
| V4A traversal 拒绝 | patch 头部 `..` 路径穿越拒绝 |
| 设备路径/二进制 | read-file 守卫（isBlockedDevicePath / hasBinaryExtension） |
| 密钥脱敏 | redact（20+ 前缀 + 边界断言）——工具结果/日志脱敏 |
| 沙盒路径 | 后台进程输出缓冲隔离（process-registry——session 维度） |

## 相关文档

- [Agent 执行循环](agent-loop.md)（三层门检细节）
- [插件体系](../plugins/overview.md)（worker 隔离细节）
- [数据模型](data-model.md)（白名单表）
