/**
 * Codex CLI 历史读取服务
 * 从 ~/.codex/ 下的 SQLite 数据库和 JSONL rollout 文件中读取历史会话
 */
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";
import * as readline from "readline";
import { createReadStream } from "fs";
import type {
	ExternalThreadMeta,
	ExternalSessionMessage,
	ExternalToolCall,
	CliHistoryListParams,
	CliHistoryReadResult,
} from "../../shared/external-history-types";

// Codex 数据目录
const CODEX_HOME = path.join(os.homedir(), ".codex");
const CODEX_DB_NAME = "state_5.sqlite";
const CODEX_SESSIONS_DIR = "sessions";
const CODEX_SESSION_INDEX = "session_index.jsonl";

/** 检查 Codex 历史是否可用 */
export async function isCodexHistoryAvailable(): Promise<boolean> {
	try {
		const dbPath = path.join(CODEX_HOME, CODEX_DB_NAME);
		await fs.access(dbPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * 列出 Codex CLI 的历史线程
 * 使用 SQLite 读取线程元数据（通过 better-sqlite3 或 sqlite3 命令行）
 */
export async function listCodexThreads(
	params: CliHistoryListParams = {}
): Promise<ExternalThreadMeta[]> {
	const { limit = 50, cwd, search } = params;

	// 方案：通过 sqlite3 命令行工具读取（避免依赖 native 模块）
	const dbPath = path.join(CODEX_HOME, CODEX_DB_NAME);
	try {
		await fs.access(dbPath);
	} catch {
		return [];
	}

	const { execFile } = await import("child_process");
	const { promisify } = await import("util");
	const execFileAsync = promisify(execFile);

	// 构建 SQL 查询（安全转义输入参数）
	let whereClause = "WHERE archived = 0";
	if (cwd) {
		// 严格转义：单引号翻倍 + 过滤危险字符
		const safeCwd = cwd.replace(/'/g, "''").replace(/[\x00-\x1f]/g, "");
		whereClause += ` AND cwd = '${safeCwd}'`;
	}
	if (search) {
		const safeSearch = search.replace(/'/g, "''").replace(/[\x00-\x1f%_]/g, "");
		whereClause += ` AND (title LIKE '%${safeSearch}%' OR first_user_message LIKE '%${safeSearch}%')`;
	}

	const sql = `SELECT id, title, cwd, model_provider, created_at, updated_at, tokens_used, first_user_message, git_branch, git_sha, approval_mode, source FROM threads ${whereClause} ORDER BY updated_at DESC LIMIT ${Math.max(1, Math.min(limit, 200))};`;

	try {
		const { stdout } = await execFileAsync("sqlite3", [
			"-json",
			dbPath,
			sql,
		]);

		if (!stdout.trim()) return [];

		const rows = JSON.parse(stdout) as Array<{
			id: string;
			title: string;
			cwd: string;
			model_provider: string;
			created_at: number;
			updated_at: number;
			tokens_used: number;
			first_user_message: string | null;
			git_branch: string | null;
			git_sha: string | null;
			approval_mode: string;
			source: string;
		}>;

		return rows.map((row) => ({
			id: row.id,
			title: row.title || row.first_user_message?.slice(0, 80) || "Codex 会话",
			source: "codex-cli" as const,
			cwd: row.cwd,
			projectName: path.basename(row.cwd),
			model: row.model_provider || undefined,
			modelProvider: row.model_provider,
			createdAt: row.created_at * 1000, // Codex 存秒级时间戳
			updatedAt: row.updated_at * 1000,
			tokensUsed: row.tokens_used,
			gitBranch: row.git_branch || undefined,
			gitSha: row.git_sha || undefined,
			firstMessage: row.first_user_message?.slice(0, 200) || undefined,
		}));
	} catch (err) {
		console.error("[codexHistoryService] Failed to query SQLite:", err);
		// 回退到 session_index.jsonl
		return listCodexThreadsFromIndex(params);
	}
}

/**
 * 回退方案：从 session_index.jsonl 读取
 */
async function listCodexThreadsFromIndex(
	params: CliHistoryListParams = {}
): Promise<ExternalThreadMeta[]> {
	const { limit = 50 } = params;
	const indexPath = path.join(CODEX_HOME, CODEX_SESSION_INDEX);

	try {
		await fs.access(indexPath);
	} catch {
		return [];
	}

	const content = await fs.readFile(indexPath, "utf-8");
	const lines = content.trim().split("\n").filter(Boolean);
	const threads: ExternalThreadMeta[] = [];

	for (const line of lines.slice(-limit)) {
		try {
			const entry = JSON.parse(line) as {
				id: string;
				thread_name?: string;
				updated_at?: string;
			};
			threads.push({
				id: entry.id,
				title: entry.thread_name || "Codex 会话",
				source: "codex-cli",
				cwd: "",
				projectName: "",
				createdAt: entry.updated_at
					? new Date(entry.updated_at).getTime()
					: Date.now(),
				updatedAt: entry.updated_at
					? new Date(entry.updated_at).getTime()
					: Date.now(),
			});
		} catch {
			// skip malformed line
		}
	}

	return threads.reverse(); // 最新的在前
}

/**
 * 读取 Codex CLI 的完整会话内容
 * 从 rollout JSONL 文件中解析对话记录
 */
export async function readCodexThread(
	threadId: string,
	maxMessages = 200
): Promise<CliHistoryReadResult | null> {
	// 先从 SQLite 获取元数据（含 rollout_path）
	const meta = await getCodexThreadMeta(threadId);
	if (!meta) return null;

	// 查找 rollout 文件
	const rolloutPath = await findCodexRolloutFile(threadId);
	if (!rolloutPath) {
		return { metadata: meta, messages: [] };
	}

	// 解析 rollout JSONL
	const messages = await parseCodexRollout(rolloutPath, maxMessages);
	return { metadata: meta, messages };
}

/** 从 SQLite 获取单个线程的元数据 */
async function getCodexThreadMeta(
	threadId: string
): Promise<ExternalThreadMeta | null> {
	const dbPath = path.join(CODEX_HOME, CODEX_DB_NAME);
	try {
		await fs.access(dbPath);
	} catch {
		return null;
	}

	const { execFile } = await import("child_process");
	const { promisify } = await import("util");
	const execFileAsync = promisify(execFile);

	const safeThreadId = threadId.replace(/'/g, "''").replace(/[\x00-\x1f]/g, "");
	const sql = `SELECT id, title, cwd, model_provider, created_at, updated_at, tokens_used, first_user_message, git_branch, git_sha FROM threads WHERE id = '${safeThreadId}' LIMIT 1;`;

	try {
		const { stdout } = await execFileAsync("sqlite3", [
			"-json",
			dbPath,
			sql,
		]);
		if (!stdout.trim()) return null;

		const rows = JSON.parse(stdout);
		if (!rows.length) return null;
		const row = rows[0];

		return {
			id: row.id,
			title: row.title || row.first_user_message?.slice(0, 80) || "Codex 会话",
			source: "codex-cli",
			cwd: row.cwd,
			projectName: path.basename(row.cwd),
			modelProvider: row.model_provider,
			createdAt: row.created_at * 1000,
			updatedAt: row.updated_at * 1000,
			tokensUsed: row.tokens_used,
			gitBranch: row.git_branch || undefined,
			gitSha: row.git_sha || undefined,
			firstMessage: row.first_user_message?.slice(0, 200) || undefined,
		};
	} catch {
		return null;
	}
}

/** 查找 Codex rollout 文件路径 */
async function findCodexRolloutFile(
	threadId: string
): Promise<string | null> {
	// 首先尝试从 SQLite 获取 rollout_path
	const dbPath = path.join(CODEX_HOME, CODEX_DB_NAME);
	try {
		const { execFile } = await import("child_process");
		const { promisify } = await import("util");
		const execFileAsync = promisify(execFile);

		const safeId = threadId.replace(/'/g, "''").replace(/[\x00-\x1f]/g, "");
		const sql = `SELECT rollout_path FROM threads WHERE id = '${safeId}' LIMIT 1;`;
		const { stdout } = await execFileAsync("sqlite3", [
			"-json",
			dbPath,
			sql,
		]);

		if (stdout.trim()) {
			const rows = JSON.parse(stdout);
			if (rows.length && rows[0].rollout_path) {
				const rolloutPath = rows[0].rollout_path;
				try {
					await fs.access(rolloutPath);
					return rolloutPath;
				} catch {
					// 文件不存在，继续搜索
				}
			}
		}
	} catch {
		// 忽略
	}

	// 回退：在 sessions 目录下递归搜索
	const sessionsDir = path.join(CODEX_HOME, CODEX_SESSIONS_DIR);
	try {
		return await findFileRecursive(sessionsDir, `${threadId}.jsonl`);
	} catch {
		return null;
	}
}

/** 递归查找文件 */
async function findFileRecursive(
	dir: string,
	filename: string
): Promise<string | null> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				const found = await findFileRecursive(fullPath, filename);
				if (found) return found;
			} else if (entry.name === filename) {
				return fullPath;
			}
		}
	} catch {
		// 忽略权限错误等
	}
	return null;
}

/** 解析 Codex rollout JSONL 文件 */
async function parseCodexRollout(
	filePath: string,
	maxMessages: number
): Promise<ExternalSessionMessage[]> {
	const messages: ExternalSessionMessage[] = [];

	const fileStream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let msgIndex = 0;

	for await (const line of rl) {
		if (messages.length >= maxMessages) break;
		if (!line.trim()) continue;

		try {
			const event = JSON.parse(line);
			const parsed = parseCodexRolloutEvent(event, msgIndex);
			if (parsed) {
				messages.push(parsed);
				msgIndex++;
			}
		} catch {
			// skip malformed lines
		}
	}

	return messages;
}

/**
 * 将 Codex rollout 事件转换为统一消息格式
 * Codex rollout 格式参考 app-server-protocol 中的 ThreadItem 定义
 */
function parseCodexRolloutEvent(
	event: Record<string, unknown>,
	index: number
): ExternalSessionMessage | null {
	const type = event.type as string;

	// Codex rollout 事件格式多样，常见类型：
	// - input_item（用户输入）
	// - response.output_item.done（AI 输出完成）
	// - response.completed（轮次完成）

	if (type === "input_item" || type === "conversation.item.created") {
		const item = (event.item || event) as Record<string, unknown>;
		const role = item.role as string;
		if (role === "user") {
			const content = extractContentText(item.content);
			if (content) {
				return {
					id: (item.id as string) || `codex_msg_${index}`,
					role: "user",
					timestamp: Date.now(),
					content,
				};
			}
		}
	}

	if (type === "response.output_item.done") {
		const item = (event.item || event) as Record<string, unknown>;
		const itemType = item.type as string;

		if (itemType === "message") {
			const content = extractContentText(item.content);
			if (content) {
				return {
					id: (item.id as string) || `codex_msg_${index}`,
					role: "assistant",
					timestamp: Date.now(),
					content,
				};
			}
		}

		if (itemType === "function_call") {
			const toolCall: ExternalToolCall = {
				id: (item.call_id as string) || `tool_${index}`,
				name: (item.name as string) || "unknown",
				input: parseJsonSafe(item.arguments as string),
				output: (item.output as string) || undefined,
				status: "completed",
			};

			return {
				id: (item.id as string) || `codex_msg_${index}`,
				role: "assistant",
				timestamp: Date.now(),
				content: `使用工具: ${toolCall.name}`,
				toolCalls: [toolCall],
			};
		}
	}

	// response.completed 包含 usage 信息，不产生消息
	return null;
}

/** 从 Codex 的 content 数组中提取文本 */
function extractContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(c: Record<string, unknown>) =>
					c.type === "input_text" || c.type === "output_text" || c.type === "text"
			)
			.map((c: Record<string, unknown>) => c.text || "")
			.join("\n");
	}
	return "";
}

/** 安全解析 JSON 字符串 */
function parseJsonSafe(str: string | undefined): Record<string, unknown> {
	if (!str) return {};
	try {
		return JSON.parse(str);
	} catch {
		return { raw: str };
	}
}
