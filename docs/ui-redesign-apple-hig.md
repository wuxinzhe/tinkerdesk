# TinkerDesk UI 重设计方案（Apple HIG 全量对齐）

> 版本：v1.0（2026-08-07）｜依据：apple-hig skill（官方 2026 版，153 节全量库）
> 原则：**先评审本方案，达成共识后再分阶段改造**。所有数值/规则可追溯到 HIG references 文件。

---

## 0. 现状盘点与差距分析

### 0.1 已有基础（保留）
- `--sa-*` 令牌体系（浅色单套）：主色 #007aff、文本 4 级（#1d1d1f/#86868b/#aeaeb2/#c7c7cc）、背景 3 级、边框 #e8e8ed、圆角 6/8/12、8pt 网格、动效 100/200/300ms
- 三栏布局（lv1 图标栏 + lv2 可折叠列 + lv3 内容区），折叠动画已按外层统一（width 0.2s + 固定宽淡出）
- 部分组件已 HIG 化（GlobalTipToast、GeneralSettingsView、音波框）

### 0.2 差距清单（对照 HIG）

| # | 差距 | HIG 要求 | 影响 |
|:--|:--|:--|:--|
| G1 | **无深色模式** | 尊重 `prefers-color-scheme`，两级背景 base/elevated | 夜间体验 |
| G2 | **无材质层级** | 功能层（侧栏/工具条）用 Liquid Glass，内容层纯色 | 缺少 Apple 质感 |
| G3 | **字体栈 HarmonyOS 优先** | 中文首选 PingFang SC | 字体观感 |
| G4 | **控件过小**（SaActionBtn 26px/11px） | 按钮 ≥36px，字号 ≥13px；触控 ≥44pt | 点击体验 |
| G5 | **次要按钮描边 + hover 变填充** | 次要按钮 subtle（无边框无背景） | 层级混乱 |
| G6 | **动效不统一**（部分 0.3s cubic-bezier(0,0,0.2,1)） | 全局 ease-in-out 0.15-0.2s | 手感 |
| G7 | **无 prefers-reduced-motion 处理** | 开启时降级 opacity | 无障碍 |
| G8 | **列表/卡片分隔不统一** | 白底 + hairline（0.5px）分隔 | 视觉噪音 |
| G9 | **组件数值散落**（各文件自写） | 统一令牌 + 组件规范 | 一致性 |
| G10 | **滚动条全隐藏** | 桌面可保留细滚动条（HIG 不强制隐藏） | 可用性 |

---

## 1. 设计令牌升级（src/renderer/styles/variables.css）

### 1.1 深色模式（新增，跟随系统）
```css
@media (prefers-color-scheme: dark) {
  :root {
    /* 背景两级：base 退后 / elevated 前进 */
    --sa-bg-primary: #1e1e1e;      /* base */
    --sa-bg-elevated: #2c2c2e;     /* 弹层/浮层 */
    --sa-bg-secondary: #2c2c2e;    /* 组容器 */
    --sa-bg-tertiary: #3a3a3c;     /* 次级组 */
    --sa-bg-glass: rgba(30, 30, 30, 0.80);
    --sa-bg-bubble-assistant: #2c2c2e;
    /* 文本 */
    --sa-text-primary: #f5f5f7;
    --sa-text-secondary: #ebebed;
    --sa-text-tertiary: #98989d;
    --sa-text-quaternary: #6e6e73;
    /* 边框（深色更亮） */
    --sa-border: #48484a;
    /* 分隔线 hairline 用 rgba(255,255,255,0.08) */
  }
}
```
- 对比度：正文 ≥4.5:1，小字/辅助争取 7:1
- **铁律：组件禁止写死 hex**，全部走语义变量

### 1.2 材质（Liquid Glass——只用于功能层）
| 层 | 参数 |
|:--|:--|
| lv1 侧栏（图标栏） | `rgba(255,255,255,0.55) blur(30px) saturate(200%)` |
| lv2/l3 工具条 | `rgba(255,255,255,0.72) blur(20px) saturate(180%)` |
| 深色 | `rgba(30,30,30,0.80) blur(20px) saturate(180%)` |
| 内容层（列表/设置/聊天） | **纯色**（禁用玻璃） |

- 毛玻璃不可见修复：工作区背景加极浅渐变 `linear-gradient(180deg, #fafafa 0%, #f5f5f7 100%)`（深色 `#1e1e1e → #2c2c2e`）
- `prefers-reduced-transparency` 时玻璃降级纯色

### 1.3 字体栈修正
```css
--sa-font-stack: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
  'PingFang SC', 'Microsoft YaHei', sans-serif;   /* 移除 HarmonyOS 优先 */
--sa-font-mono: 'SF Mono', 'Menlo', 'Consolas', monospace;
```

### 1.4 新增尺寸令牌（控件高度/点击区）
```css
--sa-control-s: 28px;   /* 紧凑（图标按钮） */
--sa-control-m: 32px;   /* 标准行内 */
--sa-control-l: 36px;   /* 主操作 */
--sa-control-xl: 44px;  /* 触控/表单大按钮 */
--sa-hit-min: 36px;     /* 桌面最小点击区 */
```
- 触控设备（`(pointer: coarse)`）点击区 ≥44pt；桌面 ≥36px（HIG：控件最小 44pt 是触控基准，桌面可 36）

### 1.5 阴影层级（替代重阴影）
```css
--sa-shadow-hairline: 0 0.5px 0 rgba(0,0,0,0.06);   /* 工具条边界 */
--sa-shadow-sm: 0 1px 3px rgba(0,0,0,0.04);         /* 卡片 */
--sa-shadow-md: 0 4px 12px rgba(0,0,0,0.08);        /* 弹层 */
```

### 1.6 动效统一
```css
--sa-ease: cubic-bezier(0.25, 0.1, 0.25, 1);   /* ease-in-out */
--sa-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 面板展开 */
```
- 全局默认 0.15-0.2s；hover/按压 ≤0.12s；删除 0.3s cubic-bezier(0,0,0.2,1) 的非标曲线
- `@media (prefers-reduced-motion: reduce)`：所有非必要动画降级 opacity 0.15s 或关闭

---

## 2. 布局系统（对齐 Sidebars + Toolbars + Split Views）

### 2.1 三栏架构
```
┌──┬─────┬────────────────────────┐
│lv1│ lv2 │ lv3 内容区              │
│65px│280px│（可折叠 1px）          │
│玻璃│纯色 │ 背景 #fafafa→#f5f5f7   │
│图标│hairline 列表                 │
└──┴─────┴────────────────────────┘
```
- lv1：65px 玻璃图标栏（选中态 accent 8% 背景 + accent 图标）
- lv2：280px 纯色列表（折叠动画保留现有实现）
- lv3：内容区 + 顶部工具条（52px 玻璃，hairline 下边界）

### 2.2 断点
- regular ≥768px（三栏）；compact <768px（抽屉 + 单栏）
- 平板 768-1023px：lv1 隐藏（已有）

### 2.3 列表规范（SessionList / AgentListView / SettingsListView / WorkshopListView）
- 白底 + **hairline 分隔**（`border-top: 0.5px solid var(--sa-border)` 或 box-shadow hairline）
- 选中态：`accent 8% 背景` + 左侧 3px accent 指示条（HIG Sidebars）
- hover：`--sa-bg-secondary`（0.12s）
- 行高：紧凑 60px / 标准 68px（8pt 网格）
- 圆角列表卡片（设置页 grouped list）：整卡 12px 圆角 + 行间 hairline（已有 GeneralSettingsView 范式 → 推广）

### 2.4 页面内容区
- padding：桌面 20px（--sa-space-5）/ 移动 16px
- 内容最大宽度 720px（表单/详情页居中——HIG 表单宽度）
- 分组标题：iOS 风格 11px/500/#aeaeb2/uppercase + letter-spacing（列表页）/ macOS 风格 13px/600（详情面板）

---

## 3. 组件规范（逐组件对齐 HIG references）

> 每组件标注 HIG 来源节（components.md）

### 3.1 按钮 Buttons（`components.md 七`）
| 类型 | 样式 |
|:--|:--|
| 主按钮 | solid #007aff，`--sa-control-l`(36px)，圆角 8px，白字，hover #0066d6 |
| 次要按钮 | **subtle**（无边框无背景），文字 accent 或 text-primary，hover bg 5%——**废除描边变填充** |
| 危险 | 红字（#ff3b30），hover bg red 5%；列表内危险操作 `margin-left: auto` 隔离 |
| 图标按钮 | 36×36 点击区，图标 16-18px，hover bg 5% |
| 尺寸档 | S 28 / M 32 / L 36 / XL 44（触控） |
| 状态 | disabled opacity 0.5；loading 内置 spinner；active 反馈 opacity 0.7（按暗） |
| 命名 | 动词短语（"发送""保存""新建对话"），≤3 词 |

### 3.2 输入框 Text Fields（`components.md 五十二`）
- 高 32（行内）/36（表单）；圆角 6-8px；白底（深色 base）
- focus：`--sa-shadow-focus`（0 0 0 3px accent 15%）
- placeholder：tertiary；错误：红边框 + `--sa-shadow-error`
- 标签：13px 上置或行内；辅助说明 11px tertiary

### 3.3 侧边栏 Sidebars（`components.md 四十四`）
- lv1 图标栏：玻璃（1.2），图标 22px，选中 accent
- lv2 列表：纯色，选中态规范（2.3）
- 折叠按钮：现有实现（列内 absolute + 固定宽淡出）**保留**

### 3.4 工具条 Toolbars（`components.md 五十七`）
- 玻璃（1.2）+ **无 border-bottom**（hairline box-shadow）
- 标题 13px semibold，≤15 字符；操作按钮右对齐
- l2 toolbar：hamburger（移动）+ 标题 + 操作
- l3 toolbar：返回 + 标题 + 操作组

### 3.5 卡片（AgentCard / ApprovalCard / ClarifyCard / SessionPreviewCard）
- 白底 + `--sa-border` hairline + 12px 圆角 + `--sa-shadow-sm`
- 标题 13px semibold / 描述 11px tertiary
- 操作按钮图标化（22×22 点击区 36）

### 3.6 弹窗 ConfirmModal（Alerts/Sheets——`components.md 四`）
- 居中卡片：max-width 320px（Alert）/ 底部 Sheet（移动）
- 标题 17px semibold / 消息 13px / 按钮 36px
- 主按钮右侧（macOS 惯例）或系统 Alert 竖排（iOS 惯例）——**采用 macOS：横排主按钮右侧**
- 遮罩 `--sa-overlay` + 弹层 `--sa-bg-elevated`；入场 0.2s ease-out 缩放 0.96→1

### 3.7 开关 Toggles（`components.md 五十五`）
- 系统开关样式：40×24 轨道，accent 开启 / 灰关闭，圆角轨道
- 列表行内使用；label 左侧，开关右侧

### 3.8 分段控件 Segmented（`components.md 四十二`）
- 高 32px，容器 bg-secondary 圆角 8px，选中段白底 + 轻阴影
- 等宽段；≤5 段

### 3.9 消息气泡 MessageBubble（聊天核心）
- 助手气泡：`--sa-bg-bubble-assistant`（浅色 #ececed / 深色 #2c2c2e），13px，圆角 16（顶角 4）
- 用户气泡：accent（#007aff）白字，或 accent 9% 深字——**统一：浅色 accent 白字**
- 时间戳/状态 11px tertiary；气泡最大宽 75%
- 代码块：`--sa-font-mono` + 深色块（#1d1d1f 浅色主题）

### 3.10 加载与骨架（Loading/Skeleton——`patterns.md 十`）
- 初次加载：骨架屏（bg-tertiary 圆角块 + 呼吸 1.5s）
- 行内加载：spinner 16px；长任务：线性进度条（indeterminate 系统风格）
- 加载必须有反馈；禁止无限转圈无文案

### 3.11 空态 SaEmpty（`patterns.md` 空状态）
- 图标 28-32px（tertiary）+ 标题 13px semibold + 描述 11px tertiary + 可选主按钮
- 空态给行动路径（"新建""去设置"）

### 3.12 表单（SaFormGroup / SaFormActions / CustomModelForm 等）
- 分组卡片（Grouped List）：12px 圆角卡 + 行间 hairline + 行内 label/控件
- 行高 44px（触控友好）
- 操作区：主按钮右侧、次要按钮左侧（subtle）
- 必填标注：label 加红星或说明文字

### 3.13 徽标/标签 SaBadge
- 圆角 4px，字号 10-11px，语义色（success/warning/error/destructive 各 10% 背景 + 深字）
- 颜色不单独传状态（配图标或文字）

### 3.14 滚动条（G10 修复）
- 桌面恢复细滚动条：宽度 6px，thumb #c7c7cc hover #aeaeb2（深色 #48484a）
- `scrollbar-width: thin`（Firefox）；`:hover` 区域才显示（macOS 风格）

---

## 4. 交互模式（Patterns）

### 4.1 加载 Loading（`patterns.md 十`）
- 骨架屏（初载）→ 行内 spinner（局部）→ 线性进度（长任务）
- 禁止：无反馈等待 >300ms

### 4.2 反馈 Feedback（`patterns.md 五`）
- 操作即时反馈（按钮 loading 态、选中变化）
- 错误：GlobalTipToast error（**手动关**）+ 表单错误红 ring
- 成功：tip 3s 自动关（已实现）
- 撤销路径：破坏性操作确认（ConfirmModal）；可恢复操作给撤销提示

### 4.3 模态 Modality（`patterns.md 十三`）
- 一次一个模态；优先非阻塞（ConfirmModal 局部/内联）而非全屏
- 模态可 Esc 关闭、可点遮罩关闭（需确认语义）

### 4.4 设置 Settings（`patterns.md 二十二`）
- 分组卡片 + 行内控件（推广 GeneralSettingsView 范式到全部设置页）
- 默认值合理；改动即时生效（不强制"保存"按钮——除非多字段表单）
- 未来可分组：模型/语音/MCP/插件/通用

### 4.5 空态/错误状态
- 空态：三要素（图标+标题+描述）+ 行动按钮
- 错误：错误信息 + 恢复路径（重试/返回）；错误文案用户语言（非技术术语）

### 4.6 动效 Motion（`fundamentals.md 十二`）
- 全局：ease-in-out 0.15-0.2s；hover ≤0.12s
- 页面切换：fade 0.2s（已有）或 slide 0.25s（保持现有——统一 0.25s）
- 折叠：现有 width 0.2s 保留
- 列表插入：短淡入（0.15s）不位移
- `prefers-reduced-motion`：全部降级 opacity 或关闭

---

## 5. 深色模式 + 无障碍（Technologies: Accessibility）

### 5.1 深色模式
- 全量 `prefers-color-scheme: dark` 令牌（1.1）
- 组件逐项排查写死 hex（`grep -rn '#[0-9a-fA-F]\{3,6\}' src/renderer`——替换为语义变量）
- 毛玻璃深色参数（1.2）；`prefers-reduced-transparency` 降级
- 带白底的图表/插图深色下加 0.85 透明度

### 5.2 无障碍
- 对比度：正文 ≥4.5:1（#86868b 作正文不达标——正文用 secondary 时需提亮；深色已提亮）
- 焦点可见：所有交互元素 focus ring（`--sa-shadow-focus`）
- 键盘：全功能键盘可达（Tab 顺序、Enter/Space 激活、Esc 关闭弹窗）
- 语义：按钮有 aria-label（图标按钮）、列表项 role
- Dynamic Type：字号可放大（rem 或 clamp），布局不破（禁止固定高度截断）

---

## 6. 实施路线（评审通过后分阶段执行）

| 阶段 | 内容 | 文件 | 验证 |
|:--|:--|:--|:--|
| **P1 令牌层** | 深色变量 + 材质 + 尺寸 + 阴影 + 动效曲线 + 字体栈 | `styles/variables.css` | vue-tsc + CDP 检查深色切换 |
| **P2 布局层** | lv1/lv2/lv3 玻璃材质 + 工具条 hairline + 背景渐变 + 滚动条 | `WorkspaceView.vue` 等 | 截图对比 + 折叠回归 |
| **P3 组件层** | Sa* 系列（按钮/输入/表单/空态/加载）+ 卡片 + 弹窗 + 开关 + 分段 | `components/` | 逐组件 CDP 检查 |
| **P4 聊天层** | MessageBubble + ChatInput + ChatArea + SessionList | `components/workspace/` | 消息流回归 |
| **P5 列表/设置层** | AgentListView / SettingsListView / WorkshopListView + 设置详情页 | `views/` | grouped list 统一 |
| **P6 模式与无障碍** | 加载/反馈/模态统一 + 深色全量排查 + 焦点/键盘 | 全项目 | `grep hex` 清零 + 对比度检查 |

每阶段独立提交 + 推送；P1-P2 无功能变化（纯样式），P3 起逐组件核对 HIG references 数值。

---

## 附：HIG 对照速查（本方案引用来源）
- 色彩/深色：`references/fundamentals.md`（四 颜色、五 深色模式）
- 材质：`references/fundamentals.md`（十一 材质）
- 字体：`references/fundamentals.md`（十七 字体排印）
- 动效：`references/fundamentals.md`（十二 动态效果）
- 按钮/输入/侧栏/工具条/弹窗/开关/分段：`references/components.md`（七/五十二/四十四/五十七/四/五十五/四十二）
- 加载/反馈/模态/设置：`references/patterns.md`（十/五/十三/二十二）
- 无障碍：`references/technologies.md`（VoiceOver 节）
