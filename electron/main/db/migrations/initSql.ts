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
  color TEXT DEFAULT '#6366f1',
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
  tags TEXT DEFAULT '[]',
  url TEXT,
  project_id TEXT,
  folder_id TEXT,
  source_type TEXT DEFAULT 'manual',
  category TEXT DEFAULT 'article',
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
  related_notes TEXT DEFAULT '[]',
  project_id TEXT,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_output_assets_project ON output_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_output_assets_type ON output_assets(output_type);

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
  webdav_enabled INTEGER DEFAULT 0,
  webdav_url TEXT,
  webdav_username TEXT,
  webdav_password TEXT,
  webdav_path TEXT DEFAULT '/workbench-sync',
  auto_backup_enabled INTEGER DEFAULT 0,
  auto_backup_interval INTEGER DEFAULT 30,
  max_backup_count INTEGER DEFAULT 10,
  sync_on_startup INTEGER DEFAULT 1,
  sync_on_change INTEGER DEFAULT 1,
  compact_backup INTEGER DEFAULT 0,
  last_backup_at INTEGER,
  last_sync_at INTEGER,
  last_sync_status TEXT,
  last_sync_error TEXT
);

CREATE TABLE IF NOT EXISTS backup_history (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  backup_path TEXT,
  file_size INTEGER,
  data_version TEXT,
  is_compact INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

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
-- Agent Runtime 表
-- =====================
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  status TEXT DEFAULT 'active',
  config_json TEXT,
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
-- 初始化默认配置
-- =====================
INSERT OR IGNORE INTO sync_config (id) VALUES ('default');
`;
