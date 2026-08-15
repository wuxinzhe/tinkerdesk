# 插件体系

TinkerDesk 插件 = 一段 JS 代码（CommonJS）+ `manifest.json` 声明，运行在**主进程**（与 Agent 引擎同进程——插件即代码，拥有 main 进程权限）。

## 插件是什么

```
plugins/<plugin-id>/
├── manifest.json       声明（id / entry / apiVersion / systemInterfaces / assetDeps）
├── index.js           入口（module.exports = { init(ctx) }）
├── package.json       可选（npm 依赖——安装时自动 install）
├── install.md         可选（外部系统安装说明——用户自管外部依赖）
└── lib/               自带逻辑
```

插件被 `plugin-manager` 扫描加载：读 manifest → 校验 → `require(entry)` → `init(ctx)`——之后通过 `ctx.registerIpc()` 暴露频道。

## 依赖三分层（安装语义）

| 层次 | 声明位置 | 安装方式 | 说明 |
|:--|:--|:--|:--|
| npm 依赖 | 插件 `package.json` | **自动**（安装时 `npm install --prefix 插件目录`——用打包的 npm-cli，用户无需装 Node） | 装到插件自己的 node_modules——独立隔离无冲突 |
| 资源下载 | manifest `assetDeps` | 声明式 URL 下载（设置页引导） | 模型 / 二进制 / 数据文件——`{ name, dest, sizeMB, url }` |
| 外部系统 | `install.md` | **用户自管**（guide 文档引导） | 引擎 / 环境（如 IndexTTS）——TinkerDesk 只做接口对接，不代管版本 |

## 系统开放接口（systemInterfaces）

应用对外暴露能力接口——插件声明实现某个接口（id 匹配）并在入口注册对应频道，即成为该接口的 **provider**。

```
voice.stt     → 插件实现 stt:transcribe（Float32Array 16kHz → { text }）
voice.tts     → 插件实现 tts:speak（{ text } → { audio }）
tool.tts      → 工具形态 TTS（text_to_speech 工具）
tool.stt      → 工具形态 STT（speech_to_text 工具）
tool.computer_use → computer-use 工具（provider 化）
web.search    → 搜索 provider（web-search 工具）
web.extract   → 抓取 provider（web-extract 工具）
```

系统设置页（工具管理 L3 页）从注册表选择该接口用哪个 provider——与内置实现（Edge TTS / 内置搜索）可切换、可回退。

## 生命周期

```
启动扫描 → 校验 manifest → require(entry) → init(ctx)（注册 IPC/接口）
  → check()（自检——可用性/依赖就绪）→ 自动注册（自检通过）
  → toggle 启停（用户控制）
  → 卸载（删除目录）
```

## 安全模型

- **v1 信任制**：用户手动下载解压 = 主动信任——插件拥有 main 进程权限（与 Agent 同级）
- 插件事件经 `plugin:event` 转发 renderer
- 配置读取 secret 脱敏（save 原样 / get 掩码）
- 插件目录外安装动作（install.md）由用户自管——应用不代执行任意命令

## 开发一个插件

见 [development.md](development.md)——含 manifest 规范、接口声明、自检、调试与发布模板。

## 相关文档

- [manifest 规范](manifest.md)
- [provider 机制](provider-system.md)
- [插件开发](development.md)
- [安装](install.md)
