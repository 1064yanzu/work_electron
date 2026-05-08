/**
 * 数据库初始化 SQL
 * 包含所有业务表结构
 */
export const initSql = `
-- =====================
-- 核心业务表
-- =====================

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#64748b',
  icon TEXT DEFAULT 'folder',
  is_archived INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- 项目访问记录
CREATE TABLE IF NOT EXISTS project_visits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  visited_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_visits_project ON project_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_project_visits_time ON project_visits(visited_at DESC);

-- 文件夹表（多级树）
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  parent_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- 资料表（扩展版）
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT DEFAULT 'global',
  tags TEXT DEFAULT '[]',
  url TEXT,
  project_id TEXT,
  folder_id TEXT,
  source_type TEXT DEFAULT 'manual',
  origin_type TEXT DEFAULT 'manual',
  category TEXT DEFAULT 'article',
  storage_path TEXT,
  is_deleted INTEGER DEFAULT 0,
  description TEXT,
  thumbnail TEXT,
  author TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
CREATE INDEX IF NOT EXISTS idx_sources_folder ON sources(folder_id);
CREATE INDEX IF NOT EXISTS idx_sources_kind ON sources(kind);
-- NOTE: idx_sources_scope / idx_sources_deleted 在 migrate.ts 中安全创建
-- 原因：旧版本 sources 表可能不存在这些列，需先安全补列再建索引
CREATE INDEX IF NOT EXISTS idx_sources_updated ON sources(updated_at DESC);

-- 笔记表（扩展版）
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  content TEXT NOT NULL,
  content_html TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_source ON notes(source_id);

-- 笔记分块表
CREATE TABLE IF NOT EXISTS note_chunks (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  source_id TEXT,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_note_chunks_note_id ON note_chunks(note_id);
CREATE INDEX IF NOT EXISTS idx_note_chunks_source_id ON note_chunks(source_id);

-- 分块向量索引表
CREATE TABLE IF NOT EXISTS note_chunk_embeddings (
  chunk_id TEXT NOT NULL,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  embedding_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (chunk_id, model),
  FOREIGN KEY (chunk_id) REFERENCES note_chunks(id) ON DELETE CASCADE
);

-- =====================
-- FTS5 全文索引
-- =====================
CREATE VIRTUAL TABLE IF NOT EXISTS note_chunks_fts
USING fts5(
  chunk_id UNINDEXED,
  content,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS note_chunks_ai
AFTER INSERT ON note_chunks BEGIN
  INSERT INTO note_chunks_fts(chunk_id, content)
  VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS note_chunks_ad
AFTER DELETE ON note_chunks BEGIN
  DELETE FROM note_chunks_fts WHERE chunk_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS note_chunks_au
AFTER UPDATE ON note_chunks BEGIN
  DELETE FROM note_chunks_fts WHERE chunk_id = old.id;
  INSERT INTO note_chunks_fts(chunk_id, content)
  VALUES (new.id, new.content);
END;

-- =====================
-- Provider / 模型服务商
-- =====================
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  api_key TEXT,
  api_base TEXT,
  models TEXT DEFAULT '[]',
  metadata TEXT DEFAULT '{}',
  template_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_providers_template ON providers(template_id);

-- =====================
-- 配置表
-- =====================
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- =====================
-- 产出文档表
-- =====================
CREATE TABLE IF NOT EXISTS output_assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  output_type TEXT NOT NULL,
  scope TEXT DEFAULT 'project',
  tags TEXT DEFAULT '[]',
  storage_path TEXT,
  is_deleted INTEGER DEFAULT 0,
  related_notes TEXT DEFAULT '[]',
  project_id TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_output_assets_project ON output_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_output_assets_type ON output_assets(output_type);
-- NOTE: idx_output_assets_scope / idx_output_assets_deleted 在 migrate.ts 中安全创建
-- 原因：旧版本 output_assets 表可能不存在这些列，需先安全补列再建索引

-- =====================
-- 工作流节点
-- =====================
CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  input_sources TEXT DEFAULT '[]',
  output_notes TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_run_logs (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (node_id) REFERENCES workflow_nodes(id) ON DELETE CASCADE
);

-- =====================
-- 同步配置
-- =====================
CREATE TABLE IF NOT EXISTS sync_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data_path TEXT,
  -- 设备信息
  device_id TEXT,
  device_name TEXT,
  webdav_enabled INTEGER DEFAULT 0,
  webdav_url TEXT,
  webdav_username TEXT,
  webdav_password TEXT,
  webdav_path TEXT DEFAULT '/workbench-sync',
  -- WebDAV 高级配置
  webdav_auto_sync INTEGER DEFAULT 0,
  webdav_sync_interval INTEGER DEFAULT 0,
  webdav_max_backups INTEGER DEFAULT 0,
  webdav_skip_backup_file INTEGER DEFAULT 0,
  webdav_disable_stream INTEGER DEFAULT 0,
  webdav_last_sync_at INTEGER,
  webdav_last_sync_error TEXT,
  -- 通用备份配置
  auto_backup_enabled INTEGER DEFAULT 0,
  auto_backup_interval INTEGER DEFAULT 30,
  max_backup_count INTEGER DEFAULT 10,
  sync_on_startup INTEGER DEFAULT 1,
  sync_on_change INTEGER DEFAULT 1,
  compact_backup INTEGER DEFAULT 0,
  last_backup_at INTEGER,
  last_sync_at INTEGER,
  last_sync_status TEXT,
  last_sync_error TEXT,
  -- 本地备份目录配置
  local_backup_dir TEXT,
  local_backup_auto_sync INTEGER DEFAULT 0,
  local_backup_interval INTEGER DEFAULT 60,
  local_backup_max_count INTEGER DEFAULT 10,
  local_backup_last_sync_at INTEGER
);

CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  backup_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  data_version TEXT,
  device_id TEXT,
  device_name TEXT,
  is_encrypted INTEGER DEFAULT 0,
  is_compact INTEGER DEFAULT 0,
  is_incremental INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL
);
-- NOTE: idx_backup_history_device 索引在 migrate.ts 中安全创建，因为旧表可能没有 device_id 列
CREATE INDEX IF NOT EXISTS idx_backup_history_created ON backup_history(created_at DESC);

-- =====================
-- 卡片分享
-- =====================
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  image_path TEXT NOT NULL,
  source_url TEXT,
  theme_id TEXT,
  font_id TEXT,
  aspect_ratio TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- =====================
-- 主题与文件映射
-- =====================
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_themes (
  source_id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, theme_id),
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_file_themes_source ON file_themes(source_id);
CREATE INDEX IF NOT EXISTS idx_file_themes_theme ON file_themes(theme_id);

-- =====================
-- Agent Runtime 表
-- =====================
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT DEFAULT 'active',
  config_json TEXT,
  -- SDK session management
  sdk_session_id TEXT,
  model TEXT DEFAULT 'claude-sonnet-4-5',
  -- Token usage tracking
  total_prompt_tokens INTEGER DEFAULT 0,
  total_completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  -- Context compression
  last_compact_at INTEGER,
  pre_compact_tokens INTEGER,
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  error TEXT,
  budget_json TEXT,
  result_summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_session ON agent_tasks(session_id);

CREATE TABLE IF NOT EXISTS agent_nodes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'queued',
  depends_on_json TEXT,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_nodes_task ON agent_nodes(task_id);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_source TEXT DEFAULT 'builtin',
  mcp_server_id TEXT,
  args_json TEXT,
  status TEXT DEFAULT 'queued',
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES agent_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_task ON agent_tool_calls(task_id);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  agent_session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id);

CREATE TABLE IF NOT EXISTS agent_audit_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  relevance_score REAL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  access_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_memories_key ON agent_memories(key);
CREATE INDEX IF NOT EXISTS idx_agent_memories_category ON agent_memories(category);

-- =====================
-- MCP Server 配置
-- =====================
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT DEFAULT '[]',
  env TEXT DEFAULT '{}',
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- =====================
-- Agent 产物表
-- =====================
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  tool_call_id TEXT,
  description TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires ON artifacts(expires_at);

-- =====================
-- Agent 任务检查点表（断点续传）
-- =====================
CREATE TABLE IF NOT EXISTS agent_checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  sdk_session_id TEXT,
  sandbox_dir TEXT,
  last_tool_call_id TEXT,
  tool_calls_completed TEXT DEFAULT '[]',  -- JSON array of completed tool call IDs
  accumulated_result TEXT DEFAULT '',       -- Accumulated text output
  metadata TEXT DEFAULT '{}',               -- Task metadata (query, system prompt, etc.)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_task ON agent_checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session ON agent_checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_updated ON agent_checkpoints(updated_at DESC);

-- =====================
-- 阅读器 Reader（书架 / 进度 / 高亮 / 书签 / 会话）
-- =====================
CREATE TABLE IF NOT EXISTS reader_books (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  title TEXT NOT NULL,
  authors TEXT DEFAULT '[]',
  language TEXT,
  format TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  source_path TEXT,
  cover_path TEXT,
  page_count INTEGER,
  word_count INTEGER,
  toc_json TEXT DEFAULT '[]',
  metadata_json TEXT DEFAULT '{}',
  added_at INTEGER NOT NULL,
  last_opened_at INTEGER,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reader_books_format ON reader_books(format);
CREATE INDEX IF NOT EXISTS idx_reader_books_last_opened ON reader_books(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_books_source ON reader_books(source_id);
-- 注意：source_path 唯一索引在 migrate.ts 的 safeAddColumn 之后创建，
-- 避免旧库升级时该列还没有就先建索引导致 "no such column: source_path"。

CREATE TABLE IF NOT EXISTS reader_progress (
  book_id TEXT PRIMARY KEY,
  locator TEXT NOT NULL,
  percent REAL DEFAULT 0,
  chapter_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reader_highlights (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  locator_start TEXT NOT NULL,
  locator_end TEXT NOT NULL,
  text TEXT NOT NULL,
  color TEXT DEFAULT 'yellow',
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_highlights_book ON reader_highlights(book_id);
CREATE INDEX IF NOT EXISTS idx_reader_highlights_created ON reader_highlights(created_at DESC);

CREATE TABLE IF NOT EXISTS reader_bookmarks (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  locator TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_bookmarks_book ON reader_bookmarks(book_id);

CREATE TABLE IF NOT EXISTS reader_sessions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER DEFAULT 0,
  pages_read INTEGER DEFAULT 0,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reader_sessions_book ON reader_sessions(book_id);
CREATE INDEX IF NOT EXISTS idx_reader_sessions_started ON reader_sessions(started_at DESC);

-- =====================
-- TTS 设置（全局单行）
-- 多 provider 配置 + 全局默认 + 各场景启用与音色覆盖
-- =====================
CREATE TABLE IF NOT EXISTS tts_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_provider_id TEXT,
  default_voice_id TEXT,
  rate REAL NOT NULL DEFAULT 1.0,
  volume REAL NOT NULL DEFAULT 1.0,
  pitch REAL NOT NULL DEFAULT 1.0,
  scene_reader_enabled INTEGER NOT NULL DEFAULT 1,
  scene_reader_voice_id TEXT,
  scene_chat_enabled INTEGER NOT NULL DEFAULT 0,
  scene_chat_auto INTEGER NOT NULL DEFAULT 0,
  scene_chat_voice_id TEXT,
  scene_pet_enabled INTEGER NOT NULL DEFAULT 0,
  scene_pet_filter TEXT NOT NULL DEFAULT '["reminder","approval"]',
  scene_pet_verbosity TEXT NOT NULL DEFAULT 'title',
  scene_pet_voice_id TEXT,
  scene_pet_persona_enabled INTEGER NOT NULL DEFAULT 0,
  scene_pet_persona_prompt TEXT,
  scene_pet_persona_provider_id TEXT,
  scene_pet_persona_model TEXT,
  providers TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER
);

-- =====================
-- 初始化默认配置
-- =====================
INSERT OR IGNORE INTO sync_config (id) VALUES ('default');
INSERT OR IGNORE INTO tts_settings (id) VALUES (1);
`;
