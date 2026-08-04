# 风格：Apple HIG（克制白底风）

> 用于：产品界面演示、工作台、设置类画面。参考 `apple-hig-ui-system` skill。

## 设计令牌

| Token | 值 |
|:--|:--|
| 主色 accent | `#007aff` |
| 文字主 primary | `#1d1d1f` |
| 文字次 secondary | `#86868b` |
| 背景 bg | `#ffffff` |
| 次级背景 bg-secondary | `#f5f5f7` |
| 边框 border | `#e8e8ed` |
| 圆角（按钮） | `8px` |
| 圆角（卡片） | `12px` |
| 字体 | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif` |
| 间距 | 8pt 网格：8 / 12 / 16 / 20 / 24 / 32 / 48 |

## 字号层级

```
Hero 标题: 32px 700
页面标题: 20px 600
正文: 13px
次级说明: 13px #86868b
节标题: 14px 600 主色（可加 letter-spacing 0.5px）
```

## 动画原则

- **克制**：淡入（opacity 0→1）、轻微位移（8-16px）、卡片逐张错开出现
- 不缩放弹跳、不旋转、不花哨
- 过渡时长 10-20 帧（0.3-0.7 秒）
- 每元素只动一次，动完静止

## 组件写法要点

```tsx
const opacity = interpolate(frame, [start, start+15], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
const y = interpolate(frame, [start, start+15], [16, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
// 卡片: backgroundColor '#ffffff', border `1px solid #e8e8ed`, borderRadius 12
// 按钮: backgroundColor '#007aff' 或描边 1px solid #007aff
// 中间高亮卡: backgroundColor '#f5f5f7'
```
