/**
 * user-disabled-tool-repository.ts — 用户禁用工具黑名单仓库
 *
 * 复刻 tinker-agent UserDisabledToolRepository（去 user_id）：
 * 表 user_disabled_tools — 纯黑名单，PK(profile, tool_name)。默认空表 = 全部可用。
 */
import { getDatabase } from './database'

/** 用户禁用工具仓库 */
export class UserDisabledToolRepository {
  /** 查询 profile 下禁用的工具名集合 */
  findByProfile(profile: string): string[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT tool_name FROM user_disabled_tools WHERE profile = ?').all(profile) as Array<{ tool_name: string }>
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

  /** 全量加载（应用启动时注入 ToolManager 缓存）：profile → 禁用工具名列表 */
  listAll(): Record<string, string[]> {
    const db = getDatabase()
    const rows = db.prepare('SELECT profile, tool_name FROM user_disabled_tools').all() as Array<{ profile: string; tool_name: string }>
    const map: Record<string, string[]> = {}
    for (const r of rows) {
      ;(map[r.profile] ??= []).push(r.tool_name)
    }
    return map
  }

  /** 整体替换某 profile 的禁用列表（DELETE 全部 + INSERT 新集合，事务） */
  replaceProfile(profile: string, toolNames: string[]): void {
    const db = getDatabase()
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM user_disabled_tools WHERE profile = ?').run(profile)
      const stmt = db.prepare('INSERT INTO user_disabled_tools (profile, tool_name) VALUES (?, ?) ON CONFLICT DO NOTHING')
      for (const name of toolNames) stmt.run(profile, name)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}
