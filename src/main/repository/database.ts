import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolveResource } from '../utils/resources-path';

// 单例数据库连接（主进程生命周期内保持）
let db: DatabaseSync | null = null;

/** 获取数据库文件路径（用户数据目录，随 app 打包/安装自动定位） */
function dbPath(): string {
  return join(app.getPath('userData'), 'tinkerdesk.db');
}

/**
 * 初始化数据库：打开连接 + 建表 + 种子数据（幂等）
 * 参考 tinker-agent schema：custom_models 去掉 user_id，providers 沿用 system_providers
 */
export function initDatabase(): DatabaseSync {
  if (db) {
    return db;
  }
  db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  createTables(db);
  ensureSkillRelatedSchema(db);
  ensureSceneModelSchema(db);
  ensureSessionSchema(db);
  seedProviders(db);
  seedDefaultSkills(db);
  return db;
}

/** 结构对齐（开发阶段）：sessions 缺 reasoning_depth 列（推理深度 per-session）直接重建——不迁移数据 */
function ensureSessionSchema(database: DatabaseSync): void {
  const cols = new Set(database.prepare('PRAGMA table_info(sessions)').all().map((c) => String((c as { name: unknown }).name)))
  // 已有库（reasoning_depth 已存在）→ 补 notify_on_complete 列（ALTER 不重建——保护会话数据）
  if (cols.has('reasoning_depth') && !cols.has('notify_on_complete')) {
    database.exec(`ALTER TABLE sessions ADD COLUMN notify_on_complete INTEGER NOT NULL DEFAULT 0`)
    return
  }
  if (cols.has('reasoning_depth') && cols.has('notify_on_complete')) return
  database.exec('DROP TABLE sessions')
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                 TEXT PRIMARY KEY,
      profile            TEXT NOT NULL DEFAULT 'default',
      source             TEXT NOT NULL DEFAULT 'gateway',
      system_prompt      TEXT NOT NULL DEFAULT '',
      parent_session_id  TEXT REFERENCES sessions(id),
      title              TEXT NOT NULL DEFAULT '',
      input_tokens       INTEGER NOT NULL DEFAULT 0,
      output_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      message_count      INTEGER NOT NULL DEFAULT 0,
      tool_call_count    INTEGER NOT NULL DEFAULT 0,
      rewind_count       INTEGER NOT NULL DEFAULT 0,
      total_duration_ms   INTEGER NOT NULL DEFAULT 0,
      total_iterations    INTEGER NOT NULL DEFAULT 0,
      total_llm_requests  INTEGER NOT NULL DEFAULT 0,
      current_context_tokens INTEGER NOT NULL DEFAULT 0,
      started_at         TEXT NOT NULL DEFAULT (datetime('now')),
      archived           INTEGER NOT NULL DEFAULT 0,
      yolo               INTEGER NOT NULL DEFAULT 0,
      reasoning_depth    TEXT NOT NULL DEFAULT 'medium',
      notify_on_complete INTEGER NOT NULL DEFAULT 0
    )
  `)
}

/** 结构对齐（开发阶段）：user_scene_models 旧版（PK 含 priority——单模型替换语义）直接重建为多模型结构——不迁移数据 */
function ensureSceneModelSchema(database: DatabaseSync): void {
  const cols = new Set(database.prepare('PRAGMA table_info(user_scene_models)').all().map((c) => String((c as { name: unknown }).name) + ':' + String((c as { type: unknown }).type)))
  if (cols.has('is_main:INTEGER')) return
  database.exec('DROP TABLE user_scene_models')
  database.exec(`
    CREATE TABLE user_scene_models (
      profile   TEXT NOT NULL DEFAULT 'default',
      scene_id  TEXT NOT NULL,
      model_id  TEXT NOT NULL REFERENCES custom_models(id) ON DELETE CASCADE,
      priority  INTEGER NOT NULL DEFAULT 0,
      is_main   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (profile, scene_id, model_id)
    )
  `)
  database.exec('CREATE INDEX IF NOT EXISTS idx_user_scene_models_scene ON user_scene_models(profile, scene_id)')
}

/** 结构对齐（开发阶段）：private_skill_related 旧 UUID 版（id TEXT）直接重建为自增——不迁移数据 */
function ensureSkillRelatedSchema(database: DatabaseSync): void {
  const cols = new Set(database.prepare('PRAGMA table_info(private_skill_related)').all().map((c) => String((c as { name: unknown }).name) + ':' + String((c as { type: unknown }).type)))
  if (cols.has('id:TEXT')) {
    database.exec('DROP TABLE private_skill_related')
    database.exec(`
      CREATE TABLE private_skill_related (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id         INTEGER NOT NULL REFERENCES private_skills(id) ON DELETE CASCADE,
        related_skill_id INTEGER NOT NULL,
        relation_type    TEXT NOT NULL DEFAULT 'related',
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(skill_id, related_skill_id, relation_type)
      );
    `)
    database.exec('CREATE INDEX IF NOT EXISTS idx_private_skill_related_skill ON private_skill_related(skill_id)')
  }
}

/** 种子：默认技能（tinkerdesk-plugin-install / tinkerdesk-skill-authoring），name 冲突忽略（幂等） */
function seedDefaultSkills(database: DatabaseSync): void {
  const defaults: Array<{
    name: string
    displayName: string
    description: string
    category: string
    file: string
  }> = [
    {
      name: 'tinkerdesk-plugin-install',
      displayName: '插件安装引导',
      description: '安装/管理 TinkerDesk 插件时加载：plugin_install 装包 → 读 guide.md → 准备环境 → 配置 → 启用',
      category: 'plugin',
      file: 'tinkerdesk-plugin-install.md',
    },
    {
      name: 'tinkerdesk-skill-authoring',
      displayName: 'Skill 编写规范',
      description: '编写/更新 TinkerDesk skill 时加载：表字段映射、body 纯正文规范、创建方式、自检清单',
      category: 'agent',
      file: 'tinkerdesk-skill-authoring.md',
    },
  ]
  for (const d of defaults) {
    const exists = database
      .prepare(`SELECT id FROM private_skills WHERE profile = 'default' AND name = ?`)
      .get(d.name)
    if (exists) continue
    let body: string
    try {
      body = readFileSync(resolveResource('default-skills', d.file), 'utf-8')
    } catch (e) {
      console.warn(`[Seed] 默认技能文件缺失: ${d.file} — ${(e as Error).message}`)
      continue
    }
    const id = randomUUID()
    database
      .prepare(
        `INSERT INTO private_skills (id, name, display_name, description, category, version, author, license, platforms, tags, requires_tools, triggers, body, profile, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '1.0.0', 'TinkerDesk', 'MIT', 'desktop', ?, ?, ?, ?, 'default', datetime('now'), datetime('now'))`,
      )
      .run(
        id,
        d.name,
        d.displayName,
        d.description,
        d.category,
        d.name === 'tinkerdesk-plugin-install'
          ? 'plugin,install,agent'
          : 'skill,authoring,规范',
        d.name === 'tinkerdesk-plugin-install'
          ? 'desktop_tinker_plugin_install,desktop_tinker_plugin_configure,desktop_tinker_plugin_enable,desktop_tinker_plugin_list,desktop_tinker_plugin_uninstall,desktop_tinker_read_file,desktop_tinker_terminal'
          : 'desktop_tinker_skill_manage',
        d.name === 'tinkerdesk-plugin-install'
          ? '装插件,安装插件,卸载插件,配置插件,plugin install'
          : '写skill,编写skill,创建skill,skill规范',
        body,
      )
    database
      .prepare(
        `INSERT INTO private_skill_files (skill_id, file_type, content, language, sort_order) VALUES (?, 'SKILL.md', ?, '', 0)`,
      )
      .run(id, body)
    console.log(`[Seed] 默认技能已创建: ${d.name}`)
  }
}

/** 建表（幂等，IF NOT EXISTS） */
function createTables(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_models (
      id             TEXT PRIMARY KEY,
      profile        TEXT NOT NULL DEFAULT 'default',
      alias          TEXT NOT NULL,
      model_name     TEXT NOT NULL,
      provider_id    TEXT NOT NULL DEFAULT 'openai',
      api_key        TEXT NOT NULL DEFAULT '',
      base_url       TEXT NOT NULL DEFAULT '',
      context_limit  INTEGER NOT NULL DEFAULT 128000,
      model_type     TEXT NOT NULL DEFAULT 'chat',
      enabled        INTEGER NOT NULL DEFAULT 1,
      test_passed    INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_custom_models_profile ON custom_models(profile);

    CREATE TABLE IF NOT EXISTS system_providers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      base_url    TEXT NOT NULL DEFAULT '',
      api_mode    TEXT NOT NULL DEFAULT 'openai',
      description TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_system_providers_sort ON system_providers(sort_order);

    -- ── sessions（复刻 tinker-agent sessions 表，去掉 user_id 维度本地单用户） ──
    CREATE TABLE IF NOT EXISTS sessions (
      id                 TEXT PRIMARY KEY,
      profile            TEXT NOT NULL DEFAULT 'default',
      source             TEXT NOT NULL DEFAULT 'gateway',
      system_prompt      TEXT NOT NULL DEFAULT '',
      parent_session_id  TEXT REFERENCES sessions(id),
      title              TEXT NOT NULL DEFAULT '',
      input_tokens       INTEGER NOT NULL DEFAULT 0,
      output_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      message_count      INTEGER NOT NULL DEFAULT 0,
      tool_call_count    INTEGER NOT NULL DEFAULT 0,
      rewind_count       INTEGER NOT NULL DEFAULT 0,
      -- 会话累计统计（数据面板：总运行时间/总循环/总请求）
      total_duration_ms   INTEGER NOT NULL DEFAULT 0,
      total_iterations    INTEGER NOT NULL DEFAULT 0,
      total_llm_requests  INTEGER NOT NULL DEFAULT 0,
      -- 当前上下文总量（冗余——最新一轮的 round_context_tokens，dashboard 直接拉）
      current_context_tokens INTEGER NOT NULL DEFAULT 0,
      started_at         TEXT NOT NULL DEFAULT (datetime('now')),
      archived           INTEGER NOT NULL DEFAULT 0,
      yolo               INTEGER NOT NULL DEFAULT 0,
      reasoning_depth    TEXT NOT NULL DEFAULT 'medium'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

    -- ── conversations（复刻 tinker-agent conversations 表） ──
    CREATE TABLE IF NOT EXISTS conversations (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status            TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      message_count     INTEGER NOT NULL DEFAULT 0,
      estimated_tokens  INTEGER NOT NULL DEFAULT 0,
      total_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      -- 单轮统计（数据面板：运行时间/循环次数/请求次数）
      duration_ms       INTEGER NOT NULL DEFAULT 0,
      iteration_count   INTEGER NOT NULL DEFAULT 0,
      llm_request_count INTEGER NOT NULL DEFAULT 0,
      -- 本轮上下文总量（该轮最后一条 assistant 消息的 prompt_tokens——flush 时写入）
      round_context_tokens INTEGER NOT NULL DEFAULT 0,
      started_at        TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, started_at DESC);

    -- ── messages（复刻 tinker-agent messages 表） ──
    CREATE TABLE IF NOT EXISTS messages (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      conversation_id    TEXT REFERENCES conversations(id),
      profile            TEXT NOT NULL DEFAULT '',
      role               TEXT NOT NULL,
      content            TEXT NOT NULL DEFAULT '',
      reasoning_content  TEXT NOT NULL DEFAULT '',
      tool_call          TEXT,
      tool_call_id       TEXT NOT NULL DEFAULT '',
      tool_name          TEXT NOT NULL DEFAULT '',
      finish_reason      TEXT NOT NULL DEFAULT 'complete',
      interaction_status TEXT NOT NULL DEFAULT '',
      message_type       TEXT NOT NULL DEFAULT '',
      deleted            INTEGER NOT NULL DEFAULT 0,
      -- usage 统计（每轮每请求——命中率数据源；不向前端展示，仅记录）
      prompt_tokens      INTEGER NOT NULL DEFAULT 0,
      completion_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- 存量库迁移（messages 补 usage 列——JS 层检查列存在后执行，见下方 migrateMessagesUsage）
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    -- ── agents（复刻 tinker-agent agents 表） ──
    CREATE TABLE IF NOT EXISTS agents (
      profile            TEXT NOT NULL,
      display_name       TEXT NOT NULL DEFAULT '',
      description        TEXT DEFAULT '',
      avatar             TEXT DEFAULT '',
      is_default         INTEGER NOT NULL DEFAULT 0,
      is_active          INTEGER NOT NULL DEFAULT 1,
      agent_mode_id      TEXT NOT NULL DEFAULT 'default',
      agent_mode_version TEXT NOT NULL DEFAULT '1.0',
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at         TEXT,
      PRIMARY KEY (profile)
    );

    -- ── agent_configs（复刻 tinker-agent agent_configs 表） ──
    CREATE TABLE IF NOT EXISTS agent_configs (
      profile                    TEXT NOT NULL,
      max_iterations             INTEGER NOT NULL DEFAULT 90,
      tool_execution_timeout     INTEGER NOT NULL DEFAULT 120,
      max_conversations          INTEGER NOT NULL DEFAULT 5,
      memory_max_chars           INTEGER NOT NULL DEFAULT 2200,
      user_max_chars             INTEGER NOT NULL DEFAULT 1375,
      threshold_percent          REAL NOT NULL DEFAULT 0.0,
      tail_ratio                 REAL NOT NULL DEFAULT 0.0,
      agent_soul_prompt          TEXT DEFAULT NULL,
      warnings_enabled           INTEGER NOT NULL DEFAULT 1,
      hard_stop_enabled          INTEGER NOT NULL DEFAULT 0,
      exact_failure_warn_after   INTEGER NOT NULL DEFAULT 2,
      same_tool_failure_warn_after INTEGER NOT NULL DEFAULT 3,
      no_progress_warn_after     INTEGER NOT NULL DEFAULT 2,
      exact_failure_block_after  INTEGER NOT NULL DEFAULT 5,
      same_tool_failure_halt_after INTEGER NOT NULL DEFAULT 8,
      no_progress_block_after    INTEGER NOT NULL DEFAULT 5,
      created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                 TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (profile),
      FOREIGN KEY (profile) REFERENCES agents(profile) ON DELETE CASCADE
    );

    -- ── private_skills（复刻 tinker-agent，去 user_id，UNIQUE(profile, name)） ──
    CREATE TABLE IF NOT EXISTS private_skills (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL,
      display_name          TEXT NOT NULL,
      description           TEXT NOT NULL DEFAULT '',
      category              TEXT NOT NULL DEFAULT '',
      version               TEXT NOT NULL DEFAULT '',
      author                TEXT NOT NULL DEFAULT '',
      license               TEXT NOT NULL DEFAULT '',
      platforms             TEXT NOT NULL DEFAULT '',
      tags                  TEXT NOT NULL DEFAULT '',
      dependencies          TEXT NOT NULL DEFAULT '',
      requires_toolsets     TEXT NOT NULL DEFAULT '',
      requires_tools        TEXT NOT NULL DEFAULT '',
      fallback_for_toolsets TEXT NOT NULL DEFAULT '',
      fallback_for_tools    TEXT NOT NULL DEFAULT '',
      triggers              TEXT NOT NULL DEFAULT '',
      trigger_conditions    TEXT NOT NULL DEFAULT '',
      config                TEXT NOT NULL DEFAULT '[]',
      env_vars              TEXT NOT NULL DEFAULT '',
      commands              TEXT NOT NULL DEFAULT '',
      envs                  TEXT,
      api_key               TEXT,
      body                  TEXT NOT NULL DEFAULT '',
      is_deleted            INTEGER NOT NULL DEFAULT 0,
      deleted_at            TEXT,
      profile               TEXT NOT NULL DEFAULT 'default',
      official_skill_id     TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (profile, name)
    );
    CREATE INDEX IF NOT EXISTS idx_private_skills_profile ON private_skills(profile);

    -- ── private_skill_files ──
    CREATE TABLE IF NOT EXISTS private_skill_files (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id   INTEGER NOT NULL REFERENCES private_skills(id) ON DELETE CASCADE,
      file_type  TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL,
      language   TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, file_type, sort_order)
    );
    CREATE INDEX IF NOT EXISTS idx_private_skill_files_skill ON private_skill_files(skill_id);

    -- ── private_skill_related ──
    CREATE TABLE IF NOT EXISTS private_skill_related (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id         INTEGER NOT NULL REFERENCES private_skills(id) ON DELETE CASCADE,
      related_skill_id INTEGER NOT NULL,
      relation_type    TEXT NOT NULL DEFAULT 'related',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, related_skill_id, relation_type)
    );
    CREATE INDEX IF NOT EXISTS idx_private_skill_related_skill ON private_skill_related(skill_id);

    -- ── user_url_whitelist（去 user_id） ──
    CREATE TABLE IF NOT EXISTS user_url_whitelist (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      profile     TEXT NOT NULL,
      url_pattern TEXT NOT NULL,
      description TEXT DEFAULT '',
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_url_whitelist_profile ON user_url_whitelist(profile);

    -- ── user_path_whitelist（去 user_id） ──
    CREATE TABLE IF NOT EXISTS user_path_whitelist (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      profile      TEXT NOT NULL,
      path_pattern TEXT NOT NULL,
      description  TEXT DEFAULT '',
      enabled      INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_path_whitelist_profile ON user_path_whitelist(profile);

    -- ── user_disabled_tools（去 user_id，PK(profile, tool_name)） ──
    CREATE TABLE IF NOT EXISTS user_disabled_tools (
      profile   TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      PRIMARY KEY (profile, tool_name)
    );

    -- ── prompt_modules（去 user_id/User 前缀，UNIQUE(profile, name)） ──
    CREATE TABLE IF NOT EXISTS prompt_modules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      profile    TEXT NOT NULL DEFAULT 'default',
      name       TEXT NOT NULL,
      content    TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (profile, name)
    );
    CREATE INDEX IF NOT EXISTS idx_upm_profile ON prompt_modules(profile);

    -- ── user_scene_models（场景模型绑定——多模型：is_main 主模型 + priority 备用顺序） ──
    CREATE TABLE IF NOT EXISTS user_scene_models (
      profile   TEXT NOT NULL DEFAULT 'default',
      scene_id  TEXT NOT NULL,
      model_id  TEXT NOT NULL REFERENCES custom_models(id) ON DELETE CASCADE,
      priority  INTEGER NOT NULL DEFAULT 0,
      is_main   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (profile, scene_id, model_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_scene_models_scene ON user_scene_models(profile, scene_id);

    -- ── tool-center 持久化（原 tool-center/db.ts，统一并入主库） ──
    CREATE TABLE IF NOT EXISTS tool_registry (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL DEFAULT 'builtin',
      available   INTEGER NOT NULL DEFAULT 1,
      reason      TEXT,
      schema_json TEXT NOT NULL,
      checked_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_servers (
      name        TEXT PRIMARY KEY,
      transport   TEXT NOT NULL DEFAULT 'stdio',
      command     TEXT,
      args_json   TEXT,
      url         TEXT,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    -- MCP 工具定义（首次发现后持久化，重启从库加载避免反复 discover）
    CREATE TABLE IF NOT EXISTS mcp_tools (
      name            TEXT PRIMARY KEY,
      server_name     TEXT NOT NULL,
      tool_name       TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      input_schema    TEXT NOT NULL DEFAULT '{}',
      enabled         INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    -- ── 应用级设置（快捷键等全局键值配置） ──
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── 存量库迁移：messages 补 usage 列（列不存在才 ALTER——幂等） ──
  const msgCols = new Set(database.prepare('PRAGMA table_info(messages)').all().map((c) => String((c as { name: unknown }).name)))
  for (const [col, def] of [
    ['prompt_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['completion_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['cache_read_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['cache_write_tokens', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!msgCols.has(col)) {
      database.exec(`ALTER TABLE messages ADD COLUMN ${col} ${def}`)
    }
  }
  // conversations/sessions 补统计列（幂等）
  const convCols = new Set(database.prepare('PRAGMA table_info(conversations)').all().map((c) => String((c as { name: unknown }).name)))
  for (const [col, def] of [
    ['duration_ms', 'INTEGER NOT NULL DEFAULT 0'],
    ['iteration_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['llm_request_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['round_context_tokens', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!convCols.has(col)) {
      database.exec(`ALTER TABLE conversations ADD COLUMN ${col} ${def}`)
    }
  }
  const sessCols = new Set(database.prepare('PRAGMA table_info(sessions)').all().map((c) => String((c as { name: unknown }).name)))
  for (const [col, def] of [
    ['total_duration_ms', 'INTEGER NOT NULL DEFAULT 0'],
    ['total_iterations', 'INTEGER NOT NULL DEFAULT 0'],
    ['total_llm_requests', 'INTEGER NOT NULL DEFAULT 0'],
    ['current_context_tokens', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!sessCols.has(col)) {
      database.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${def}`)
    }
  }
}

/**
 * 预置供应商种子数据（复制自 tinker-agent system_providers 种子数据）
 * 首次启动导入，幂等（ON CONFLICT DO NOTHING）
 */
function seedProviders(database: DatabaseSync): void {
  const providers: Array<[string, string, string, string, string, number]> = [
    ['openai', 'OpenAI', 'https://api.openai.com/v1', 'openai', 'OpenAI GPT 系列模型', 1],
    ['deepseek', 'DeepSeek', 'https://api.deepseek.com', 'openai', 'DeepSeek 系列模型（兼容 OpenAI API）', 2],
    ['anthropic', 'Anthropic', 'https://api.anthropic.com', 'anthropic', 'Anthropic Claude 系列模型', 3],
    ['openai-compatible', 'OpenAI 兼容', '', 'openai', '兼容 OpenAI API 的自定义 Endpoint', 4],
    ['tongyi', '通义千问', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'openai', '阿里云通义千问系列模型（DashScope）', 10],
    ['zhipuai', '智谱 AI', 'https://open.bigmodel.cn/api/paas/v4', 'openai', '智谱 GLM 系列模型', 11],
    ['moonshot', '月之暗面', 'https://api.moonshot.cn/v1', 'openai', 'Moonshot / Kimi 系列模型', 12],
    ['baichuan', '百川智能', 'https://api.baichuan-ai.com/v1', 'openai', '百川大模型', 13],
    ['stepfun', '阶跃星辰', 'https://api.stepfun.com/v1', 'openai', '阶跃星辰 Step 系列模型', 14],
    ['lingyi', '零一万物', 'https://api.lingyiwanwu.com/v1', 'openai', '零一万物 Yi 系列模型', 15],
    ['minimax', 'MiniMax', 'https://api.minimax.io', 'openai', 'MiniMax 大模型', 16],
    ['siliconflow', '硅基流动', 'https://api.siliconflow.cn/v1', 'openai', 'SiliconFlow 硅基流动模型广场', 17],
    ['modelscope', '魔搭社区', 'https://api-inference.modelscope.cn/v1', 'openai', 'ModelScope 魔搭社区模型服务', 18],
    ['chatglm', 'ChatGLM', 'https://open.bigmodel.cn/api/paas/v4', 'openai', 'ChatGLM 系列模型', 19],
    ['longcat', 'LongCat', 'https://api.longcat.chat/openai', 'openai', 'LongCat 长文本模型', 20],
    ['volcengine', '火山方舟', 'https://ark.cn-beijing.volces.com/api/v3', 'openai', '火山引擎方舟大模型', 21],
    ['hunyuan', '腾讯混元', 'https://api.hunyuan.cloud.tencent.com/v1', 'openai', '腾讯混元大模型', 22],
    ['wenxin', '文心一言', 'https://qianfan.baidubyan.com/v2', 'openai', '百度文心一言大模型', 23],
    ['google', 'Google Gemini', 'https://generativelanguage.googleapis.com', 'google', 'Google Gemini 系列模型（官方 SDK）', 30],
    ['xai', 'xAI Grok', 'https://api.x.ai/v1', 'openai', 'xAI Grok 系列模型', 31],
    ['mistralai', 'Mistral AI', 'https://api.mistral.ai/v1', 'openai', 'Mistral AI 系列模型', 32],
    ['cohere', 'Cohere', 'https://api.cohere.com/v1', 'openai', 'Cohere 系列模型', 33],
    ['groq', 'Groq', 'https://api.groq.com/openai/v1', 'openai', 'Groq LPU 推理引擎', 34],
    ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'openai', 'OpenRouter 多模型聚合', 35],
    ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'openai', 'Fireworks AI 快速推理', 36],
    ['togetherai', 'Together AI', 'https://api.together.xyz/v1', 'openai', 'Together AI 模型平台', 37],
    ['replicate', 'Replicate', 'https://api.replicate.com/v1', 'openai', 'Replicate 模型托管平台', 38],
    ['novita', 'Novita AI', 'https://api.novita.ai/v3/openai', 'openai', 'Novita AI 模型 API', 39],
    ['perfxcloud', 'PerfXCloud', 'https://api.perfxcloud.ai/v1', 'openai', 'PerfXCloud 模型推理', 40],
    ['opencode', 'OpenCode Go', 'https://opencode.ai/zen/go/v1', 'openai', 'OpenCode Go 订阅聚合（OpenAI 兼容——/zen/go/v1）', 42],
    ['sambanova', 'SambaNova', 'https://api.sambanova.ai/v1', 'openai', 'SambaNova 高性能推理', 41],
    ['ollama', 'Ollama', 'http://localhost:11434/v1', 'openai', 'Ollama 本地模型', 50],
  ];

  const insert = database.prepare(
    `INSERT OR IGNORE INTO system_providers (id, name, base_url, api_mode, description, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const p of providers) {
    insert.run(...p);
  }
}

/** 获取数据库连接（未初始化时自动初始化） */
export function getDatabase(): DatabaseSync {
  return initDatabase();
}

/** 关闭数据库（应用退出时调用） */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 事务执行：fn 内所有 DB 操作原子提交——中途失败整体回滚。
 * 多步/批量写入（消息批量插入、压缩摘要替换、对话完成收尾等）必须走事务，
 * 否则中途失败会留下"部分写入"的不一致数据。
 *
 * 支持嵌套（SAVEPOINT）：内层 withTransaction 在已有事务内开启 savepoint——
 * 内层失败只回滚内层，外层失败整体回滚。node:sqlite 同步 API + 本地单用户，
 * 模块级深度计数安全。
 */
let txDepth = 0
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase()
  txDepth++
  const depth = txDepth
  database.exec(depth === 1 ? 'BEGIN' : `SAVEPOINT tx_${depth}`)
  try {
    const result = fn()
    database.exec(depth === 1 ? 'COMMIT' : `RELEASE tx_${depth}`)
    return result
  } catch (err) {
    database.exec(depth === 1 ? 'ROLLBACK' : `ROLLBACK TO tx_${depth}; RELEASE tx_${depth}`)
    throw err
  } finally {
    txDepth--
  }
}
