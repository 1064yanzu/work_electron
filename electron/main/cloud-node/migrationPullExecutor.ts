import type { DbContext } from "../db/client";
import type { AppErrorCode } from "./types";

type MigrationScope = "session" | "resource";

type JsonRecord = Record<string, unknown>;

type MigrationChunk = {
	seq: number;
	data: JsonRecord;
	progress: number;
};

type ExecuteInput = {
	scope: MigrationScope;
	sessionId?: string;
	onChunk: (chunk: MigrationChunk) => Promise<void> | void;
};

type ExecuteResult = {
	chunks: number;
	records: number;
};

type AgentSessionRow = {
	id: string;
	title: string | null;
	status: string | null;
	created_at: number | null;
	updated_at: number | null;
};

type AgentMessageRow = {
	id: string;
	session_id: string;
	task_id: string | null;
	role: string | null;
	content_json: string | null;
	created_at: number | null;
};

type LocalArtifactRow = {
	id: string;
	session_id: string;
	file_name: string | null;
	file_path: string | null;
	file_type: string | null;
	description: string | null;
	created_at: number | null;
};

type ProjectRow = {
	id: string;
	name: string | null;
	description: string | null;
	created_at: number | null;
	updated_at: number | null;
};

type SourceRow = {
	id: string;
	title: string | null;
	kind: string | null;
	url: string | null;
	project_id: string | null;
	description: string | null;
	tags: string | null;
	created_at: number | null;
	updated_at: number | null;
};

type NoteRow = {
	id: string;
	source_id: string | null;
	project_id: string | null;
	source_title: string | null;
	content: string | null;
	created_at: number | null;
	updated_at: number | null;
};

type OutputAssetRow = {
	id: string;
	title: string | null;
	content: string | null;
	output_type: string | null;
	project_id: string | null;
	scope: string | null;
	tags: string | null;
	storage_path: string | null;
	version: number | null;
	created_at: number | null;
	updated_at: number | null;
};

type NodeError = Error & { code?: AppErrorCode };

function asString(value: unknown, fallback = ""): string {
	const text = String(value ?? fallback).trim();
	return text || fallback;
}

function asNullableString(value: unknown): string | null {
	const text = String(value ?? "").trim();
	return text ? text : null;
}

function asNumber(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.floor(parsed);
}

function tryParseJson(raw: string | null | undefined): unknown {
	if (!raw || typeof raw !== "string") return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
	const parsed = tryParseJson(raw);
	return Array.isArray(parsed) ? parsed : [];
}

function extractText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		return value.map((item) => extractText(item)).filter(Boolean).join("\n");
	}
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		if (typeof obj.text === "string") return obj.text;
		if (typeof obj.content === "string") return obj.content;
		if (typeof obj.message === "string") return obj.message;
		if (Array.isArray(obj.content)) {
			const joined = obj.content.map((item) => extractText(item)).filter(Boolean).join("\n");
			if (joined) return joined;
		}
		if (Array.isArray(obj.parts)) {
			const joined = obj.parts.map((item) => extractText(item)).filter(Boolean).join("\n");
			if (joined) return joined;
		}
	}
	return "";
}

function mapSessionState(status: string | null): string {
	const normalized = asString(status, "active").toLowerCase();
	if (normalized === "active" || normalized === "running") return "running";
	if (normalized === "waiting_interaction") return "waiting_interaction";
	if (normalized === "completed" || normalized === "done" || normalized === "success") return "completed";
	if (normalized === "aborted" || normalized === "cancelled" || normalized === "canceled") return "aborted";
	if (normalized === "error" || normalized === "failed") return "error";
	return "running";
}

function splitBySize<T>(rows: T[], size: number): T[][] {
	if (rows.length === 0) return [];
	const chunks: T[][] = [];
	for (let i = 0; i < rows.length; i += size) {
		chunks.push(rows.slice(i, i + size));
	}
	return chunks;
}

function buildError(message: string, code: AppErrorCode): NodeError {
	const error = new Error(message) as NodeError;
	error.code = code;
	return error;
}

export class MigrationPullExecutor {
	private readonly tableExistsCache = new Map<string, boolean>();

	constructor(private readonly db: DbContext) {}

	async execute(input: ExecuteInput): Promise<ExecuteResult> {
		if (input.scope === "session") {
			return this.executeSessionScope(input);
		}
		return this.executeResourceScope(input);
	}

	private async executeSessionScope(input: ExecuteInput): Promise<ExecuteResult> {
		if (!(await this.hasTable("agent_sessions"))) {
			return { chunks: 0, records: 0 };
		}

		const sessions = await this.queryAgentSessions(input.sessionId);
		if (input.sessionId && sessions.length === 0) {
			throw buildError("指定会话不存在，无法迁移", "NOT_FOUND");
		}
		if (sessions.length === 0) {
			return { chunks: 0, records: 0 };
		}

		let seq = 0;
		let records = 0;
		const total = sessions.length;

		for (const session of sessions) {
			const messageRows = await this.queryAgentMessages(session.id);
			const artifactRows = await this.queryArtifactsBySession(session.id);

			const mappedSession = {
				id: session.id,
				title: asString(session.title, "已迁移会话"),
				state: mapSessionState(session.status),
				execution_target: "desktop",
				created_at: asNumber(session.created_at, Date.now()),
				updated_at: asNumber(session.updated_at, Date.now()),
			};

			const mappedMessages = messageRows.map((row) => {
				const parsed = tryParseJson(row.content_json);
				const textFromJson = extractText(parsed);
				const text = textFromJson || asString(row.content_json, "");
				return {
					id: row.id,
					session_id: row.session_id,
					run_id: asNullableString(row.task_id),
					role: asString(row.role, "assistant"),
					content: text,
					created_at: asNumber(row.created_at, Date.now()),
				};
			});

			const mappedArtifacts = artifactRows.map((row) => ({
				id: row.id,
				session_id: row.session_id,
				run_id: null,
				title: asString(row.file_name, "本地产物"),
				artifact_type: asString(row.file_type, "file"),
				url: null,
				content: asNullableString(row.description),
				metadata: {
					file_path: asNullableString(row.file_path),
				},
				created_at: asNumber(row.created_at, Date.now()),
				updated_at: asNumber(row.created_at, Date.now()),
			}));

			seq += 1;
			records += 1 + mappedMessages.length + mappedArtifacts.length;
			const progress = Math.min(100, Math.floor((seq / total) * 100));
			await input.onChunk({
				seq,
				progress,
				data: {
					scope: "session",
					sessions: [mappedSession],
					messages: mappedMessages,
					artifacts: mappedArtifacts,
				},
			});
		}

		return { chunks: seq, records };
	}

	private async executeResourceScope(input: ExecuteInput): Promise<ExecuteResult> {
		const projectRows = await this.queryProjects();
		const sourceRows = await this.querySources();
		const noteRows = await this.queryNotes();
		const outputRows = await this.queryOutputAssets();

		const mappedProjects = projectRows.map((row) => ({
			id: row.id,
			title: asString(row.name, "未命名项目"),
			description: asNullableString(row.description),
			created_at: asNumber(row.created_at, Date.now()),
			updated_at: asNumber(row.updated_at, Date.now()),
		}));

		const mappedSourceItems = sourceRows.map((row) => ({
			id: row.id,
			project_id: asNullableString(row.project_id),
			kind: asString(row.kind, "source"),
			title: asString(row.title, "未命名资料"),
			content: asString(row.description, asString(row.url, "")),
			metadata: {
				url: asNullableString(row.url),
				tags: parseJsonArray(row.tags),
			},
			created_at: asNumber(row.created_at, Date.now()),
			updated_at: asNumber(row.updated_at, Date.now()),
		}));

		const mappedNoteItems = noteRows.map((row) => {
			const content = asString(row.content, "");
			const fallbackTitle = content.split("\n")[0]?.trim() || "笔记";
			return {
				id: row.id,
				project_id: asNullableString(row.project_id),
				kind: "note",
				title: asString(row.source_title, fallbackTitle).slice(0, 80),
				content,
				metadata: {
					source_id: asNullableString(row.source_id),
				},
				created_at: asNumber(row.created_at, Date.now()),
				updated_at: asNumber(row.updated_at, Date.now()),
			};
		});

		const mappedArtifacts = outputRows.map((row) => ({
			id: row.id,
			session_id: null,
			run_id: null,
			title: asString(row.title, "输出产物"),
			artifact_type: asString(row.output_type, "output_asset"),
			url: null,
			content: asNullableString(row.content),
			metadata: {
				project_id: asNullableString(row.project_id),
				scope: asNullableString(row.scope),
				tags: parseJsonArray(row.tags),
				storage_path: asNullableString(row.storage_path),
				version: row.version,
			},
			created_at: asNumber(row.created_at, Date.now()),
			updated_at: asNumber(row.updated_at, Date.now()),
		}));

		const projectChunks = splitBySize(mappedProjects, 100).map((rows) => ({
			resource_projects: rows,
		}));
		const resourceChunks = splitBySize([...mappedSourceItems, ...mappedNoteItems], 100).map((rows) => ({
			resource_items: rows,
		}));
		const artifactChunks = splitBySize(mappedArtifacts, 100).map((rows) => ({
			artifacts: rows,
		}));

		const allChunks = [...projectChunks, ...resourceChunks, ...artifactChunks];
		if (allChunks.length === 0) {
			return { chunks: 0, records: 0 };
		}

		let seq = 0;
		for (const chunk of allChunks) {
			seq += 1;
			const progress = Math.min(100, Math.floor((seq / allChunks.length) * 100));
			await input.onChunk({
				seq,
				progress,
				data: {
					scope: "resource",
					...chunk,
				},
			});
		}

		return {
			chunks: allChunks.length,
			records:
				mappedProjects.length +
				mappedSourceItems.length +
				mappedNoteItems.length +
				mappedArtifacts.length,
		};
	}

	private async hasTable(name: string): Promise<boolean> {
		const cached = this.tableExistsCache.get(name);
		if (typeof cached === "boolean") return cached;
		const rows = await this.db.client.execute({
			sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
			args: [name],
		});
		const exists = rows.rows.length > 0;
		this.tableExistsCache.set(name, exists);
		return exists;
	}

	private async queryAgentSessions(sessionId?: string): Promise<AgentSessionRow[]> {
		if (sessionId) {
			const rows = await this.db.client.execute({
				sql: "SELECT id, title, status, created_at, updated_at FROM agent_sessions WHERE id = ?",
				args: [sessionId],
			});
			return rows.rows as unknown as AgentSessionRow[];
		}
		const rows = await this.db.client.execute(
			"SELECT id, title, status, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC LIMIT 200",
		);
		return rows.rows as unknown as AgentSessionRow[];
	}

	private async queryAgentMessages(sessionId: string): Promise<AgentMessageRow[]> {
		if (!(await this.hasTable("agent_messages"))) return [];
		const rows = await this.db.client.execute({
			sql: "SELECT id, session_id, task_id, role, content_json, created_at FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC",
			args: [sessionId],
		});
		return rows.rows as unknown as AgentMessageRow[];
	}

	private async queryArtifactsBySession(sessionId: string): Promise<LocalArtifactRow[]> {
		if (!(await this.hasTable("artifacts"))) return [];
		const rows = await this.db.client.execute({
			sql: "SELECT id, session_id, file_name, file_path, file_type, description, created_at FROM artifacts WHERE session_id = ? ORDER BY created_at ASC",
			args: [sessionId],
		});
		return rows.rows as unknown as LocalArtifactRow[];
	}

	private async queryProjects(): Promise<ProjectRow[]> {
		if (!(await this.hasTable("projects"))) return [];
		const rows = await this.db.client.execute(
			"SELECT id, name, description, created_at, updated_at FROM projects WHERE COALESCE(is_archived, 0) = 0 ORDER BY updated_at DESC",
		);
		return rows.rows as unknown as ProjectRow[];
	}

	private async querySources(): Promise<SourceRow[]> {
		if (!(await this.hasTable("sources"))) return [];
		const rows = await this.db.client.execute(
			"SELECT id, title, kind, url, project_id, description, tags, created_at, updated_at FROM sources WHERE COALESCE(is_deleted, 0) = 0 ORDER BY updated_at DESC",
		);
		return rows.rows as unknown as SourceRow[];
	}

	private async queryNotes(): Promise<NoteRow[]> {
		if (!(await this.hasTable("notes"))) return [];
		const hasSources = await this.hasTable("sources");
		if (!hasSources) {
			const rows = await this.db.client.execute(
				"SELECT id, source_id, NULL AS project_id, NULL AS source_title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC",
			);
			return rows.rows as unknown as NoteRow[];
		}
		const rows = await this.db.client.execute(
			`SELECT n.id, n.source_id, s.project_id, s.title AS source_title, n.content, n.created_at, n.updated_at
       FROM notes n
       LEFT JOIN sources s ON s.id = n.source_id
       ORDER BY n.updated_at DESC`,
		);
		return rows.rows as unknown as NoteRow[];
	}

	private async queryOutputAssets(): Promise<OutputAssetRow[]> {
		if (!(await this.hasTable("output_assets"))) return [];
		const rows = await this.db.client.execute(
			"SELECT id, title, content, output_type, project_id, scope, tags, storage_path, version, created_at, updated_at FROM output_assets WHERE COALESCE(is_deleted, 0) = 0 ORDER BY updated_at DESC",
		);
		return rows.rows as unknown as OutputAssetRow[];
	}
}
