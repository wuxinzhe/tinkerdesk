# TinkerDesk 插件开发指南（协议 v1）

> 本文档是插件开发者的唯一权威规范。协议实现位于本目录（`src/main/core/plugin/`）：
> - `system-interfaces.ts` — 系统开放接口定义（应用能力清单，插件声明实现）
> - `plugin-manager.ts` — 插件管理器（扫描/加载/自检/注册/启停/配置）
> - `types.ts` — 协议类型（PluginManifest / PluginContext / PluginApi 等）
>
> 参考实现：
> - 示例插件 `plugins-examples/example-plugin/`（最小完整实现）
> - 语音插件 `tinkerdesk-plugin-speech-sherpa`（STT + TTS + 模型管理）
> - 克隆插件 `tinkerdesk-plugin-speech-omni-voice`（外部进程调用 + 仿声配置）

---

## 1. 核心概念

插件是**应用外独立分发的代码包**，不进应用安装包：

```
插件目录（%APPDATA%/tinkerdesk/plugins/<plugin-id>/）
├── manifest.json      ← 元数据（必填）
├── index.js           ← 入口（CommonJS，main 进程加载）
├── guide.md           ← 安装引导文档（推荐，Agent 自动安装时读取，见 §10）
├── lib/               ← 插件自己的模块
├── scripts/           ← 插件自己的脚本（如调用外部引擎）
├── node_modules/      ← 自带依赖（分发时包含）
├── models/            ← 模型文件（应用引导下载，可不在包内）
└── config.json        ← 应用托管：{ enabled, config }（勿手改，应用写入）
```

**职责边界**：
- 插件只提供**能力**（识别、合成、工具…），不负责 UI 流程
- 录音、聊天、设置页等**应用固有功能**由应用实现
- 插件通过声明 `systemInterfaces` 注册为某能力的 provider，由系统设置页选择绑定

---

## 2. manifest.json 规范

```json
{
  "id": "speech-sherpa",
  "name": "本地语音（Sherpa-ONNX）",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "requiresMain": true,
  "capabilities": ["stt", "tts"],
  "systemInterfaces": [
    { "id": "voice.stt", "version": 1 },
    { "id": "voice.tts", "version": 1 }
  ],
  "permissions": ["mic", "audio-output"],
  "description": "一句话描述",
  "modelDeps": [
    {
      "name": "STT 模型（Zipformer 中文 int8）",
      "dest": "models/stt",
      "sizeMB": 126,
      "url": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/xxx.tar.bz2"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|:--|:--|:--|
| `id` | ✅ | 全局唯一，小写连字符；**必须与目录名一致** |
| `name` | ✅ | 展示名（设置页） |
| `version` | ✅ | 语义化版本 |
| `apiVersion` | ✅ | 协议版本，当前必须为 `1` |
| `entry` | ✅ | 入口文件相对路径（CommonJS） |
| `requiresMain` | 否 | 需要 main 进程权限（native addon / 子进程）时为 true |
| `capabilities` | 否 | 能力标签（设置页展示，如 `["stt","tts"]`） |
| `systemInterfaces` | 否 | **声明的系统开放接口**（见 §4）——声明即成为该接口 provider 候选 |
| `permissions` | 否 | 权限声明（mic/audio-output/…） |
| `modelDeps` | 否 | 模型依赖（设置页展示 + 引导下载 + 下载进度） |

---

## 3. 入口契约（index.js）

入口必须是 CommonJS 模块，导出 `{ init(ctx) }`：

```js
module.exports = {
  init(ctx) {
    // 1. 注册 IPC 能力
    ctx.registerIpc('my:thing', async (payload) => {
      return { ok: true }
    })

    // 2. 返回 PluginApi
    return {
      check() {           // ← 强制实现！启用前自检
        const checks = []
        // ...
        return { ok: checks.every(c => c.ok), checks }
      },
      start() {},         // 可选：启用时
      stop() {},          // 可选：停用时
      dispose() {},       // 可选：应用退出时
      getStatus() { return { loaded: true, enabled: true, detail: '...' } },  // 可选
      getConfigSchema() { return { type: 'object', properties: { ... } } },  // 可选：配置表单
    }
  },
}
```

### 3.1 PluginContext（init 参数）

| 成员 | 类型 | 说明 |
|:--|:--|:--|
| `pluginId` | string | 插件 id |
| `configDir` | string | 插件目录绝对路径（读模型/资源） |
| `getManifest()` | () => PluginManifest | 读取自己的 manifest |
| `emit(event, data)` | (string, unknown?) => void | 发事件到 renderer（见 §7） |
| `registerIpc(channel, handler)` | (string, fn) => void | 注册能力频道，renderer 调 `plugin:<id>:<channel>` |
| `getConfig()` | () => T | 读取应用托管的配置（config.json 的 config 部分） |
| `setConfig(patch)` | (object) => void | 按字段更新配置（持久化） |

### 3.2 PluginApi（init 返回值）

| 成员 | 强制 | 说明 |
|:--|:--|:--|
| `check()` | ✅ | 自检：返回 `{ ok, checks: [{name, ok, hint?, action?}] }`。`action: 'download-models' \| 'open-config'` 引导 UI 提供对应按钮。**不实现 = 插件加载失败** |
| `start()` | 否 | 启用时调用（注册后） |
| `stop()` | 否 | 停用时调用 |
| `dispose()` | 否 | 应用退出时调用 |
| `getStatus()` | 否 | 自定义状态（detail 显示在设置页） |
| `getConfigSchema()` | 否 | 配置表单 Schema（见 §5），**动态**——可按运行时状态返回不同选项 |

---

## 4. 系统开放接口（provider 机制）

应用定义能力接口（`system-interfaces.ts`），插件声明实现即成为 provider：

```ts
// 当前开放接口（新增 = 在 system-interfaces.ts 追加一行 + 插件声明）
'voice.stt'   → 必须注册频道 stt:transcribe    // 语音转文本（应用录音，插件识别）
'voice.tts'   → 必须注册频道 tts:speak         // 文本转语音（返回 audio data URL）
'web.search'  → 必须注册频道 search:query      // 网页搜索（{ query, limit } → { results: [{title,url,description}] }）
'web.extract' → 必须注册频道 extract:fetch     // 网页抓取（{ url, limit? } → { content, title? }）
```

**契约**：
1. manifest `systemInterfaces` 声明接口 id
2. 入口必须注册 `requiredChannel`（未注册 → 加载失败，契约校验）
3. 启用（自检通过）→ PluginManager 注册到该接口的 **provider 清单**
4. 绑定入口按接口维度：
   - voice.* → 系统设置 → 语音设置选择激活
   - web.* → 工具管理页（web_search / web_extract 带设置按钮）→ L3 provider 设置页选择激活
     （未选插件 = 内置兜底；插件失败可自动回退内置——web-provider-config.json 的 fallback 开关）
5. 一个插件可同时实现多个接口；同一接口可有多个 provider（多选一）

**channel 约定**：插件注册的频道命名自由，但系统接口的 requiredChannel 是**固定契约**（如 `stt:transcribe`），调用经 PluginManager 转发：`voice:stt:transcribe` → 当前绑定的 provider 的 `stt:transcribe`。

---

## 5. 配置 Schema（动态表单）

`getConfigSchema()` 返回，设置页自动渲染表单（零 UI 代码）：

```js
getConfigSchema() {
  return {
    type: 'object',
    properties: {
      apiKey:  { type: 'secret',  title: 'API Key', placeholder: 'sk-...' },
      voice:   { type: 'select',  title: '音色', options: [{label:'女声',value:88},{label:'男声',value:92}], default: 88 },
      rate:    { type: 'number',  title: '语速', min: 0.5, max: 2, step: 0.1, default: 1.0 },
      auto:    { type: 'boolean', title: '自动执行', default: false },
      prompt:  { type: 'textarea', title: '提示词' },
    },
  }
}
```

| 类型 | 渲染 | 说明 |
|:--|:--|:--|
| `string` | 文本框 | `placeholder` |
| `secret` | 密码框 | 存密文，回显 `***` |
| `number` | 数字框 | `min/max/step` |
| `boolean` | 开关 | |
| `select` | 下拉 | `options: [{label, value}]` |
| `textarea` | 多行文本 | |

**注意**：`getConfig()` 读取时 secret 字段被应用脱敏为 `***`；`setConfig` 时插件自行决定如何处理（如"未改动则保留原值"）。

---

## 6. 自检规范（check）

启用前强制自检，**不通过则拒绝启用**并弹出引导：

```js
check() {
  const cfg = ctx.getConfig()
  const ready = modelsReady(ctx.configDir)
  return {
    ok: ready && !!cfg.apiKey,
    checks: [
      { name: '模型', ok: ready, hint: '模型未下载（约 126MB）', action: 'download-models' },
      { name: 'API Key', ok: !!cfg.apiKey, hint: '缺少 API Key', action: 'open-config' },
    ],
  }
}
```

- `action: 'download-models'` → UI 提供"下载模型"按钮（调 `models:download` 频道，见 §6.1）
- `action: 'open-config'` → UI 提供"去配置"按钮（打开配置表单）
- 自检通过后启用会**自动完成注册**；配置页"保存配置"后会自动重跑自检

### 6.1 模型管理（约定频道）

有模型依赖的插件建议实现（manifest 声明 `modelDeps`）：

| 频道 | 说明 |
|:--|:--|
| `models:status` | → `{ kind: boolean, ..., allReady: boolean }`（kind 与 modelDeps.dest 尾部一致） |
| `models:download` | 下载缺失模型；下载期间 emit `models:progress` 事件 |

进度事件：`ctx.emit('models:progress', { kind, phase: 'download'|'extract'|'done', percent })`

---

## 7. 事件（插件 → renderer）

`ctx.emit(event, data)` → renderer 监听 `plugin:event`（CustomEvent）：

```ts
// renderer 侧
onPluginEvent(({ pluginId, event, data }) => { ... })
```

事件消费由**功能页面**注册（如聊天页监听 stt 识别结果），设置页监听进度类事件。

---

## 8. 分发与安装

1. 插件包 = 目录（含 node_modules 自带依赖）
2. 分发：zip（顶层目录 = 插件 id）
3. 用户安装：解压到 `%APPDATA%/tinkerdesk/plugins/<id>/` → 重启应用
4. 应用启动：扫描 → manifest 校验 → 加载 → 契约校验 → 读 config.json → `enabled=true` 则自检 → 通过自动注册

---

## 9. 开发调试

```bash
# 1. 目录结构
mkdir -p %APPDATA%/tinkerdesk/plugins/<id>

# 2. 快速验证入口（模拟 PluginManager 加载）
node -e "const m=require('./index.js'); const api=m.init({pluginId:'x',configDir:process.cwd(),getManifest:()=>({}),emit:()=>{},registerIpc:()=>{},getConfig:()=>({}),setConfig:()=>{}}); console.log(api.check())"

# 3. 装到应用（每次改代码后复制 + 重启 electron）
cp -r index.js manifest.json lib %APPDATA%/tinkerdesk/plugins/<id>/
# 重启 dev：powershell "Get-Process electron,node | Stop-Process -Force" 后 npm run dev:desktop

# 4. 观察加载日志（main 控制台）
# [plugin] 已加载 <id>@<version> (caps)
# [plugin] <id> → 注册为接口 voice.tts 的 provider
# [plugin] 自动注册 <id>（自检通过）
```

**坑**：
- main/preload 改动需重启 electron（renderer 是 HMR）
- 插件代码改动只需复制到插件目录 + 重启（插件是运行时加载，不走构建）
- 契约校验失败（声明接口未注册频道 / 未实现 check）→ 插件加载失败，日志可见原因

---

## 10. 最小插件模板

```js
// manifest.json
{
  "id": "hello-plugin",
  "name": "Hello 插件",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["hello"]
}

// index.js
module.exports = {
  init(ctx) {
    ctx.registerIpc('hello', (payload) => ({ message: `你好, ${payload?.name ?? 'Tinker'}!` }))
    return {
      check: () => ({ ok: true, checks: [{ name: '就绪', ok: true }] }),
      getConfigSchema: () => ({
        type: 'object',
        properties: {
          greeting: { type: 'string', title: '问候语', default: '你好' },
        },
      }),
    }
  },
}
```

---

## 11. 发布 checklist

- [ ] manifest 字段完整，id 与目录名一致，apiVersion = 1
- [ ] 实现 `check()`（强制）；自检项 hint/action 齐全
- [ ] 声明 systemInterfaces 的插件已注册 requiredChannel
- [ ] modelDeps 的 url 可下载（断点续传支持）、解压后文件与 models:status 一致
- [ ] 敏感配置用 `secret` 类型
- [ ] node_modules 自带（分发 zip 包含）
- [ ] README：安装方法、配置说明、依赖环境
- [ ] 有外部依赖（Python/GPU/引擎）的插件必须带 `guide.md`（见 §10）

---

## 10. 安装引导文档（guide.md）规范

**目的**：让 Agent 或用户无需内置任何插件知识即可完成安装。**凡是需要前置环境（Python/GPU/外部引擎/系统组件）的插件，必须附带 `guide.md`**；纯代码零依赖的插件可选。

**固定格式**（Agent 按此结构解析）：

```markdown
# <插件名> 安装引导

## 前置依赖
- 需要安装什么（如：OmniVoice 引擎、Python 3.10+、NVIDIA GPU）

## 环境要求
- 版本/硬件/驱动要求（如：torch CUDA 版、驱动 ≥ xxx）

## 对接方式
- 插件如何桥接外部能力（系统接口、配置项含义）

## 安装步骤
1. 安装前置依赖（给命令或下载地址）
2. 模型/配置准备（如需）

## 常见路径
- 各平台默认安装位置（Agent 探测用）
```

**约定**：
- Agent 安装流程（skill `tinkerdesk-plugin-install`）：`plugin_install` 装包 → 读插件目录 `guide.md` → 按"安装步骤"用 terminal 准备环境 → `plugin_configure` 自动探测配置 → `plugin_enable` 启用验证
- 插件**不得**假设系统知道自己的依赖——一切写在 guide.md
- 环境探测优先顺序：预设路径 → 环境变量（如 `OMNI_VENV_PYTHON`）→ 配置表单手动指定
