#!/usr/bin/env node
/**
 * reset-init-state.mjs — 重置账户初始化状态（测试初始化向导专用）
 *
 * 删除 4 步初始化相关数据，让应用回到"未初始化"状态：
 *   Step1: agents 表默认 Agent（is_default=1）
 *   Step2: agent_configs 配置行
 *   Step3: custom_models 模型（含 API Key 的模型）
 *   Step4: user_scene_models 场景绑定
 *
 * 用法：
 *   node scripts/reset-init-state.mjs                 # 默认库 %APPDATA%/tinkerdesk/tinkerdesk.db
 *   node scripts/reset-init-state.mjs <db 路径>        # 指定库文件
 *   node scripts/reset-init-state.mjs --keep-models    # 保留模型（只重置 Agent/配置/绑定）
 *
 * 说明：
 * - 删除前自动备份（同名 .bak），可随时恢复
 * - ⚠️ 先关闭应用再执行（SQLite WAL 模式下应用运行中改库文件不可靠）
 * - 恢复备份后如读到旧数据，删除残留的 tinkerdesk.db-wal / -shm 文件
 */
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// ── 参数解析 ──
const args = process.argv.slice(2)
const keepModels = args.includes('--keep-models')
const dbArg = args.find((a) => !a.startsWith('--'))

const defaultDb = join(homedir(), 'AppData', 'Roaming', 'tinkerdesk', 'tinkerdesk.db')
const dbPath = dbArg ?? defaultDb

if (!existsSync(dbPath)) {
  console.error(`❌ 数据库不存在: ${dbPath}`)
  process.exit(1)
}

// ── 备份 ──
const backupPath = `${dbPath}.bak`
copyFileSync(dbPath, backupPath)
console.log(`📦 已备份到: ${backupPath}`)

// ── 执行重置 ──
const db = new DatabaseSync(dbPath)
const deleted = { agents: 0, agent_configs: 0, custom_models: 0, user_scene_models: 0 }

try {
  // Step2: AgentConfig 配置行（先删——agents 有 ON DELETE CASCADE 会级联，显式删便于计数）
  const cfgCount = db.prepare('SELECT COUNT(*) AS c FROM agent_configs').get().c
  if (cfgCount > 0) {
    const r = db.prepare('DELETE FROM agent_configs').run()
    deleted.agent_configs = r.changes
    console.log(`🗑️  删除 agent_configs 配置行: ${r.changes} 行`)
  } else {
    console.log('ℹ️  agent_configs 无数据，跳过')
  }

  // Step1: 默认 Agent（is_default=1，含软删的——初始化检查 findDefaultAgent 看 isDefault && !deletedAt）
  const agents = db.prepare(
    "SELECT profile, display_name, is_default, deleted_at FROM agents WHERE is_default = 1"
  ).all() // 显示重置对象
  if (agents.length === 0) {
    console.log('ℹ️  无默认 Agent（is_default=1），跳过 agents 删除')
  } else {
    for (const a of agents) {
      const r = db.prepare('DELETE FROM agents WHERE profile = ? AND is_default = 1').run(a.profile)
      deleted.agents += r.changes
      console.log(`🗑️  删除默认 Agent: profile=${a.profile} displayName=${a.display_name ?? ''} (is_default=1)`)
    }
  }

  if (!keepModels) {
    // Step3: 自定义模型（含 API Key 的模型）
    const modelCount = db.prepare('SELECT COUNT(*) AS c FROM custom_models').get().c
    if (modelCount > 0) {
      const r = db.prepare('DELETE FROM custom_models').run()
      deleted.custom_models = r.changes
      console.log(`🗑️  删除 custom_models 模型: ${r.changes} 行`)
    } else {
      console.log('ℹ️  custom_models 无数据，跳过')
    }

    // Step4: 场景模型绑定
    const sceneCount = db.prepare('SELECT COUNT(*) AS c FROM user_scene_models').get().c
    if (sceneCount > 0) {
      const r = db.prepare('DELETE FROM user_scene_models').run()
      deleted.user_scene_models = r.changes
      console.log(`🗑️  删除 user_scene_models 场景绑定: ${r.changes} 行`)
    } else {
      console.log('ℹ️  user_scene_models 无数据，跳过')
    }
  } else {
    console.log('🔒 --keep-models：保留 custom_models 与 user_scene_models')
  }

  console.log('')
  console.log('✅ 重置完成:')
  console.log(`   agents           : ${deleted.agents} 行删除`)
  console.log(`   agent_configs    : ${deleted.agent_configs} 行删除`)
  console.log(`   custom_models    : ${deleted.custom_models} 行删除`)
  console.log(`   user_scene_models: ${deleted.user_scene_models} 行删除`)
  console.log('')
  console.log('💡 重启应用后 Splash 会检测到未初始化 → 跳转初始化向导')
  console.log(`💡 恢复备份: copy "${backupPath}" "${dbPath}"`)
} catch (e) {
  console.error('❌ 重置失败:', e?.message ?? String(e))
  process.exit(1)
} finally {
  db.close()
}
