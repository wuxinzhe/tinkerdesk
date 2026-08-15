# provider 机制

系统开放接口（systemInterfaces）的多实现抽象：**一个接口可以有多个 provider（插件实现 / 内置实现）——用户选择用哪个**。

## 三系接口

```
voice.*   语音（录音是应用固有功能——STT/TTS 转发给 provider）
tool.*    工具形态（Agent 的 text_to_speech / speech_to_text 工具——provider 化）
web.*     Web 工具（web-search / web-extract——provider 化）
```

## 实现（内置 + 插件）

| 接口 | 内置实现 | 插件实现示例 |
|:--|:--|:--|
| voice.tts | Edge TTS（edge.ts——在线语音） | sherpa / omni-voice（本地） |
| voice.stt | — | sherpa（本地） |
| tool.tts / tool.stt | 同上（工具形态复用） | 同上 |
| tool.computer_use | cua-driver（builtin-cua-driver） | — |
| web.search / web.extract | 内置 provider 注册表（providers/search、providers/extract） | 插件 provider |

## 架构

```
工具管理页（L3 设置页——supportsProvider 的工具）
  → audio-tool-provider:list / web-provider:list
      → { 该接口的插件 provider 列表 + 内置实现 + 当前激活配置 }
  → set：设置激活 provider / 回退开关

执行时：
  TextToSpeechTool / SpeechToTextTool → AudioToolProvider（按激活配置路由）
  WebSearchTool / WebExtractTool → WebProvider
  ComputerUseTool → ComputerUseProvider（builtin-cua-driver 注册）
```

## 内置插件注册

```
pluginManager.registerBuiltinPlugin({ manifest: EDGE_TTS_MANIFEST, plugin: edgeTtsPlugin })
pluginManager.registerBuiltinPlugin({ manifest: CUA_DRIVER_MANIFEST, plugin: cuaDriverPlugin })
```

内置插件：代码注册——不出现在 plugins/ 目录——不可卸载——与外部插件 provider 架构统一。

## 可用性语义

- 工具可用性 = provider 是否配置（插件声明对应接口）
- 插件自身可用性（依赖是否安装——如 cua-driver）是插件系统自检的事——未安装/异常时执行抛错提示（CuaDriverUnavailableError）——不拦工具注册

## 相关文档

- [插件体系](overview.md)
- [manifest 规范](manifest.md)
