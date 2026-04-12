/**
 * Wiki 知识页面系统 - 数据库迁移
 * 包含 wiki_pages, wiki_page_sources 表
 */
export const wikiTablesSql = `
-- =====================
-- Wiki 知识页面
-- =====================
CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT DEFAULT '[]',
  related_page_ids TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0.7,
  reference_count INTEGER DEFAULT 0,
  last_updated_by TEXT DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_project ON wiki_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_updated ON wiki_pages(updated_at DESC);

-- Wiki 页面与原始分块的引用关系
CREATE TABLE IF NOT EXISTS wiki_page_sources (
  id TEXT PRIMARY KEY,
  wiki_page_id TEXT NOT NULL,
  chunk_id TEXT,
  source_id TEXT,
  relevance_score REAL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wiki_page_sources_page ON wiki_page_sources(wiki_page_id);

-- FTS5 全文索引
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_pages_fts
USING fts5(
  wiki_page_id UNINDEXED,
  title,
  content,
  summary,
  tokenize = 'unicode61'
);

-- 触发器：插入时同步 FTS
CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_ai
AFTER INSERT ON wiki_pages BEGIN
  INSERT INTO wiki_pages_fts(wiki_page_id, title, content, summary)
  VALUES (new.id, new.title, new.content, new.summary);
END;

-- 触发器：删除时同步 FTS
CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_ad
AFTER DELETE ON wiki_pages BEGIN
  DELETE FROM wiki_pages_fts WHERE wiki_page_id = old.id;
END;

-- 触发器：更新时同步 FTS
CREATE TRIGGER IF NOT EXISTS wiki_pages_fts_au
AFTER UPDATE ON wiki_pages BEGIN
  DELETE FROM wiki_pages_fts WHERE wiki_page_id = old.id;
  INSERT INTO wiki_pages_fts(wiki_page_id, title, content, summary)
  VALUES (new.id, new.title, new.content, new.summary);
END;

-- 项目 Wiki 启用标志
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS wiki_enabled INTEGER DEFAULT 0;
-- SQLite 不支持 IF NOT EXISTS 的 ALTER TABLE，改用安全方式
`;

export const wikiWorkspaceTablesSql = `
-- =====================
-- 线程工作目录 Wiki
-- =====================
CREATE TABLE IF NOT EXISTS wiki_workspaces (
  scope_path TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_workspace_pages (
  id TEXT PRIMARY KEY,
  scope_path TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT DEFAULT '[]',
  related_page_ids TEXT DEFAULT '[]',
  confidence REAL DEFAULT 0.7,
  reference_count INTEGER DEFAULT 0,
  last_updated_by TEXT DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (scope_path) REFERENCES wiki_workspaces(scope_path) ON DELETE CASCADE,
  UNIQUE(scope_path, slug)
);

CREATE INDEX IF NOT EXISTS idx_wiki_workspace_pages_scope
ON wiki_workspace_pages(scope_path);
CREATE INDEX IF NOT EXISTS idx_wiki_workspace_pages_updated
ON wiki_workspace_pages(updated_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS wiki_workspace_pages_fts
USING fts5(
  wiki_page_id UNINDEXED,
  scope_path UNINDEXED,
  title,
  content,
  summary,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS wiki_workspace_pages_fts_ai
AFTER INSERT ON wiki_workspace_pages BEGIN
  INSERT INTO wiki_workspace_pages_fts(wiki_page_id, scope_path, title, content, summary)
  VALUES (new.id, new.scope_path, new.title, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS wiki_workspace_pages_fts_ad
AFTER DELETE ON wiki_workspace_pages BEGIN
  DELETE FROM wiki_workspace_pages_fts WHERE wiki_page_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS wiki_workspace_pages_fts_au
AFTER UPDATE ON wiki_workspace_pages BEGIN
  DELETE FROM wiki_workspace_pages_fts WHERE wiki_page_id = old.id;
  INSERT INTO wiki_workspace_pages_fts(wiki_page_id, scope_path, title, content, summary)
  VALUES (new.id, new.scope_path, new.title, new.content, new.summary);
END;
`;

/**
 * 安全地添加 wiki_enabled 列到 projects 表
 * 如果列已存在则忽略
 */
export async function ensureWikiColumns(db: {
	execute(sql: string | { sql: string; args: unknown[] }): Promise<unknown>;
}) {
	try {
		await db.execute(
			"ALTER TABLE projects ADD COLUMN wiki_enabled INTEGER DEFAULT 0",
		);
	} catch {
		// 列已存在，忽略
	}
}
