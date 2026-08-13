# 语音功能 × 忙碌模式设计

> 2026-08 定稿——语音（打断/持续输入/唤醒）与忙碌模式（queue/redirect/interrupt）的关系与实施计划。
> 核心结论：语音不是新消息通道——是"产生文本消息的另一种方式"——进入 chat 入口后与文本消息完全同构——忙碌模式天然接管。

## 1. 总纲

```
麦克风 → VAD → STT → 文本消息 → chat 入口 → 忙碌模式分发
             （语音侧）              （与文本消息完全同构——现成）
```

语音段进入 chat 入口后无差别——忙碌模式（queue/redirect/interrupt）对语音消息和文本消息一视同仁。这是"忙碌模式改造让语音实施变简单"的根本原因。

## 2. 关系矩阵

| 语音块 | 与忙碌模式的关系 | 复用点（零改动） | 独立点（语音侧新增） |
|---|---|---|---|
| **P0 语音打断** | 复用 interrupt 的 abort——但不走完整流程 | abort 断流 / 工具安全边界 / 回合退出 flush + 新回合 | VAD 人声检测 + 说完 STT 发送 |
| **P1 持续输入** | 语音段 = 普通消息——按 messageBusyMode 分发 | 消息入口分发（queue/redirect/interrupt 全现成）——零新增分发逻辑 | VAD 静音切段 + 流式 STT + 自动发送 |
| **P2 语音唤醒** | 独立——无直接关系 | — | 常驻监听 + 唤醒词（可选——后置） |

## 3. P0 打断的特殊性（关键差异）

```
文本打断（interrupt 模式）：消息到达 → 挂 pendingInterrupt + abort → 新回合处理
语音打断（P0）：检测到人声 → 【只 abort】→ 说完 → STT 完整文本 → 普通消息发送
                                              （不挂半句话——说完自然衔接）

为什么不同：语音是"先断再说"——人声响起就该断（响应快）——
完整文本要等说完（1-2s 后）——挂"半句话"还要替换——多一步
abort 后回合自然退出——说完的消息走空闲入队（现成）

需要的小改：runtime.interruptNoPending()（纯 abort——requestInterrupt 简化变体——
不挂 pendingInterrupt）
```

## 4. 分界清单

```
复用忙碌模式（零改动）：
  ✅ interrupt 的 abort 断流（P0 核心）
  ✅ 消息入口分发（P1——queue/redirect/interrupt 现成）
  ✅ 工具安全边界（打断不杀工具——等完成）
  ✅ 回合退出 flush + 新回合衔接（打断后说完——空闲入队）

语音侧新增（不碰忙碌模式）：
  🔨 常驻 VAD 监听（silero——0.6MB）
  🔨 VAD 静音切段（P1——0.8s）
  🔨 流式 STT 衔接（zipformer 已选）
  🔨 唤醒词（P2——后置）
  🔨 UI（录音态/波形——按住说话已有基础）

小改（忙碌模式侧）：
  🔧 runtime.interruptNoPending()（纯 abort——P0 用）
  🔧 （可选）语音打断开关配置（voice_interrupt——默认开）
```

## 5. P0 的两种形态（实施顺序）

```
形态 A（先做——按住说话打断）：
  按住说话（现有交互）→ interruptNoPending（abort 当前回复）→ 说完 STT → 发送
  复用现有"按住说话"——改动最小——agent 空闲时 abort 无害（interrupt 返回 false）
  前置：runtime.interruptNoPending + IPC + 前端 startRecording 接入

形态 B（后置——常驻监听说话即打断）：
  麦克风常开 + VAD 人声检测 → interruptNoPending → 说完 STT → 发送
  全自动（免按住）——但麦克风常开（隐私/资源）——大工程——
  与 P1 持续输入的自然延伸一起做

顺序：A → B（A 是 B 的前置验证——打断链路通了再加常驻监听）
```

## 6. 配置建议

```
① 语音打断（P0）：默认开——说话即打断（人类直觉）——开关配置
   （voice_interrupt——不跟 messageBusyMode 混——那是文本消息的分发策略）
② 持续输入（P1）：忙碌行为跟 messageBusyMode（用户配置即生效）
   —— 建议语音场景用 interrupt——但由用户选
③ 唤醒（P2）：后置——P0+P1 已够（点一下麦克风 = 唤醒）——全免手是进阶
```

## 7. 实施计划

```
P0-A（按住打断）→ P0-B（常驻监听）→ P1（持续输入）→ P2（唤醒——可选）

P0-A 依赖：runtime.interruptNoPending（小改）+ 前端 startRecording 接入
P0-B 依赖：常驻 VAD 监听（silero）+ 打断触发
P1 依赖：VAD 切段 + 流式 STT + 自动发送（消息入口现成）
```

## 8. 技术选型（沿用 local-voice-integration skill）

- STT：sherpa-onnx streaming-zipformer-zh-int8（126MB——流式——边说边出字）
- VAD：silero_vad.onnx（0.6-2MB——检测说话起止/切句）
- TTS：vits-icefall-zh-aishell3（30MB——已落地朗读）
- 采集：ScriptProcessorNode 直接 PCM（16k Float32——已落地）
- 交互：按住说话（现有）→ 形态 A → 形态 B 常驻
