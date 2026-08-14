# TinkerDesk 插件开发指南（协议 v1）

> 本文档是插件开发者的唯一权威规范（整合自 PLUGIN_DEVELOPMENT.md 与 plugin-provider-architecture.md）。
> 协议实现位于 `src/main/core/plugin/`：`system-interfaces.ts`（系统开放接口）、`plugin-manager.ts`（插件管理器）、`types.ts`（协议类型）。
>
> 参考实现：
> - 语音插件 `tinkerdesk-plugin-speech-sherpa`（STT + TTS + 资源管理）
> - 克隆插件 `tinkerdesk-plugin-speech-omni-voice`（外部进程调用 + 仿声配置）
> - TTS 插件 `tinkerdesk-plugin-speech-index-tts`（IndexTTS-2.5 音色克隆）

---

## 1. 核心概念

插件是**应用外独立分发的代码包**（JS 代码 + manifest），不进应用安装包。插件跑在应用主进程的 Node 环境里（CommonJS require），只提供**能力**，不负责 UI 流程（录音、聊天、设置页等应用固有功能由应用实现）。

```
插件目录（%APPDATA%/tinkerdesk/plugins/<plugin-id>/）
├── manifest.json      ← 元数据（必填）
├── index.js           ← 入口（CommonJS，main 进程加载）
├── package.json       ← 可选：npm 依赖声明（安装时自动 install）
├── install.md         ← 可选：复杂安装步骤（Agent 执行——见 §9）
├── guide.md           ← 安装引导文档（推荐，Agent 自动安装时读取）
├── lib/               ← 插件自己的模块
├── scripts/           ← 插件自己的脚本（如调用外部引擎）
├── node_modules/      ← npm 依赖（自动安装 或 分发自带）
├── models/            ← 资源文件（assetDeps 下载，可不在包内）
└── config.json        ← 应用托管：{ enabled, config }（勿手改）
```

**依赖与资源三分层**（插件自包含原则）：

| 层 | 声明位置 | 安装方式 | 用途 |
|:--|:--|:--|:--|
| npm 依赖 | 插件 package.json `dependencies` | 安装时自动 `npm install --prefix 插件目录` | Node.js 生态的 JS 库 |
| 资源文件 | manifest `assetDeps` | 设置页引导 URL 直链下载 | 模型 / 二进制 / 数据文件 |
| 外部系统 | `install.md` | Agent 安装（读步骤并执行命令） | git clone / 模型下载 / 环境配置 / 多步流程 |

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
  "assetDeps": [
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
| `assetDeps` | 否 | 资源依赖（设置页展示 + 引导下载 + 下载进度）——模型/二进制/数据文件通用 |

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
| `check()` | ✅ | 自检：返回 `{ ok, checks: [{name, ok, hint?, action?}] }`。`action: 'download-assets' \| 'open-config'` 引导 UI 提供对应按钮。**不实现 = 插件加载失败** |
| `start()` | 否 | 启用时调用（注册后） |
| `stop()` | 否 | 停用时调用 |
| `dispose()` | 否 | 应用退出时调用 |
| `getStatus()` | 否 | 自定义状态（detail 显示在设置页） |
| `getConfigSchema()` | 否 | 配置表单 Schema（见 §5），**动态**——可按运行时状态返回不同选项 |

---

## 4. 系统开放接口（provider 机制）

应用定义能力接口（`system-interfaces.ts`），插件声明实现即成为 provider。**一个插件可同时实现多个接口；同一接口可有多个 provider（用户多选一）**。

```ts
// 当前开放接口（voice / tool / web 三系——新增 = system-interfaces.ts 追加一行 + 插件声明）
'voice.stt'   → 必须注册频道 stt:transcribe    // 语音转文本（应用录音，插件识别）
'voice.tts'   → 必须注册频道 tts:speak         // 文本转语音（返回 audio data URL）
'tool.tts'    → 必须注册频道 tts:speak_file    // TTS 输出到文件（{ text, outputPath } → { filePath }）
'tool.stt'    → 必须注册频道 stt:transcribe_file // 音频文件转文本（{ filePath } → { text }）
'web.search'  → 必须注册频道 search:query      // 网页搜索（{ query, limit } → { results: [{title,url,description}] }）
'web.extract' → 必须注册频道 extract:fetch     // 网页抓取（{ url, limit? } → { content, title? }）
```

**契约**：
1. manifest `systemInterfaces` 声明接口 id
2. 入口必须注册 `requiredChannel`（未注册 → 加载失败，契约校验）
3. 启用（自检通过）→ PluginManager 注册到该接口的 **provider 清单**
4. 绑定入口按接口维度：
   - voice.* → 系统设置 → 语音设置选择激活
   - tool.* → 工具管理页（tool.tts / tool.stt）→ L3 provider 设置页选择激活
   - web.* → 工具管理页（web_search / web_extract 带设置按钮）→ L3 provider 设置页选择激活
     （未选插件 = 内置兜底；插件失败可自动回退内置）
5. **内置实现**（如 Edge TTS、内置搜索源）以「内置 provider」身份预置进注册表（`registerBuiltinPlugin`），与插件 provider 并列——用户可切换，插件失败可回退内置

**channel 约定**：插件注册的频道命名自由，但系统接口的 requiredChannel 是**固定契约**（如 `stt:transcribe`），调用经 PluginManager 转发。

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
  const ready = assetsReady(ctx.configDir)
  return {
    ok: ready && !!cfg.apiKey,
    checks: [
      { name: '资源', ok: ready, hint: '资源未下载（约 126MB）', action: 'download-assets' },
      { name: 'API Key', ok: !!cfg.apiKey, hint: '缺少 API Key', action: 'open-config' },
    ],
  }
}
```

- `action: 'download-assets'` → UI 提供"下载资源"按钮（调 `assets:download` 频道，见 §6.1）
- `action: 'open-config'` → UI 提供"去配置"按钮（打开配置表单）
- 自检通过后启用会**自动完成注册**；配置页"保存配置"后会自动重跑自检

### 6.1 资源管理（约定频道）

有资源依赖的插件建议实现（manifest 声明 `assetDeps`）：

| 频道 | 说明 |
|:--|:--|
| `assets:status` | → `{ kind: boolean, ..., allReady: boolean }`（kind 与 assetDeps.dest 尾部一致） |
| `assets:download` | 下载缺失资源；下载期间 emit `assets:progress` 事件 |

进度事件：`ctx.emit('assets:progress', { kind, phase: 'download'|'extract'|'done', percent })`

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

### 8.1 安装流程（v1.0）

```
用户选择 zip 或目录 → 校验（manifest/哈希）→ 复制到 plugins/<id> →
  ① 检测 install.md 存在？
     是 → Agent 安装（读 install.md 执行依赖/环境命令——见 §9）→ 完成后加载
     否 → ② 检测 package.json 有 dependencies 且无 node_modules？
          是 → 自动 npm install（--prefix 插件目录——装 Node.js 生态依赖）→ 加载
          否 → 直接加载
```

- **npm 依赖**：插件自带 package.json 声明 dependencies——安装时自动安装到**插件自己的 node_modules**（独立——不同插件可共存不同版本——无冲突）。npm-cli 由应用打包（用户无需安装 Node.js）。
- **资源文件**：manifest `assetDeps`——设置页引导下载（URL 直链 + 进度）。
- **外部系统**：`install.md`——Agent 安装（任意命令）。

### 8.2 分发格式

- 插件包 = 目录（可含 package.json / lib / scripts / 自带 node_modules）
- 分发：zip（顶层目录 = 插件 id）
- 目录安装（本地开发调试）：源码直接可见——不校验哈希清单
- zip 安装：require 前校验 `sha256sums.json` 哈希清单（防篡改——不匹配直接拒绝）

---

## 9. install.md（Agent 安装）

复杂插件的安装步骤写成 `install.md`（插件根目录），安装时交给 Agent 执行：

```markdown
# 插件安装说明
## 依赖安装（Agent 逐条执行 bash 命令块）
```bash
git clone https://github.com/xxx/engine.git lib/engine
python -m venv .venv
.venv/bin/pip install -r lib/engine/requirements.txt
```
## 验证（可选——exit 0 视为通过）
```bash
lib/engine/check.sh
```
```

安装时：Agent 读 install.md → 逐条执行（工作目录=插件目录）→ 验证通过 → 加载注册。
适合：拉 git / 下模型 / 环境配置 / 多步骤流程（npm 与 assetDeps 表达不了的场景）。

---

## 10. 开发调试

```bash
# 1. 目录结构
mkdir -p %APPDATA%/tinkerdesk/plugins/<id>

# 2. 快速验证入口（模拟 PluginManager 加载）
node -e "const m=require('./index.js'); const api=m.init({pluginId:'x',configDir:process.cwd(),getManifest:()=>({}),emit:()=>{},registerIpc:()=>{},getConfig:()=>({}),setConfig:()=>{}}); console.log(api.check())"

# 3. 装到应用（每次改代码后复制 + 重启 electron）
cp -r index.js manifest.json lib %APPDATA%/tinkerdesk/plugins/<id>/

# 4. 观察加载日志（main 控制台）
# [plugin] 已加载 <id>@<version> (caps)
# [plugin] <id> → 注册为接口 voice.tts 的 provider
# [plugin] 自动注册 <id>（自检通过）
```

**坑**：
- main/preload 改动需重启 electron（renderer 是 HMR）
- 插件代码改动只需复制到插件目录 + 重启（插件是运行时加载，不走构建）
- 契约校验失败（声明接口未注册频道 / 未实现 check）→ 插件加载失败，日志可见原因
- 插件 npm 依赖安装失败 → 插件不加载（缺依赖跑不起来——错误信息明确）

---

## 11. 最小插件模板

```js
// manifest.json
{
  "id": "example-plugin",
  "name": "示例插件",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "description": "最小完整实现"
}

// index.js
module.exports = {
  init(ctx) {
    ctx.registerIpc('hello', async (payload) => ({ reply: `你好，${payload?.name ?? '世界'}` }))
    return {
      check() {
        return { ok: true, checks: [{ name: '基础', ok: true }] }
      },
      getConfigSchema() {
        return { type: 'object', properties: { name: { type: 'string', title: '名字' } } }
      },
    }
  },
}
```

---

## 12. 安全

- 插件 = main 进程任意代码权限（v1 信任制：用户手动安装 = 主动信任）
- zip 分发校验 sha256sums.json 哈希清单（防篡改）
- install.md / npm install 执行前展示命令清单 + 用户确认（知情同意）
- 插件目录独立（依赖/资源自包含——不污染主应用）
