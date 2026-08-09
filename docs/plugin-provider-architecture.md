# 插件 Provider 统一架构（设计草案）

> 目标：把 voice 已验证的「插件 provider」模式推广到 Web 工具（web_search / web_extract），
> 整合成一套系统的 provider 注册/选择/调用方案——第三方插件可实现任意系统能力接口，
> 内置实现降级为「内置 provider」，用户可在设置页选择激活。

## 1. 现状

| 模块 | 现状 | 问题 |
|---|---|---|
| 插件系统 | `SYSTEM_INTERFACES` 清单 + `PluginManager.interfaceProviders` 注册表 + manifest.systemInterfaces 声明 | 只有 voice.stt / voice.tts 两个接口 |
| voice | `VoiceProviderService` 从注册表收集 → 设置页选择激活 | 模式已验证 ✅ |
| web_search | 内部 `SearchProvider` 接口（BingHtml/BraveFree/Ddgs/Searxng 4 个实现） | **写死在代码里**，第三方无法接入自己的搜索 API |
| web_extract | 内部 `ExtractProvider` 接口（LocalCheerio/Firecrawl/Tavily 3 个实现） | 同上，写死 |

核心差距：**能力抽象有了（SearchProvider/ExtractProvider），但注册机制是编译期硬编码**，
没有走插件注册表——插件无法扩展，用户无法切换。

## 2. 目标架构

```
┌─────────────────────────────────────────────────┐
│ 设置页（工具设置）：web.search / web.extract     │
│   激活 provider 选择（内置默认，插件可选）       │
└───────────────┬─────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────┐
│ Provider 注册表（PluginManager.interfaceProviders）│
│   web.search → [builtin-bing, builtin-brave,     │
│                 my-search-plugin]                │
│   web.extract → [builtin-cheerio, firecrawl, ...]│
└───────────────┬─────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────┐
│ 工具层（web-search-tool / web-extract-tool）      │
│   不再直接 new 内置 provider                     │
│   改为：查注册表 → 取激活 provider → 调 IPC       │
└─────────────────────────────────────────────────┘
```

### 2.1 接口定义（system-interfaces.ts 追加）

```ts
{
  id: 'web.search',
  name: '网页搜索',
  description: '把查询词转成搜索结果列表（插件实现自己的搜索源）',
  requiredChannel: 'search:query',        // ({ query, limit }) → { results: [{title,url,description}] }
  optionalChannels: ['models:status', 'models:download'],
},
{
  id: 'web.extract',
  name: '网页抓取',
  description: '把 URL 抓成干净文本（插件实现自己的抓取服务）',
  requiredChannel: 'extract:fetch',       // ({ url, limit? }) → { content, title? }
  optionalChannels: ['models:status', 'models:download'],
},
```

### 2.2 内置 provider 预置注册

内置实现（BingHtml/BraveFree/Ddgs/Searxng、LocalCheerio/Firecrawl/Tavily）**不删除**——
以「内置 provider」身份预置进注册表（`registerBuiltinProvider('web.search', 'builtin-bing', ...)`），
由 `WebProviderService`（仿 VoiceProviderService）管理。行为：

- 插件注册同接口 → 与内置并列，用户可切换（默认内置）
- 内置实现保留为兜底：激活的插件 provider 失败 → 自动回退内置（可选开关）
- 将来内置实现可以整体移出核心（迁移成内置插件），工具层不感知

### 2.3 工具层改造

```ts
// 现状：const provider = new BingHtmlProvider()  // 编译期写死
// 改为：
const provider = await webProviderService.resolveActive('web.search', fallbackChain)
const results = await provider.query({ query, limit })
```

- `WebProviderService`（新，仿 VoiceProviderService）：
  - `providers(iface)` 从 PluginManager 注册表收集
  - `resolveActive(iface)` 读取 app_settings 激活配置 → 查注册表 → 找不到回退默认/内置
  - `call(iface, channel, payload)` 统一 IPC 调用（插件 provider 走 `invokePlugin(channel)`）
- 内置 provider 与插件 provider 统一成同一调用形态：内置走本地函数，插件走 IPC——封装在 ProviderAdapter 里
- 工具 schema 不变（AgentLoop/前端无感知）——只换执行内核

### 2.4 插件侧（第三方开发者）

一个搜索插件只需要：

```jsonc
// manifest.json
{
  "id": "my-search",
  "systemInterfaces": [{ "id": "web.search", "version": 1 }],
  "capabilities": ["web-search"]
}
```

```js
// index.js
ctx.registerIpc('search:query', async ({ query, limit }) => {
  const results = await mySearchApi(query, limit)  // 任何实现：自建 API/付费源/爬虫
  return { results }
})
```

插件自检（check）可以要求 API key 配置（getConfigSchema 里加 string 字段）——复用现有配置体系。

### 2.5 前端：工具管理增强（不复用系统设置）

工具管理页（AgentToolsView）增强，给「支持 provider 的工具」提供设置入口：

1. **工具定义加字段**：`ToolSchema` / `ToolItem` 增加 `supportsProvider?: boolean`
   （后端工具注册时声明；默认 undefined = 不支持）
   - 内置支持：web_search / web_extract（`supportsProvider: true`）
   - 普通工具（terminal/patch 等）：无该字段——不显示设置按钮

2. **工具卡片加设置按钮**：AgentToolsView 的工具行/卡片
   - `v-if="tool.supportsProvider"` 显示「设置」按钮（齿轮图标，排在开关后面）
   - 点击 → `router.push('/workspace/agents/:profile/tools/:toolName/provider')`
   - 无该字段的工具：卡片保持现状（无设置按钮）

3. **新增 L3 页面**：`ToolProviderSettingsView.vue`（路由 `agents/:profile/tools/:toolName/provider`）
   - 展示该工具的 provider 列表（从 PluginManager 注册表收集——内置 + 插件）
   - 激活 provider 选择（单选，存 app_settings）
   - 插件 provider 的配置（API key 等——通过插件 getConfigSchema 动态渲染表单）
   - 失败回退开关（激活插件失败 → 回退内置）
   - 模型管理页同款布局（L3PageLayout）

4. **工具管理页交互链**：AgentToolsView（卡片+设置按钮）→ router.push → ToolProviderSettingsView（provider 列表/激活/配置）→ 返回

前端不直接复用系统设置页的原因：工具 provider 设置是「按工具维度」的（每个工具自己的
provider 选择），系统设置是全局维度（语音/通用）——维度不同，独立 L3 页更清晰。

## 3. 实施路线

| 步骤 | 内容 | 涉及 |
|---|---|---|
| P1 | `system-interfaces.ts` 加 web.search / web.extract 定义 | 1 文件 |
| P2 | 新建 `WebProviderService`（收集/激活/调用/回退）+ 内置 provider 预置注册适配 | 新文件 + tool-manager 关联 |
| P3 | web-search-tool / web-extract-tool 改走 WebProviderService（保留 schema/输出不变） | 2 文件 |
| P4 | 前端：工具定义加 `supportsProvider` 字段 + 工具卡片加设置按钮 + 新增 L3 provider 设置页（不复用系统设置） | 前端 3-4 文件 |
| P5 | 验证：内置默认行为不变 + 手写一个演示插件（如接 Tavily/Serper）端到端跑通 | 验证 |
| P6 | （可选）沉淀文档：插件开发指南（provider 模式教程）+ 示例插件 | docs |

## 4. 关键设计决策（待确认）

1. **内置 provider 形态**：保留代码内置（预置注册）——最小改动；还是拆成「内置插件」——更统一但重构大。建议：P1-P5 保留内置，P6 再评估迁移。
2. **失败回退**：激活插件失败是否自动回退内置？建议：默认回退（配开关），避免插件 key 失效时工具全挂。
3. **接口粒度**：web.search / web.extract 拆两个接口（现状一致）；未来 web_search 的图片搜索/新闻搜索作为扩展 channel（`search:queryImages`）不新建接口。
4. **provider 配置**：API key 等走插件 getConfigSchema（复用现有配置页）——不进工具 schema。
5. **并发/超时**：插件 provider 调用走现有 IPC 超时机制；内置 provider 保持现状。

## 5. 收益

- 第三方可接入任意搜索/抓取服务（Tavily/Serper/自建爬虫/公司内网搜索……）——不改核心代码
- 用户可在设置页切换搜索后端，可对比质量/成本
- 内置实现与插件统一抽象——将来加新能力（如代码执行/图像生成）同一套模式复制
- 与 voice 模式一致，心智负担低
