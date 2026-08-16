# 开发一个插件

以语音 STT 插件为例（sherpa 本地识别）。

## 1. 目录结构

```
my-plugin/
├── manifest.json
├── package.json        （可选——npm 依赖）
├── install.md          （可选——外部引擎安装说明）
├── index.js
└── lib/                （自有逻辑）
```

## 2. manifest.json

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["stt"],
  "systemInterfaces": [{ "id": "voice.stt", "version": 1 }]
}
```

## 3. index.js（实现契约频道）

```js
module.exports = {
  async init(ctx) {
    // 注册系统接口契约频道（voice.stt → stt:transcribe）
    ctx.registerIpc('stt:transcribe', async (payload) => {
      const { samples } = payload   // Float32Array 16kHz
      const text = await this.engine.recognize(samples)
      return { text }
    })
    // 可选：自定义频道（plugin:my-plugin:xxx）
    ctx.registerIpc('my:status', () => ({ ok: true }))
  },

  async check() {
    // 自检：模型文件/引擎就绪？
    return this.engine ? true : '引擎未安装（见 install.md）'
  },

  async start() { /* 启用——加载模型 */ },
  async stop() { /* 停用——释放资源 */ },
}
```

## 4. 外部引擎（插件只做对接——不代管安装）

```
IndexTTS / sherpa 等外部引擎：插件用 manifest 的 configSchema 声明引擎路径配置——
用户按 install.md 自行安装——插件只负责调用。

原则：插件 = 粘合层——只做接口对接——不包装外部依赖——
外部依赖版本用户自管（应用不代装、不代管版本）。
```

## 5. 配置 Schema（静态声明——manifest.json 的 configSchema）

```jsonc
// manifest.json —— 配置 schema 必须静态声明（应用主进程直读——
// 不执行插件代码——Worker 死活不影响配置渲染）
{
  "id": "my-plugin",
  "entry": "index.js",
  "configSchema": {
    "type": "object",
    "properties": {
      "enginePath": { "type": "string", "title": "引擎路径", "placeholder": "C:\\tools\\index-tts" },
      "sampleRate": { "type": "number", "title": "采样率", "default": 16000 },
      "apiKey": { "type": "secret", "title": "API Key" }
    }
  }
}
```

**规范（v1 强制）**：
- `configSchema` 必须写在 manifest.json（静态 JSON——应用直读）
- `getConfigSchema()` 动态链路已【废弃】——应用侧不再调用——插件不要依赖它
- 支持字段类型：`string / number / boolean / select / secret / textarea / file`
- secret 类型：应用读取配置时脱敏（不返回明文）
- 配置存储：config.json（应用托管——`ctx.getConfig()/setConfig()` 读写）

## 6. 调试

```
- 日志：%APPDATA%/tinkerdesk/logs/（[plugin] 前缀——加载/错误）
- 插件事件：webContents.send('plugin:event', ...)
- 设置页：工具管理 → 对应接口的 L3 设置页 → 选择你的 provider
- 契约校验：声明 systemInterfaces 但没注册 requiredChannel → 加载终止（控制台报错）
```

## 7. 发布

```
- 打成 zip（manifest + index.js + lib/ + package.json + install.md + 模板/文档）
- 用户下载 → 应用内安装（zip 或目录——复制到 plugins/<id>/）
- npm 依赖：安装时自动 install（用打包的 npm-cli——用户无需 Node）
- assetDeps 资源（模型等）：声明 URL——设置页引导下载
```

## 相关文档

- [插件体系](overview.md)
- [manifest 规范](manifest.md)
- [provider 机制](provider-system.md)
- [安装](install.md)
