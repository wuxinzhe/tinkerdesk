import {DatabaseSync} from 'node:sqlite';
import {app} from 'electron';
import {join} from 'path';

// 单例数据库连接（主进程生命周期内保持）
let db: DatabaseSync | null = null;

/** 获取数据库文件路径（用户数据目录，随 app 打包/安装自动定位） */
function dbPath(): string {
  return join(app.getPath('userData'), 'tinkerdesk.db');
}

/**
 * 初始化数据库：打开连接 + 建表 + 种子数据（幂等）
 * 参考 showing-agent schema：custom_models 去掉 user_id，providers 沿用 system_providers
 */
export function initDatabase(): DatabaseSync {
  if (db) {
    return db;
  }
  db = new DatabaseSync(dbPath());
  db.exec('PRAGMA journal_mode = WAL;');
  createTables(db);
  seedProviders(db);
  return db;
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

    CREATE TABLE IF NOT EXISTS providers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      base_url    TEXT NOT NULL DEFAULT '',
      api_mode    TEXT NOT NULL DEFAULT 'openai',
      description TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_providers_sort ON providers(sort_order);

    -- ── sessions（复刻 showing-agent sessions 表，去掉 user_id 维度本地单用户） ──
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
      started_at         TEXT NOT NULL DEFAULT (datetime('now')),
      archived           INTEGER NOT NULL DEFAULT 0,
      yolo               INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(profile, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);

    -- ── conversations（复刻 showing-agent conversations 表） ──
    CREATE TABLE IF NOT EXISTS conversations (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      status            TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      message_count     INTEGER NOT NULL DEFAULT 0,
      estimated_tokens  INTEGER NOT NULL DEFAULT 0,
      total_tokens      INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      started_at        TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, started_at DESC);

    -- ── messages（复刻 showing-agent messages 表） ──
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
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    -- ── agents（复刻 showing-agent agents 表） ──
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

    -- ── agent_configs（复刻 showing-agent agent_configs 表） ──
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

    -- ── skill_categories（复刻 showing-agent，去 user_id 无关） ──
    CREATE TABLE IF NOT EXISTS skill_categories (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      icon         TEXT NOT NULL DEFAULT '',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_skill_categories_active ON skill_categories(is_active, sort_order, name);

    -- ── private_skills（复刻 showing-agent，去 user_id，UNIQUE(profile, name)） ──
    CREATE TABLE IF NOT EXISTS private_skills (
      id                    TEXT PRIMARY KEY,
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
      skill_id   TEXT NOT NULL REFERENCES private_skills(id) ON DELETE CASCADE,
      file_type  TEXT NOT NULL,
      content    TEXT NOT NULL,
      language   TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, file_type, sort_order)
    );
    CREATE INDEX IF NOT EXISTS idx_private_skill_files_skill ON private_skill_files(skill_id);

    -- ── private_skill_related ──
    CREATE TABLE IF NOT EXISTS private_skill_related (
      id               TEXT PRIMARY KEY,
      skill_id         TEXT NOT NULL REFERENCES private_skills(id) ON DELETE CASCADE,
      related_skill_id TEXT NOT NULL,
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

    -- ── scenes（复刻 showing-agent） ──
    CREATE TABLE IF NOT EXISTS scenes (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── user_scene_models（去 user_id，PK(profile, scene_id, priority)） ──
    CREATE TABLE IF NOT EXISTS user_scene_models (
      profile   TEXT NOT NULL DEFAULT 'default',
      scene_id  TEXT NOT NULL REFERENCES scenes(id),
      model_id  TEXT NOT NULL REFERENCES custom_models(id) ON DELETE CASCADE,
      priority  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (profile, scene_id, priority)
    );
  `);
}

/**
 * 预置供应商种子数据（复制自 showing-agent system_providers 种子数据）
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
    ['google', 'Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'openai', 'Google Gemini 系列模型', 30],
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
    ['sambanova', 'SambaNova', 'https://api.sambanova.ai/v1', 'openai', 'SambaNova 高性能推理', 41],
    ['ollama', 'Ollama', 'http://localhost:11434/v1', 'openai', 'Ollama 本地模型', 50],
  ];

  const insert = database.prepare(
    `INSERT OR IGNORE INTO providers (id, name, base_url, api_mode, description, sort_order)
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
