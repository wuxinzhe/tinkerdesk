# LLM 层

`src/main/core/llm/`——模型调用的统一入口：按场景（scene）分发到 Operation + 多模型回退 + 本地重试。

## 组件

| 组件 | 文件 | 职责 |
|:--|:--|:--|
| LlmRouter | `llm-router.ts` | 统一入口——chat（流式）/ execute（非流式）——Phase 1/2/3 管线 |
| LlmOperationManager | `llm-operation-manager.ts` | 按 scene 索引 Operation（chat / summary / title_generation） |
| LlmClientManager | `llm-client-manager.ts` | 按 apiMode 索引客户端（openai / anthropic） |
| OpenAIClient | `client/openai-client.ts` | apiMode='openai'——OpenAI 兼容请求体/响应解析 |
| AnthropicClient | `client/anthropic-client.ts` | apiMode='anthropic'——Claude 原生 Messages API（工具 schema 从 OpenAI 格式转换） |
| usage-recorder | `usage-recorder.ts` | 用量统计——文件 append 缓冲 → 批量入库（llm_usage_log） |

## 调用管线（LlmRouter.caller）

```
Phase 1  构建输入：operation.buildInput(options)（chat 原样 / summary 用压缩摘要 / title 提取首条 user）
Phase 2  模型调用循环：按 modelConfigs 顺序逐个尝试——每个模型本地重试 MAX_LOCAL_ATTEMPTS(2) 次
           - 调用异常（网络错误等）→ 退避重试（NETWORK_RETRY_WAIT_MS × attempt）
           - 429 限流 → 等待 RATE_LIMIT_WAIT_MS 重试同一模型（组织级限额——不立即回退）
Phase 3  Operation 判决：op.handle(response, ...) → verdict：
           SUCCESS   → 返回（记录 usage success）
           FATAL     → 返回（错误响应——不重试）
           RETRYABLE → 下一个模型（回退）——全部失败 → ERROR_ALL_MODELS_FAILED
```

## 响应类型（resType——下游分发依据）

```
RES_TEXT / RES_TOOL_CALLS / RES_REASONING / RES_EMPTY / RES_TRUNCATED
ERROR_RATE_LIMITED / ERROR_AUTH_FAILED / ERROR_CONTEXT_OVERFLOW /
ERROR_SERVER_ERROR / ERROR_NETWORK_ERROR / ERROR_INVALID_REQUEST / ERROR_ALL_MODELS_FAILED
```

## 模型配置解析（ModelConfigService）

```
custom_models（用户接入的模型——全局共享）+ system_providers（供应商模板）
  → 按 profile 组装 ModelConfig[]：
     { modelName, apiKey, baseUrl, contextLimit, apiMode, reasoningDepth }
场景绑定（user_scene_models）：scene → [主模型(is_main=1) + 备用(priority)]
  → resolveForScene：主 → 备用（priority 升序）→ 场景无绑定 → 主对话场景主模型
```

## 上下文完整性保障（message-utils）

两条防线（严格 role 校验的 provider——DeepSeek/Kimi/opencode——会拒绝畸形序列）：

```
① repairMessageSequence —— 上下文加载后（历史形态修复）
   - 合并相邻 assistant（tool_calls 后紧跟 assistant = 400）
   - 丢弃游离 tool / 合并相邻 user / 修正 system 位置
② sanitizeApiMessages —— 每次 LLM 调用发送前（无条件跑）
   - 丢弃无配对 tool 结果
   - 注入 stub tool 结果（assistant tool_calls 缺 tool 消息时——根治 400）
   - tool 消息按 id 去重
   - 只处理内存副本——不改 DB
```

## 用量统计（usage-recorder）

```
请求完成 → append 一行 JSON 到 usage-pending.log（<1ms——主链路不碰 DB）
  → 定时器（5s）/ 行数满（50）→ 批量 INSERT（单事务）→ 截断文件
  → before-quit 同步 flush；启动时残留 log 兜底入库（崩溃恢复）
幂等：request_id UNIQUE + INSERT OR IGNORE——崩溃重放不重复计数
```

## 相关文档

- [架构总览](overview.md)
- [Agent 执行循环](agent-loop.md)
- [数据模型](data-model.md)
