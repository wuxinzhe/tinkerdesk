# manifest 规范（插件协议 v1）

插件目录根 `manifest.json`——协议版本 `apiVersion: 1`。

## 字段

```json
{
  "id": "my-plugin",              // 插件 id（小写连字符 = 目录名）
  "name": "我的插件",              // 展示名
  "version": "0.1.0",
  "apiVersion": 1,                // 协议版本（当前 1）
  "entry": "index.js",            // 入口（相对插件目录——CommonJS——module.exports = { init(ctx) }）
  "requiresMain": false,          // 需要 main 进程权限（native addon / 系统能力）——默认 false（worker 隔离）
  "capabilities": ["stt", "tts"], // 能力标签（设置页展示）
  "systemInterfaces": [           // 实现的系统开放接口（provider 抽象关键声明）
    { "id": "voice.stt", "version": 1 }
  ],
  "assetDeps": [                  // 资源依赖（模型/二进制/数据文件——URL 直链下载）
    { "name": "模型文件", "dest": "models/model.onnx", "sizeMB": 80, "url": "https://..." }
  ],
  "permissions": ["mic", "audio-output"],
  "description": "插件描述",
  "author": "作者",
  "homepage": "https://...",
  "publisher": "发布渠道"
}
```

## 可选附带文件

```
package.json   npm 依赖（安装时自动 npm install 到插件自己的 node_modules——用户无需装 Node）
install.md     外部系统安装说明（引擎/环境——用户自管——应用不代执行）
```

## 入口（index.js）

```js
module.exports = {
  async init(ctx) {
    // ctx：{ pluginId, config(动态表单字段), registerIpc(channel, handler),
    //        emit(event, data), ... }
    ctx.registerIpc('my:hello', (payload) => ({ ok: true, echo: payload }))
    // 系统接口契约频道：如 voice.stt → 注册 'stt:transcribe'
  },
  async check() { return true },   // 自检（可用性/依赖就绪）
  async start() {},                // 启用
  async stop() {},                 // 停用
}
```

## 接口契约（requiredChannel）

声明 `systemInterfaces` 的插件**必须注册对应契约频道**——否则终止加载：

| 接口 id | 必注册频道 | 契约 |
|:--|:--|:--|
| voice.stt | stt:transcribe | `{ samples: Float32Array(16kHz) } → { text }` |
| voice.tts | tts:speak | `{ text } → { audio }` |
| tool.tts | tts:speak | 工具形态（text_to_speech） |
| tool.stt | stt:transcribe | 工具形态（speech_to_text） |
| tool.computer_use | computer-use:* | computer-use 工具 |
| web.search | search | `{ query } → 结果列表` |
| web.extract | extract | `{ urls } → 页面内容` |

## 配置 Schema（动态表单——UI 不写死插件字段）

`getConfigSchema()` 返回 ConfigField 数组——类型：string / secret / number / boolean / select / textarea / file——前端动态渲染设置表单——secret 读取时脱敏。

## 相关文档

- [插件体系](overview.md)
- [provider 机制](provider-system.md)
- [插件开发](development.md)
- [安装](install.md)
