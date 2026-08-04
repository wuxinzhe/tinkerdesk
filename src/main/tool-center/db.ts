/**
 * tool-center/db.ts — SQLite 持久化层
 *
 * 封装 sql.js，提供工具注册中心的数据库操作。
 * 含初始化迁移（自动建表）。
 *
 * DB 文件位于 userData/tool-center.db
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { CheckedTool, McpServerConfig } from '@/defines/tools/center-types'

const DB_FILENAME = 'tool-center.db'

let _db: SqlJsDatabase | null = null

/** 获取 DB 文件路径 */
function dbPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, DB_FILENAME)
}

/** 初始化数据库：加载或创建 + 执行迁移 */
export async function initDatabase(): Promise<SqlJsDatabase> {
  if (_db) return _db

  const SQL = await initSqlJs()
  const path = dbPath()

  if (existsSync(path)) {
    const buffer = readFileSync(path)
    _db = new SQL.Database(buffer)
  } else {
    _db = new SQL.Database()
  }

  migrate(_db)
  return _db
}

/** 保存数据库到磁盘（每次写操作后调用） */
function save(): void {
  if (!_db) return
  const data = _db.export()
  const path = dbPath()
  writeFileSync(path, Buffer.from(data))
}

/** 建表迁移 */
function migrate(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tool_registry (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL DEFAULT 'builtin',
      available   INTEGER NOT NULL DEFAULT 1,
      reason      TEXT,
      schema_json TEXT NOT NULL,
      checked_at  TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      name        TEXT PRIMARY KEY,
      transport   TEXT NOT NULL DEFAULT 'stdio',
      command     TEXT,
      args_json   TEXT,
      url         TEXT,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `)
  save()
}

// ── Tool Registry CRUD ──

export function saveToolRegistry(tools: CheckedTool[]): void {
  const db = _db
  if (!db) return

  db.run('DELETE FROM tool_registry')
  const stmt = db.prepare(
    'INSERT INTO tool_registry (id, source, available, reason, schema_json, checked_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const now = new Date().toISOString()
  for (const t of tools) {
    stmt.run([t.id, t.source, t.available ? 1 : 0, t.reason ?? null, JSON.stringify(t.schema), now])
  }
  stmt.free()
  save()
}

export function loadToolRegistry(): CheckedTool[] {
  const db = _db
  if (!db) return []

  const rows = db.exec('SELECT id, source, available, reason, schema_json, checked_at FROM tool_registry ORDER BY id')
  if (!rows.length) return []

  const columns = rows[0].columns
  return rows[0].values.map(row => {
    const obj: Record<string, any> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return {
      id: obj.id,
      name: obj.id,
      description: '',
      category: '',
      source: obj.source as 'builtin',
      available: obj.available === 1,
      reason: obj.reason || undefined,
      schema: JSON.parse(obj.schema_json as string)
    }
  })
}

// ── MCP Servers CRUD ──

export function saveMcpServers(servers: McpServerConfig[]): void {
  const db = _db
  if (!db) return

  db.run('DELETE FROM mcp_servers')
  const stmt = db.prepare(
    'INSERT INTO mcp_servers (name, transport, command, args_json, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const now = new Date().toISOString()
  for (const s of servers) {
    stmt.run([s.name, s.transport, s.command ?? null, JSON.stringify(s.args ?? []), s.url ?? null, s.enabled ? 1 : 0, now, now])
  }
  stmt.free()
  save()
}

export function loadMcpServers(): McpServerConfig[] {
  const db = _db
  if (!db) return []

  const rows = db.exec('SELECT name, transport, command, args_json, url, enabled FROM mcp_servers ORDER BY name')
  if (!rows.length) return []

  const columns = rows[0].columns
  return rows[0].values.map(row => {
    const obj: Record<string, any> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return {
      name: obj.name,
      transport: obj.transport as 'stdio' | 'http',
      command: obj.command || undefined,
      args: JSON.parse(obj.args_json as string || '[]'),
      url: obj.url || undefined,
      enabled: obj.enabled === 1
    }
  })
}

export function addMcpServer(server: McpServerConfig): void {
  const db = _db
  if (!db) return

  const now = new Date().toISOString()
  db.run(
    'INSERT OR REPLACE INTO mcp_servers (name, transport, command, args_json, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM mcp_servers WHERE name=?), ?), ?)',
    [server.name, server.transport, server.command ?? null, JSON.stringify(server.args ?? []), server.url ?? null, server.enabled ? 1 : 0, server.name, now, now]
  )
  save()
}

export function deleteMcpServer(name: string): void {
  const db = _db
  if (!db) return
  db.run('DELETE FROM mcp_servers WHERE name = ?', [name])
  save()
}

/** 关闭数据库 */
export function closeDatabase(): void {
  if (_db) {
    save()
    _db.close()
    _db = null
  }
}
