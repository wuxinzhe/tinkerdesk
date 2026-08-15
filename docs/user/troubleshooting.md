# 故障排查

## 应用打不开 / 启动崩溃

```
① 日志：%APPDATA%/tinkerdesk/logs/tinkerdesk.{date}.log
   —— 看最后几行 error / fatal（ENOENT = 资源缺失——重装最新版）
② 安装版问题 → 先确认装的版本号（GitHub Releases 最新）
③ 数据：%APPDATA%/tinkerdesk/tinkerdesk.db（SQLite——可用工具打开检查）
```

## Agent 不回复 / 回复异常

```
① 模型配置：设置 → 模型 —— API Key 有效？模型可用？
② 上下文溢出：长对话后回复异常 → 开新会话（或等自动压缩）
③ 执行链路排查（事件表）：
   打开 DB 查 agent_events：
     SELECT event_type, event_name, payload FROM agent_events
       WHERE session_id='<会话id>' ORDER BY seq
   应看到：turn_start → llm.request/response → stream.chunk → tool.call/result
     → message.saved → turn_end
   —— llm.error / tool.error / system.error 行指向问题点
```

## 消息内容重复

```
事件表 stream.chunk（逐 chunk 留底）——对照 llm.response.text（最终文本）：
- chunk 序列重复（同一段出现两次）= 流层/累积问题
- chunk 正常但 content 双份 = 服务端返回重复
```

## 语音/插件不工作

```
① 插件状态：插件管理页——启用了？自检通过？（check 返回原因）
② 外部引擎：按插件 install.md 安装（引擎路径配置正确？）
③ 接口契约：provider 设置了？回退开关？（工具管理 L3 页）
```

## 更新失败

```
- GitHub Releases 国内访问受限 → 用梯子或手动下载安装包
- 更新源：GitHub Releases（自动检查——下载慢属正常）
```

## 时间显示不对（少 8 小时）

```
应用内时间已按本地显示（存储为 UTC——显示转本地）。
若发现显示偏差 → 升级到最新版（旧版有此 bug）。
```

## 联系/反馈

- 项目主页：https://github.com/wuxinzhe/tinkerdesk（Issues 提交问题——附日志）
