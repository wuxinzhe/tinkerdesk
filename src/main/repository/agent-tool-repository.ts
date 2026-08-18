/**
 * agent-tool-repository.ts — 工具授权仓库（agent_tools 表）
 *
 * per-profile 工具授权（toolManager 授权/回收落库；卸载=物理删除记录）。
 * 该 profile 的 toolNameSet 优先取此表；空则回落 AgentMode 默认工具集（见 AgentToolService）。
 */
import { getDatabase } from './database'

export class AgentToolRepository {
  /** 某 profile 已授权的工具名集合 */
  getToolNames(profile: string): string[] {
    const db = getDatabase()
    const rows = db
      .prepare('SELECT tool_name FROM agent_tools WHERE profile = ? ORDER BY tool_name')
      .all(profile) as Array<{ tool_name: string }>
    return rows.map((r) => r.tool_name)
  }

  /** 授权（安装到 profile）——幂等 */
  authorize(profile: string, toolName: string): void {
    const db = getDatabase()
    db.prepare('INSERT OR IGNORE INTO agent_tools (profile, tool_name) VALUES (?, ?)').run(profile, toolName)
  }

  /** 回收（卸载）——物理删除记录；不在 = 不可用 */
  revoke(profile: string, toolName: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM agent_tools WHERE profile = ? AND tool_name = ?').run(profile, toolName)
  }
}
