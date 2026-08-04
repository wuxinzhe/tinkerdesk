# 14-Tool Result 分片存储与按需读取

> 客户端分片 → IndexedDB 存储 → 摘要提示 LLM → LLM 通过工具按需读取

## 1. 问题

Tool result 经过 ChunkHandler 分片传输到服务端后，服务端可以重组成完整的结果。但此时如果把完整结果直接发给 LLM：

- **超大 payload** 撑爆 LLM 上下文窗口
- **LLM 不需要全部内容**，只需从中提取关键信息
- **传输链路浪费**，256KB 的 STOMP 帧又会被撑满

解决方案：**分片存储到客户端 IndexedDB，LLM 通过 `read_indexdb` 工具按需逐片读取**。

## 2. 总体链路

```
Tool 执行 → result ≈ 800KB
    ↓
ChunkHandler 分片传输 (200KB×4)
    ↓
服务端重组 → 判断 result > 阈值 (如 100KB)
    ↓
服务端不直接发送完整 result
    ↓
服务端写入结果到...（此处为未来设计，当前先聚焦客户端侧）
    ↓
客户端收到"存储模式"响应
    ↓
┌──────────────────────────────────────┐
│ 客户端 IndexedDB 存储                │
│                                      │
│  key: toolCallId:partIndex           │
│  value: result 片段                  │
│  meta: totalParts, timestamp         │
└──────────────────────────────────────┘
    ↓
客户端向 LLM 发送摘要提示（替换原始 result）
    ↓
LLM 调 read_indexdb(method="query", storeName="parts", indexName="toolCallId", keyValue="{toolCallId}", offset=0, limit=1)
    ↓
客户端拦截此工具调用
    ↓
从 IndexedDB 查询 → 返回对应片段
    ↓
LLM 读取后继续推理...
```

## 3. 客户端存储层 — IndexedDB

### 技术选型

| | IndexedDB | localStorage |
|---|---|---|
| 存储上限 | 磁盘剩余空间（数 GB） | **5MB** |
| 单条容量 | 不限 | ~5MB |
| 阻塞 | 异步，不阻塞 UI | **同步，200KB 写入会冻住 UI** |
| 索引 | 按 toolCallId 范围查询 | 只能遍历 |
| 清理 | TTL + 批量删除 | 逐条删或全清 |

**结论：IndexedDB。** localStorage 的 5MB 上限 + 同步写入阻塞 UI，无法满足需求。

### 封装接口

```typescript
class ToolResultStore {
  /** 保存一个分片 */
  async savePart(toolCallId: string, partIndex: number, content: string, totalParts: number): Promise<void>

  /** 按 offset/limit 读取分片 */
  async readParts(toolCallId: string, offset: number, limit: number): Promise<{
    parts: string[]
    totalParts: number
  }>

  /** 删除指定 toolCallId 的所有分片 */
  async cleanup(toolCallId: string): Promise<void>

  /** 清理超过 maxAge 的过期分片 */
  async cleanExpired(maxAgeMs: number): Promise<number>
}
```

### IndexedDB 表结构

```
Database: toolResultStore
  ObjectStore: parts
    keyPath: [toolCallId, partIndex]  // 复合主键
    indexes:
      - toolCallId (unique=false)     // 用于范围查询
      - timestamp (unique=false)      // 用于 TTL 清理

  每条记录：
  {
    toolCallId: string,
    partIndex: number,
    content: string,
    totalParts: number,
    timestamp: number  // Date.now()
  }
```

## 4. 分片读取工具 — `read_tool_result`

<a id="tool-def"></a>

### 4.1 工具分类

`read_indexdb` 属于 **shared 工具**（双端通用工具）：

| 属性 | 值 | 说明 |
|------|-----|------|
| `id` | `read_indexdb` | 工具唯一标识 |
| `toolType` | `shared` | **新增分类**，标记为双端通用 |
| 可用端 | web + desktop | 不依赖 Electron API，共享同一份代码 |

### 4.2 工程位置

```
src/tools/shared/read-indexdb.ts    ← 独立文件，不属于 desktop 也不属于 server
```

### 4.3 工具定义

```typescript
// src/tools/shared/read-indexdb.ts
import { BaseTool } from '@/defines/tools/base-tool'
import { IndexedDbStore } from '@/utils/indexeddb-store'

class ReadIndexDbTool extends BaseTool<{
  method: 'get' | 'query' | 'count' | 'listStores'
  dbName?: string
  storeName?: string
  key?: string
  indexName?: string
  keyValue?: string
  offset?: number
  limit?: number
  order?: 'asc' | 'desc'
}> {
  readonly id = 'read_indexdb'
  readonly name = 'read_indexdb'
  readonly description = '通用 IndexedDB 只读工具 —— 当工具结果过大（超过 100KB）时，'
    + '会被自动分割为多个 200KB 的分片存入 IndexedDB 的 ToolResultDB.parts 表，'
    + 'LLM 必须通过此工具逐片读取。'
    + '从 offset=0 开始逐页读取，直到 hasMore=false 表示全部读完。'
  readonly category = '内置工具'
  readonly toolType = 'shared'

  getSchema(): ToolSchema {
    见 src/tools/shared/read-indexdb.ts 实际实现。
  }
}
```

### 4.4 注册方式

在应用初始化入口注册（`app-init.ts` 或 `LoadingView`）：

```typescript
import { toolRegistry } from '@/services/registry/tool-registry'
import { readIndexDbTool } from '@/tools/shared/read-indexdb'

toolRegistry.registerSharedTool(readIndexDbTool)
```

`registerSharedTool` 是 `registerUiTool` 的替代命名（原方法名语义不准确，保留旧方法做 deprecated 兼容）。

### 4.5 传递链路

```
LLM 调用 read_indexdb(...)
  ↓
服务端 ToolManager.execute()
  → 查客户端工具表 → 读到 schema，toolType='shared'
  → switch(toolType):
       case 'desktop':
       case 'web':
       case 'shared':       ← 新增 case，走同一分支
       case 'iPhone':
       case 'Android':
       case 'web-ext':
         → ClientTool.execute(ctx)
           → 发送 exe_client_tool 事件到前端
  ↓
前端 chat-store 收到 exe_client_tool
  → toolRegistry.execute('read_indexdb', args, sendResult)
  → 命中 registerSharedTool 注册的工具
  → 从 IndexedDB 读取 → 返回结果给 LLM
```

**注意**：`read_indexdb` 的 `toolType: 'shared'` 在注册到服务端时，服务端需新增 `TOOL_TYPE_SHARED` 常量和 switch case（见第 8 节）。

### 4.6 返回格式

```json
{
  "records": [
    { "toolCallId": "call_xxx", "partIndex": 0, "content": "分片0内容", "totalParts": 5, "timestamp": 1234567890 },
    { "toolCallId": "call_xxx", "partIndex": 1, "content": "分片1内容", "totalParts": 5, "timestamp": 1234567890 }
  ],
  "total": 5,
  "offset": 0,
  "limit": 2,
  "hasMore": true
}
```

- `records` — 当前页的分片记录列表，每条含完整的字段（content、partIndex 等）
- `total` — 该 toolCallId 条件下的总记录数
- `offset` — 本次查询的起始偏移，与请求参数一致
- `limit` — 本次查询的返回数上限，与请求参数一致
- `hasMore` — `offset + limit < total` 时 true，提示 LLM 继续翻页

## 5. LLM 提示模板

当 tool result 超过 100KB 时，客户端**不发送原始内容**给 LLM，而是生成以下预览文本替换原始 result：

```
⚠️ 工具结果过大（{totalChars} 字符，约 {totalKB}KB），超过单次传输上限（100KB），
   已自动分割为 {totalParts} 块存入本地 IndexedDB（ToolResultDB.parts 表）。

必须使用 read_indexdb 工具逐块读取：
  → read_indexdb(method="query", storeName="parts",
                  indexName="toolCallId", keyValue="{toolCallId}",
                  offset=0, limit=1)
     读取第 1 块（共 {totalParts} 块）
  → 返回结果中的 hasMore 指示是否还有后续
  → 读完一块后，offset+1 继续读取下一块
  → 直到 hasMore=false 表示全部读完

预览（前 2,000 字符）：
{previewSnippet}
```

> **设计理由**：LLM 通常不需要一次性读取全部 800KB 结果。先读第 1 片就能理解核心信息，有必要再继续读第 2、第 3 片。这种"按需拉取"模式比全量推送更节省 token。

### LLM 使用模式

```
LLM: 需要查看工具结果
  → 看到预览模板，知道结果已被分片
  → read_indexdb(method="query", storeName="parts",
                  indexName="toolCallId", keyValue="abc-123",
                  offset=0, limit=1)
     ← { "records": ["分片0内容..."], "total": 5, "hasMore": true }

  → 从 records[0] 中提取了关键信息，不需要继续读
  → 开始推理回答
```

### 生成位置

预览文本在 `chat-store.ts` 的 `sendResult` 回调中生成，流程：

```
工具执行完成 → result 字符串
    ↓
result.length > 100KB？
    ├── 否 → 直接发送原始 result
    │
    └── 是 → 1. 调用 toolResultStore.savePart() 逐片存入 IndexedDB
              2. 生成上述预览文本
              3. 发送 preview 作为 result 到服务端
              4. 服务端将预览放入 LLM 上下文
              5. LLM 通过 read_indexdb 按需拉取
```

## 6. 清理策略

| 触发时机 | 行为 |
|---------|------|
| **LLM 读取到最后一页（hasMore=false）后** | 客户端自动触发 cleanup(toolCallId) |
| **切换 session** | 清理旧 session 的所有分片 |
| **定时后台（30分钟）** | `toolResultStore.cleanExpired(30min)` 清理 timestamp < now - 30min 的残片 |
| **手工清理** | 用户 clear conversation 时联动清理 |

**为什么用 30 分钟 TTL：**
- LLM 对话通常在一轮（turn）内完成读取
- 30 分钟足够覆盖用户思考/编辑等慢速场景
- 防止对话中断后残留分片长期占用空间

## 7. 阈值决策

| 参数 | 值 | 理由 |
|------|-----|------|
| 分片存储触发阈值 | 100KB | 小于分片传输的 200KB，LLM 通常无需完整阅读 |
| 分片大小 | 200KB | 与传输分片一致，减少拆装次数 |
| 最大存储片数 (per toolCallId) | 5 | 对应 1MB 上限 |

## 8. 服务端改动

### 8.1 ToolConstants.java

新增 `TOOL_TYPE_SHARED` 常量，并加入客户端工具数组：

```java
// 新增
public static final String TOOL_TYPE_SHARED = "shared";

// 客户端工具类型数组（追加一行）
public static final String[] CLIENTS = {
    TOOL_TYPE_DESKTOP,
    TOOL_TYPE_WEB,
    TOOL_TYPE_SHARED,        // ← 新增
    TOOL_TYPE_IPHONE,
    TOOL_TYPE_WEB_EXTENSION,
    TOOL_TYPE_ANDROID
};
```

### 8.2 ToolManager.java

`execute()` 方法的 switch 分支增加 `shared` case，与 `web`/`desktop` 走同一路由：

```java
case TOOL_TYPE_WEB:
case TOOL_TYPE_WEB_EXTENSION:
case TOOL_TYPE_DESKTOP:
case TOOL_TYPE_SHARED:      // ← 新增
case TOOL_TYPE_IPHONE:
case TOOL_TYPE_ANDROID: {
    return clientToolExecutor.execute(ctx);
}
```

**不需要改动的：**
- `ClientTool.java` — 不关心 toolType，所有客户端工具统一经 `sendAction(EXE_CLIENT_TOOL, tc)` 派发
- 工具注册 — 前端的 schema 会自动存到 `ClientToolStore`

## 9. 前端注册命名更新

### 9.1 tool-registry.ts

`registerUiTool` 更名为 `registerSharedTool`，保留旧方法做 deprecated 兼容：

```typescript
export class ToolRegistry {
  /** @deprecated 改用 registerSharedTool */
  registerUiTool(tool: BaseTool): void {
    this.registerSharedTool(tool)
  }

  /** 注册双端通用内置工具（如 read_tool_result） */
  registerSharedTool(tool: BaseTool): void {
    this.uiTools.push(tool)
    this.notifyChanged()
  }
}
```

### 9.2 BaseTool 默认值

`BaseTool.toolType` 默认值保持 `'desktop'` 不变（不影响已有桌面工具），`read_tool_result` 显式覆盖为 `'shared'`。

## 10. 文件结构

```
src/
├── tools/
│   ├── desktop/                     ← Electron 专属工具
│   │   ├── index.ts
│   │   ├── terminal.ts
│   │   ├── read-file.ts
│   │   └── ...
│   ├── shared/                      ← 双端通用工具（新增）
│   │   └── read-indexdb.ts          ← 本文
│   └── ui/                          ← Chrome Extension 桥
│       └── bridge.ts
├── utils/
│   ├── indexeddb-store.ts           ← 通用 IndexedDB 只读层（新增）
│   └── tool-result-store.ts         ← Tool Result 写操作封装（继承 indexeddb-store）
├── renderer/utils/
│   ├── interceptors/
│   │   ├── InterceptionPipeline.ts
│   │   ├── ChunkHandler.ts
│   │   └── SizeLimitHandler.ts
│   └── notification-utils.ts
└── services/registry/
    └── tool-registry.ts             ← registerSharedTool 方法
```
