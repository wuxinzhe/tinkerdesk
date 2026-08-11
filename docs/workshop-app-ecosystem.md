# 工坊应用生态方案（Workshop App Ecosystem）

> 状态：方案定稿（2026-08-10，未实施）
> 范围：WebContentView 工坊的进程管理 / 依赖安装 / 持久化
> 关联：OS 化讨论（内核铁桶原则——第三方代码不进主进程）

---

## 1. 进程管理（每工坊一进程 + 双阈值淘汰）

### 1.1 架构

```
工坊 renderer（沙箱 + contextIsolation——第三方代码）
  │ window.workshopHost.postMessage({api:'http.request',...})
  ▼
MessagePort（MessageChannelMain——主进程创建：port1→renderer, port2→子进程）
  ▼
utilityProcess 子进程（代理/门卫——每工坊一个——独立 Node 进程）
  ├─ 白名单 API（http.request 代理/file.read/事件订阅）
  ├─ 权限校验（manifest 白名单）
  └─ 崩溃隔离（工坊代码搞崩子进程——主进程无感）
  ▼
主进程（信任核心——只对子进程暴露极窄受控通道）
```

- renderer 只认识自己的 MessagePort——**根本不知道主进程 IPC 存在**（物理隔离——不是靠约定）
- 每工坊一个子进程（不共享）——用户拍板：隔离到底
- 30-50MB/子进程对现代内存可接受；总量靠进程数上限控制

### 1.2 双阈值淘汰（进程数控制——主机制）

```
配置项（app_settings——通用配置，用户可改）：
  workshop.softLimit = '5'     // 超过 5 个：进入选择性淘汰（只杀"静默"的）
  workshop.hardLimit = '10'    // 达到 10 个：必杀（杀排序最末端的）

淘汰排序（分数高先杀）：
  + 最久未使用（lastUsed 时间戳）
  + 无焦点
  + 无运行中任务（无 toolCall / 无 agent 轮次）
  + 无后台任务（无定时器/长任务）

淘汰逻辑：
  5 < 进程数 ≤ 10：选择性杀——只杀"静默"的（高分 + 最近 10 分钟未用）
  进程数 > 10：必杀——杀分数最高的（聚焦的分数最低——最后才轮到）

不做"手动钉住"：OOM 时程序都要崩了——只管排序——尽力而为

关闭时序：
  通知 onBeforeClose（开发者保存状态）→ 等待 5s → terminate
  开发者没实现保存接口 → 直接 terminate（不提示——数据丢是开发者的责任）
```

### 1.3 单进程内存控制（安全网——三层优先级）

```
配置项（app_settings）：
  workshop.maxMemoryMB = '512'   // 全局默认（兜底）

应用 manifest 声明（覆盖全局默认）：
  "memoryLimitMB": 2048          // 视频渲染等重型工坊自己声明

用户覆盖（应用详情页手动调——最高优先级）：
  生效值 = 用户覆盖 > manifest 声明 > 全局默认

监控：主进程每 10s 查活跃工坊 RSS（process.getProcessMemoryInfo）
  超阈值 → 主动 evict（onBeforeClose → terminate）

定位：工坊本质是"操作界面 + HTTP 客户端"——renderer 内存有限（几十~两百 MB）
  → 512MB 默认很宽裕——这是保险丝不是日常约束——防泄漏/奇葩页面
```

### 1.4 生命周期钩子（开发者自实现状态保存）

```
window.workshopHost.onBeforeClose = async () => { 保存页面状态 }
window.workshopHost.onRestore = async () => { 恢复 }
→ 提供钩子但不提示不警告——开发者自己实现（iOS 生命周期语义）
→ 数据落：工坊独立 session（磁盘持久化目录）——进程关了数据还在
→ 重开 = 新进程 + onRestore 从持久化恢复
```

---

## 2. 依赖安装（Steam 式运行库检查 + AI 兜底）

### 2.1 分发形态三类（语言全覆盖）

```
① runtime（解释型——有 portable 运行时）：
   Node ✅ / Python ✅（embeddable）/ Java ✅（JDK zip）
   → portable 运行时 + 代码安装（npm install / pip install / 下载 jar）

② binary（编译型——预编译产物）：
   Go ✅（静态单 exe——零依赖）/ Rust ✅（release 单 exe）/ C++ ✅（静态链接）
   .NET ✅（自包含发布）
   → 下载预编译二进制（manifest 锁 URL + sha256）——解压/放置即用
   → 开发者【必须】提供预编译产物——否则不做一键安装（fallback：安装说明）

③ redist（系统级运行库——portable 不了的）：
   VC++ Redistributable（动态链接依赖）/ .NET Framework
   → 官方静默安装器（vc_redist.x64.exe /quiet /norestart）——Steam 就是装这个
   → 系统级 + 管理员权限——用户确认后装（一次装好多应用共享）
```

### 2.2 manifest 依赖声明

```json
{
  "name": "rsshub-client",
  "memoryLimitMB": 512,
  "dependencies": [
    { "id": "node", "kind": "runtime", "type": "node", "version": ">=18" },
    { "id": "ffmpeg", "kind": "binary", "url": "https://.../ffmpeg-6.1.zip", "sha256": "a1b2...", "verify": "ffmpeg -version" },
    { "id": "vcredist", "kind": "redist", "installer": "vc_redist.x64.exe", "args": "/quiet /norestart" },
    { "id": "rsshub", "kind": "service", "type": "node", "install": "npm install", "start": "npm start", "port": 1200, "healthCheck": "http://127.0.0.1:1200" }
  ]
}
```

### 2.3 安装流程（分层：程序化优先 + AI 兜底）

```
第一层：程序化安装（确定性——覆盖 90% 场景）
  检测（detect）→ 补装（按 kind 分流）→ 验证（verify/healthCheck）→ 启动
  失败 → 收集错误日志 + 环境快照（node 版本/网络/端口/杀软）

第二层：AI 安装（兜底——10% 复杂场景）
  只有程序化失败才上 AI——Agent 拿到 manifest + 错误日志 + 环境快照
  → 针对性修复（换源/调版本/关冲突/改配置）→ 重试程序化
  → 再失败 → AI 自由执行（手工装）

为什么不纯程序化：PC 环境千奇百怪（程序化失败=死路——用户不会修）
为什么不纯 AI：准确性不稳 + token 成本 + 安全风险（用户纠结的点）
→ 分层 = 准确性和突发性都拿到
```

### 2.4 接口边界

```
安装接口 = 主进程内部能力——【不暴露给 App】
工坊应用只做：manifest 声明依赖
主进程负责：检测 → 补装 → 启动 → 健康检查 → 汇报"依赖已就绪"
应用看不到安装 IPC——不能触发任意安装（安全）

AI 安装实现：复用 Agent 现有工具链（terminal/read-file/write-file）
  ——不需要单独的"AI install IPC"——把 manifest + 错误日志传给 Agent 即可
```

---

## 3. 持久化（重启不丢）

### 3.1 三层存储

```
DB 表 installed_dependencies（状态记录）：
  app_id | dep_id | kind(runtime/binary/redist/service) | version | path | installed_at | status
  → 查询/UI 显示"已安装/版本"

managed 目录（运行时本体——磁盘）：
  ~/tinkerdesk/runtimes/
    node-18.20.2-win-x64/     ← 版本化子目录（多版本共存）
    ffmpeg-6.1/
    python-3.11-embed/
  → portable 运行时解压在这——持久在磁盘——重启不丢

应用目录 .tinkerdesk/installed.json（可选——跟随应用）：
  该应用自己的安装记录——卸载应用时一起删——干净
```

### 3.2 重启恢复流程

```
应用启动：
  读 DB installed_dependencies（app 的依赖状态）
  → 已装 + 版本匹配 → 直接启动服务（健康检查确认）
  → 已装 + 版本不匹配（manifest 升级）→ 触发升级安装
  → 未装 → 走安装流程

服务（RSSHub）：
  已装 → 启动（端口/启动命令从记录读）→ 健康检查
  工坊关闭 → 服务常驻或随关（配置）
```

### 3.3 版本管理

```
版本化子目录 + DB 记录：
  工坊 A 要 node 18 → runtimes/node-18.20.2/
  工坊 B 要 node 22 → runtimes/node-22.4.1/（共存不冲突）
  manifest 升级（>=18 → >=20）→ 检测旧版本 → 自动装新版
  → 确定性 + 可回滚（保留旧版本目录）

卸载干净：删 DB 记录 + 删 managed 子目录 + 删应用目录
```

---

## 4. 落地清单（按顺序）

```
① 进程管理：
   - app_settings 加 workshop.softLimit / workshop.hardLimit / workshop.maxMemoryMB
   - WorkshopProcessManager（open/evict/close/内存监控）
   - 每工坊独立 utilityProcess + MessageChannelMain
   - onBeforeClose / onRestore 钩子注入
② 依赖安装：
   - manifest 解析（dependencies 三类 kind + memoryLimitMB）
   - DependencyInstaller（detect/install/verify/start/status）
   - managed 目录（版本化子目录）
   - 失败桥接 Agent（错误日志 + 环境快照 → Agent 排错）
③ 持久化：
   - installed_dependencies 表
   - 重启恢复流程
④ 设置页 UI（可选——先后端）：
   - workshop 三配置项
   - 应用详情页内存限制输入框
```

## 5. 关键决策记录

```
- 每工坊一个子进程（不共享）——隔离到底——用户拍板
- 冻结 vs 关闭：关闭（冻结不释放内存——控制总量必须关）
- 不做"手动钉住"淘汰保护——OOM 面前尽力而为——权重排序
- 状态恢复：开发者自实现（钩子给但不提示）
- 双阈值 5/10 + 内存 512 默认——全部可配置（用户可设 100/1000——自己承担）
- 安装接口不暴露 App——主进程内部
- 安装 = 程序化优先 + AI 兜底（分层——不是二选一）
- 编译型语言开发者必须提供预编译产物（否则不做一键安装）
- redist（VC++）系统级静默安装（用户确认）——Steam 模式
```
