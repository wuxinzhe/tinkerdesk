# 主提示词：用 Remotion 生成视频

> 把这个提示词（含所选风格段落）完整发给 coding agent。
> 变量替换：`<视频ID>`、`<文件名>`、`<时长帧数>`、`<风格段落>`。

---

## 任务

用 Remotion 生成一段竖屏视频动画（720×1280，9:16，30fps）。

## 环境

- 工作目录：`<tinkerdesk>/video/`（不存在则 `mkdir`，然后 `npm init -y && npm install remotion @remotion/cli react react-dom`）
- Node 24+，ffmpeg 已装

## 视频内容

<在这里描述要做的动画：内容、元素、节奏>

## 工程要求

1. 创建 `src/<组件名>.tsx`：写动画组件
   - 用 `useCurrentFrame()` 取当前帧，所有动画由帧号推导
   - 用 `interpolate(frame, [a,b], [c,d], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})` 做平滑过渡
   - 逐段动画用 `<Sequence from={N}>` 控制起始帧
   - 禁止 `Math.random()` / `Date.now()`（确定性铁律）
2. 创建/更新 `src/Root.tsx`：注册 `<Composition id="<视频ID>" component={...} durationInFrames={<时长帧数>} fps={30} width={720} height={1280} />`
3. 确认 `src/index.ts`：`registerRoot(Root)`
4. `tsconfig.json` 存在（target ES2022, module ESNext, moduleResolution Bundler, jsx react-jsx）
5. `remotion.config.ts` 存在：`Config.setEntryPoint('./src/index.ts')`

## 渲染

```bash
npx remotion render <视频ID> out/<文件名>.mp4
```

渲染成功（输出 `out/<文件名>.mp4`）后，用 ffprobe 验证：时长、720×1280、30fps、H.264。报告结果。

## 风格

<风格段落>

---

## 风格段落示例（组合方式）

如果选 Apple HIG：
> 风格：Apple HIG。设计令牌：主色 #007aff，文字主 #1d1d1f，次级 #86868b，背景纯白 #ffffff，次级背景 #f5f5f7，边框 #e8e8ed，圆角 8(按钮)/12(卡片)，字体 -apple-system/SF Pro，8pt 网格间距。动画克制：淡入/位移，不花哨。

如果选纸拼贴：
> 风格：纸拼贴编辑风。设计令牌：背景奶油白 #f5f0e8，纸片彩色（红/橙/绿/蓝/黄），奶油白 keyline #fdfaf3 3px，柔和阴影 0 8px 24px rgba(0,0,0,0.18)，纸张颗粒噪点，衬线字体 Georgia，动作是 assemble-from-empty（纸片旋转落下逐张组装），纸片 clip-path 斜切边角。

如果选深色科技：
> 风格：深色科技。设计令牌：背景 #1a1a2e，卡片 #333，高亮 #4f8cff/#ff8c4f/#4fff8c，发光阴影 0 0 30px 同色，无衬线字体，动画是卡片缩放高亮轮转。
