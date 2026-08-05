/**
 * user-disabled-tool-repository.ts — 用户禁用工具黑名单仓库
 *
 * 复刻 showing-agent UserDisabledToolRepository（去 user_id）：
 * 表 user_disabled_tools — 纯黑名单，PK(profile, tool_name)。默认空表 = 全部可用。
 */
import {getDatabase} from './database'

/** 用户禁用工具仓库 */
export class UserDisabledToolRepository {
  /** 查询 profile 下禁用的工具名集合 */
  findByProfile(profile: string): string[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT tool_name FROM user_disabled_tools WHERE profile = ?').all(profile) as Array<{tool_name: string}>
    return rows.map((r) => r.tool_name)
  }

  /** 插入禁用记录（冲突忽略） */
  insert(profile: string, toolName: string): number {
    const db = getDatabase()
    const result = db
      .prepare('INSERT INTO user_disabled_tools (profile, tool_name) VALUES (?, ?) ON CONFLICT DO NOTHING')
      .run(profile, toolName)
    return Number(result.changes)
  }

  /** 删除禁用记录 */
  delete(profile: string, toolName: string): number {
    const db = getDatabase()
    const result = db
      .prepare('DELETE FROM user_disabled_tools WHERE profile = ? AND tool_name = ?')
      .run(profile, toolName)
    return Number(result.changes)
  }
}
