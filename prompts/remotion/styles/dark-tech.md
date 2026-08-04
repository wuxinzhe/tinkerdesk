# 风格：深色科技风（dark-tech）

> 用于：循环流程、架构图、技术概念演示（AgentLoop、数据流、三循环嵌套）。

## 设计令牌

| Token | 值 |
|:--|:--|
| 背景 | `#1a1a2e`（深蓝黑） |
| 卡片（非活跃） | `#333` |
| 高亮蓝 | `#4f8cff` |
| 高亮橙 | `#ff8c4f` |
| 高亮绿 | `#4fff8c` |
| 文字 | `#ffffff` |
| 次级文字 | `rgba(255,255,255,0.6)` |
| 字体 | `sans-serif` |
| 圆角 | `20px`（大卡片） |
| 发光阴影 | `0 0 30px 同高亮色`（active 时） |

## 动画原则

- **状态轮转**：多个环节（思考→工具→结果）按周期高亮
  ```tsx
  const cycle = Math.floor(frame / 30) % 3;  // 每 30 帧轮换
  const progress = (frame % 30) / 30;
  ```
- 活跃卡片：背景变高亮色 + `scale(1 + progress*0.15)` + 发光阴影
- 非活跃卡片：暗色 `#333`，无阴影
- 过渡靠 transform scale + backgroundColor 切换（配合 transition 0.1s）

## 组件写法要点

```tsx
const active = i === cycle;
const scale = active ? 1 + progress * 0.15 : 1;
style={{
  backgroundColor: active ? s.color : '#333',
  transform: `scale(${scale})`,
  boxShadow: active ? `0 0 30px ${s.color}` : 'none',
}}
```

## 适用内容

- AgentLoop 循环（思考/工具/结果）
- 三循环嵌套（对话/工具/审批）
- 架构分层（core/desktop 逐层点亮）
- 数据流（SQLite→Entity→DTO→VO）
