/**
 * tool-center-repository.ts — 工具注册中心仓库
 *
 * 原 tool-center/db.ts 的 SQLite 持久化层，统一并入主库（node:sqlite）。
 * 表 tool_registry（内置工具检测快照）+ mcp_servers（MCP 服务器配置）。
 * 行类型（ToolRegistryRow/McpServerRow）定义集中在 ./types.ts。
 */
import { getDatabase } from './database'
import { nowIso } from '../utils/time'
import type { ToolRegistryRow, McpServerRow, McpToolRow } from './types'

/** 工具注册中心仓库 */
export class ToolCenterRepository {
  // ── Tool Registry ──

  /** 全量覆盖内置工具检测快照 */
  saveToolRegistry(tools: Array<{id: string; source: string; available: boolean; reason?: string | null; schema: unknown}>): void {
    const db = getDatabase()
    db.prepare('DELETE FROM tool_registry').run()
    const stmt = db.prepare(
      'INSERT INTO tool_registry (id, source, available, reason, schema_json, checked_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const now = nowIso()
    for (const t of tools) {
      stmt.run(t.id, t.source, t.available ? 1 : 0, t.reason ?? null, JSON.stringify(t.schema), now)
    }
  }

  /** 读取内置工具检测快照 */
  loadToolRegistry(): ToolRegistryRow[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT id, source, available, reason, schema_json, checked_at FROM tool_registry ORDER BY id').all() as Array<{
      id: string; source: string; available: number; reason: string | null; schema_json: string; checked_at: string
    }>
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      available: r.available,
      reason: r.reason,
      schemaJson: r.schema_json,
      checkedAt: r.checked_at,
    }))
  }

  // ── MCP Servers ──

  /** 全量覆盖 MCP 服务器配置 */
  saveMcpServers(servers: Array<{name: string; transport: string; command?: string | null; args?: string[]; url?: string | null; enabled: boolean}>): void {
    const db = getDatabase()
    db.prepare('DELETE FROM mcp_servers').run()
    const stmt = db.prepare(
      'INSERT INTO mcp_servers (name, transport, command, args_json, url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const now = nowIso()
    for (const s of servers) {
      stmt.run(s.name, s.transport, s.command ?? null, JSON.stringify(s.args ?? []), s.url ?? null, s.enabled ? 1 : 0, now, now)
    }
  }

  /** 读取 MCP 服务器配置 */
  loadMcpServers(): McpServerRow[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT name, transport, command, args_json, url, enabled, created_at, updated_at FROM mcp_servers ORDER BY name').all() as Array<{
      name: string; transport: string; command: string | null; args_json: string; url: string | null; enabled: number; created_at: string; updated_at: string
    }>
    return rows.map((r) => ({
      name: r.name,
      transport: r.transport,
      command: r.command,
      argsJson: r.args_json,
      url: r.url,
      enabled: r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  /** 添加/更新单个 MCP 服务器（保留 created_at） */
  addMcpServer(server: {name: string; transport: string; command?: string | null; args?: string[]; url?: string | null; enabled: boolean}): void {
    const db = getDatabase()
    const now = nowIso()
    db.prepare(
      `INSERT OR REPLACE INTO mcp_servers (name, transport, command, args_json, url, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM mcp_servers WHERE name = ?), ?), ?)`
    ).run(server.name, server.transport, server.command ?? null, JSON.stringify(server.args ?? []), server.url ?? null, server.enabled ? 1 : 0, server.name, now, now)
  }

  /** 删除 MCP 服务器 */
  deleteMcpServer(name: string): void {
    const db = getDatabase()
    db.prepare('DELETE FROM mcp_servers WHERE name = ?').run(name)
  }

  // ── MCP Tools（已注册 MCP 工具定义，重启从库加载） ──

  /** 全量覆盖 MCP 工具定义（服务器重新 discover 后调用） */
  saveMcpTools(tools: Array<{name: string; serverName: string; toolName: string; description: string; inputSchema: Record<string, unknown>}>): void {
    const db = getDatabase()
    db.prepare('DELETE FROM mcp_tools').run()
    const stmt = db.prepare(
      'INSERT INTO mcp_tools (name, server_name, tool_name, description, input_schema, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const now = nowIso()
    for (const t of tools) {
      stmt.run(t.name, t.serverName, t.toolName, t.description, JSON.stringify(t.inputSchema), 1, now, now)
    }
  }

  /** 读取全部 MCP 工具定义 */
  loadMcpTools(): McpToolRow[] {
    const db = getDatabase()
    const rows = db.prepare('SELECT name, server_name, tool_name, description, input_schema, enabled, created_at, updated_at FROM mcp_tools ORDER BY name').all() as Array<{
      name: string; server_name: string; tool_name: string; description: string; input_schema: string; enabled: number; created_at: string; updated_at: string
    }>
    return rows.map((r) => ({
      name: r.name,
      serverName: r.server_name,
      toolName: r.tool_name,
      description: r.description,
      inputSchema: r.input_schema,
      enabled: r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }
}
