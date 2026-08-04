# Remotion 视频生成提示词库

> 用途：存放**控制 Remotion 生成视频**的提示词。这些提示词可以直接喂给任何 coding agent（Hermes / Claude Code / Cursor / Codex），让它生成视频动画。
> 背景：Remotion 是 React 代码写视频的框架（`npm install remotion`），所有动画 = "帧号 → 样式"的函数。

## 目录结构

```
prompts/remotion/
├── README.md               # 本文件
├── generate-video.md       # 主提示词：完整工作流（推荐起点）
└── styles/                 # 风格令牌提示词（组合进主提示词）
    ├── apple-hig.md        # Apple HIG 克制白底风
    ├── paper-collage.md    # 纸拼贴编辑风
    └── dark-tech.md        # 深色科技风
```

## 使用方式

1. 选一个风格：读 `styles/` 下对应的风格文件
2. 打开 `generate-video.md`，把风格令牌段落替换/追加为所选风格
3. 把完整提示词发给 coding agent，它会：写组件 → 注册 Composition → 渲染 MP4
4. 渲染结果在项目 `out/` 目录，竖屏 720×1280（9:16）、30fps

## 环境要求（agent 需要知道）

- 工作目录：`<tinkerdesk>/video/`（如未创建先 `mkdir` 并 `npm init -y && npm install remotion @remotion/cli react react-dom`）
- Node 24+ / npm 11+ / ffmpeg 8.1+（已装）
- 渲染命令：`npx remotion render <id> out/<name>.mp4`
- 预览命令：`npx remotion preview`（浏览器实时预览）

## 确定性铁律

- 禁止 `Math.random()` / `Date.now()`（破坏帧确定性）
- 所有动画必须由 `useCurrentFrame()` + `interpolate()` 推导
- 同一组件同一帧号必须渲染出完全相同的画面

## 已验证模板（C:\tmp\remotion-test）

| 模板 | 风格 | 内容 |
|:--|:--|:--|
| AgentLoopDemo | 深色科技 | 思考→工具→结果三卡片轮转 |
| HigWorkbenchDemo | Apple HIG | 场景化 Agent 工作台（卡片列表） |
| CollageDemo | 纸拼贴 | Agent 循环纸片组装动画 |

新提示词写完后，对照 `styles/` 风格令牌自查是否完整。
