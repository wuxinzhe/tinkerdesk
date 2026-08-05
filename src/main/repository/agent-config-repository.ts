/**
 * agent-config-repository.ts — agent_configs 表仓库
 *
 * 复刻 showing-agent AgentConfigRepository：
 * per-agent 细节配置存储（拍平字段，非 JSONB）。
 * 本地单用户：主键从 (user_id, profile) 简化为 profile。
 */
import {getDatabase} from './database'
import type {AgentConfigEntity} from './types'

/** Agent 配置实体（对应 AgentConfigEntity，NULL = 使用全局默认值） */

const COLS = 'profile, max_iterations, tool_execution_timeout, max_conversations, memory_max_chars, user_max_chars, threshold_percent, tail_ratio, agent_soul_prompt, warnings_enabled, hard_stop_enabled, exact_failure_warn_after, same_tool_failure_warn_after, no_progress_warn_after, exact_failure_block_after, same_tool_failure_halt_after, no_progress_block_after, created_at, updated_at'

function toEntity(row: Record<string, unknown>): AgentConfigEntity {
  return {
    profile: row.profile as string,
    maxIterations: row.max_iterations as number,
    toolExecutionTimeout: row.tool_execution_timeout as number,
    maxConversations: row.max_conversations as number,
    memoryMaxChars: row.memory_max_chars as number,
    userMaxChars: row.user_max_chars as number,
    thresholdPercent: row.threshold_percent as number,
    tailRatio: row.tail_ratio as number,
    agentSoulPrompt: row.agent_soul_prompt as string | null,
    warningsEnabled: row.warnings_enabled as number,
    hardStopEnabled: row.hard_stop_enabled as number,
    exactFailureWarnAfter: row.exact_failure_warn_after as number,
    sameToolFailureWarnAfter: row.same_tool_failure_warn_after as number,
    noProgressWarnAfter: row.no_progress_warn_after as number,
    exactFailureBlockAfter: row.exact_failure_block_after as number,
    sameToolFailureHaltAfter: row.same_tool_failure_halt_after as number,
    noProgressBlockAfter: row.no_progress_block_after as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Agent 配置仓库 */
export class AgentConfigRepository {
  /** 根据 profile 查询 Agent 配置 */
  findById(profile: string): AgentConfigEntity | null {
    const db = getDatabase()
    const row = db.prepare(`SELECT ${COLS} FROM agent_configs WHERE profile = ?`).get(profile) as
      | Record<string, unknown>
      | undefined
    return row ? toEntity(row) : null
  }

  /** 保存或更新 Agent 配置（UPSERT，主键冲突时更新所有字段） */
  save(entity: AgentConfigEntity): void {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO agent_configs (
          profile,
          max_iterations, tool_execution_timeout,
          max_conversations, memory_max_chars, user_max_chars,
          threshold_percent, tail_ratio,
          agent_soul_prompt,
          warnings_enabled, hard_stop_enabled,
          exact_failure_warn_after, same_tool_failure_warn_after, no_progress_warn_after,
          exact_failure_block_after, same_tool_failure_halt_after, no_progress_block_after
       ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )
       ON CONFLICT (profile) DO UPDATE SET
          max_iterations = excluded.max_iterations,
          tool_execution_timeout = excluded.tool_execution_timeout,
          max_conversations = excluded.max_conversations,
          memory_max_chars = excluded.memory_max_chars,
          user_max_chars = excluded.user_max_chars,
          threshold_percent = excluded.threshold_percent,
          tail_ratio = excluded.tail_ratio,
          agent_soul_prompt = excluded.agent_soul_prompt,
          warnings_enabled = excluded.warnings_enabled,
          hard_stop_enabled = excluded.hard_stop_enabled,
          exact_failure_warn_after = excluded.exact_failure_warn_after,
          same_tool_failure_warn_after = excluded.same_tool_failure_warn_after,
          no_progress_warn_after = excluded.no_progress_warn_after,
          exact_failure_block_after = excluded.exact_failure_block_after,
          same_tool_failure_halt_after = excluded.same_tool_failure_halt_after,
          no_progress_block_after = excluded.no_progress_block_after`
    ).run(
      entity.profile,
      entity.maxIterations,
      entity.toolExecutionTimeout,
      entity.maxConversations,
      entity.memoryMaxChars,
      entity.userMaxChars,
      entity.thresholdPercent,
      entity.tailRatio,
      entity.agentSoulPrompt,
      entity.warningsEnabled,
      entity.hardStopEnabled,
      entity.exactFailureWarnAfter,
      entity.sameToolFailureWarnAfter,
      entity.noProgressWarnAfter,
      entity.exactFailureBlockAfter,
      entity.sameToolFailureHaltAfter,
      entity.noProgressBlockAfter
    )
  }
}
