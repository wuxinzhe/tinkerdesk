# 风格：纸拼贴编辑风（paper-collage）

> 用于：概念隐喻、金句、抽象观点配画面。参考 gbro-collage-broll 风格。

## 设计令牌

| Token | 值 |
|:--|:--|
| 背景色场 | `#f5f0e8`（奶油白） |
| 纸片彩纸 | `#e63946`(红) `#f4a261`(橙) `#2a9d8f`(绿) `#457b9d`(蓝) `#e9c46a`(黄) `#8e44ad`(紫) |
| keyline | `#fdfaf3`（奶油白描边 3px） |
| 阴影 | `0 8px 24px rgba(0,0,0,0.18)` |
| 颗粒 | radial-gradient 噪点 `rgba(0,0,0,0.04)` 3px |
| 字体 | `'Georgia', 'Times New Roman', serif`（编辑风衬线） |
| 文字色 | `#3d3d3d`（纸片上的白字用 `#fff` + 1px 阴影） |

## 视觉特征

- 纸片有**清晰裁切边**：`clip-path: polygon(0% 0%, 100% 3%, 97% 100%, 2% 96%)`（斜切边角模拟撕纸）
- 每片微旋转（-8° ~ 8°），不平整
- 彩色纸片主体 + 黑白/白色文字
- 背景强烈、平坦、均匀色场，可按语意变化

## 动画原则：assemble-from-empty（从空组装）

- 纸片从**上方旋转落下**，逐张组装成画面
- 每片错开 15-25 帧出现（`Sequence` 或延迟计算）
- 落下动画：`translateY(-80→0)` + `rotate(rot*3→rot)` + `scale(0.85→1)`，easing 用 `1-(1-t)^3`（回弹落地感）
- 标题像"贴上去"的白纸，微旋转 1-3°
- 不漂移、不晃动、不慢 zoom（那是 AI 视频，不是拼贴）

## 组件写法要点

```tsx
const appear = interpolate(frame, [delay, delay+12], [0,1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
const dropY = interpolate(frame, [delay, delay+12], [-80,0], {extrapolateLeft:'clamp', extrapolateRight:'clamp', easing: t => 1-Math.pow(1-t,3)});
const rot = interpolate(frame, [delay, delay+12], [p.rot*3, p.rot], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
// 每片: backgroundColor 彩纸, border 3px solid #fdfaf3, boxShadow, clipPath, 颗粒噪点
```
