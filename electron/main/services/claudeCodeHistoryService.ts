/**
 * Claude Code CLI 历史读取服务
 * 从 ~/.claude/projects/ 下的 JSONL 会话文件中读取历史
 *
 * Claude Code 存储结构：
 * ~/.claude/projects/{编码路径}/{session-uuid}.jsonl
 * 路径编码规则：/ → -
 * 每行 JSON 含: type, message(role+content), uuid, parentUuid, sessionId, timestamp, cwd, gitBranch
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

// Claude Code 数据目录
const CLAUDE_HOME = path.join(os.homedir(), ".claude");
const CLAUDE_PROJECTS_DIR = "projects";

/** 检查 Claude Code 历史是否可用 */
export async function isClaudeCodeHistoryAvailable(): Promise<boolean> {
	try {
		const projectsDir = path.join(CLAUDE_HOME, CLAUDE_PROJECTS_DIR);
		await fs.access(projectsDir);
		return true;
	} catch {
		return false;
	}
}

/**
 * 编码项目路径为 Claude Code 的目录名格式
 * 规则：/ → -
 */
function encodeProjectPath(projectPath: string): string {
	return projectPath.replace(/\//g, "-");
}

/**
 * 从编码的目录名还原项目路径
 * 注意：这是一个近似还原（因为原始路径中的 - 和编码的 - 无法区分）
 */
function decodeProjectPath(encoded: string): string {
	// 如果以 - 开头，去掉第一个 - 然后用 / 替换剩余的 -
	if (encoded.startsWith("-")) {
		return encoded.replace(/-/g, "/");
	}
	return encoded;
}

/** 从 JSONL 文件中快速提取元数据（不读取完整内容） */
async function extractSessionMeta(
	filePath: string,
	projectDir: string
): Promise<ExternalThreadMeta | null> {
	const fileStream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	let sessionId: string | null = null;
	let firstUserMessage: string | null = null;
	let firstTimestamp: number | null = null;
	let lastTimestamp: number | null = null;
	let cwd: string | null = null;
	let gitBranch: string | null = null;
	let model: string | null = null;
	let messageCount = 0;
	let lineCount = 0;

	for await (const line of rl) {
		if (!line.trim()) continue;
		lineCount++;

		// 只读前 50 行和最后的时间戳（通过 stat 获取 mtime）
		if (lineCount > 50 && firstUserMessage) break;

		try {
			const entry = JSON.parse(line) as ClaudeCodeJSONLEntry;

			// 提取 sessionId
			if (!sessionId && entry.sessionId) {
				sessionId = entry.sessionId;
			}

			// 提取 cwd
			if (!cwd && entry.cwd) {
				cwd = entry.cwd;
			}

			// 提取 gitBranch
			if (!gitBranch && entry.gitBranch) {
				gitBranch = entry.gitBranch;
			}

			// 提取 model（从 assistant 消息的 message 对象中获取）
			if (!model && entry.type === "assistant" && entry.message) {
				const msgModel = (entry.message as Record<string, unknown>).model;
				if (typeof msgModel === "string" && msgModel.trim()) {
					model = msgModel.trim();
				}
			}

			// 提取时间戳
			if (entry.timestamp) {
				const ts = new Date(entry.timestamp).getTime();
				if (!firstTimestamp) firstTimestamp = ts;
				lastTimestamp = ts;
			}

			// 提取首条用户消息
			if (!firstUserMessage && entry.type === "user" && entry.message?.role === "user") {
				const content = extractContentFromMessage(entry.message);
				if (content) firstUserMessage = content.slice(0, 200);
			}

			// 计数消息
			if (entry.type === "user" || entry.type === "assistant") {
				messageCount++;
			}
		} catch {
			// skip malformed lines
		}
	}

	if (!sessionId) {
		// 从文件名推断
		sessionId = path.basename(filePath, ".jsonl");
	}

	// 获取文件修改时间作为 updatedAt
	const stat = await fs.stat(filePath);
	const decodedPath = decodeProjectPath(projectDir);

	return {
		id: sessionId,
		title: firstUserMessage?.slice(0, 80) || "Claude Code 会话",
		source: "claude-code-cli",
		cwd: cwd || decodedPath,
		projectName: path.basename(cwd || decodedPath),
		model: model || undefined,
		createdAt: firstTimestamp || stat.birthtimeMs,
		updatedAt: lastTimestamp || stat.mtimeMs,
		gitBranch: gitBranch || undefined,
		messageCount,
		firstMessage: firstUserMessage || undefined,
	};
}

/**
 * 列出 Claude Code CLI 的历史会话
 */
export async function listClaudeCodeSessions(
	params: CliHistoryListParams = {}
): Promise<ExternalThreadMeta[]> {
	const { limit = 50, cwd, search } = params;

	const projectsDir = path.join(CLAUDE_HOME, CLAUDE_PROJECTS_DIR);
	try {
		await fs.access(projectsDir);
	} catch {
		return [];
	}

	const threads: ExternalThreadMeta[] = [];

	// 如果指定了 cwd，只扫描对应的项目目录
	let projectDirs: string[];
	if (cwd) {
		const encoded = encodeProjectPath(cwd);
		projectDirs = [encoded];
	} else {
		// 扫描所有项目目录
		const entries = await fs.readdir(projectsDir, { withFileTypes: true });
		projectDirs = entries
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
	}

	for (const projDir of projectDirs) {
		const projPath = path.join(projectsDir, projDir);

		try {
			const files = await fs.readdir(projPath, { withFileTypes: true });
			const jsonlFiles = files
				.filter((f) => f.isFile() && f.name.endsWith(".jsonl"))
				.sort((a, b) => {
					// 按文件名排序（UUID 中含时间信息）
					return b.name.localeCompare(a.name);
				});

			// 每个项目最多取最近 10 个会话
			for (const file of jsonlFiles.slice(0, 10)) {
				if (threads.length >= limit) break;

				const filePath = path.join(projPath, file.name);
				const meta = await extractSessionMeta(filePath, projDir);
				if (meta) {
					// 搜索过滤
					if (search) {
						const searchLower = search.toLowerCase();
						const matchTitle = meta.title.toLowerCase().includes(searchLower);
						const matchMsg = meta.firstMessage
							?.toLowerCase()
							.includes(searchLower);
						if (!matchTitle && !matchMsg) continue;
					}
					threads.push(meta);
				}
			}
		} catch {
			// 忽略无权限等错误
		}

		if (threads.length >= limit) break;
	}

	// 按更新时间排序
	threads.sort((a, b) => b.updatedAt - a.updatedAt);
	return threads.slice(0, limit);
}

/**
 * 读取 Claude Code CLI 的完整会话内容
 */
export async function readClaudeCodeSession(
	sessionId: string,
	maxMessages = 200
): Promise<CliHistoryReadResult | null> {
	// 在所有项目目录下查找 session 文件
	const filePath = await findSessionFile(sessionId);
	if (!filePath) return null;

	const projectDir = path.basename(path.dirname(filePath));
	const meta = await extractSessionMeta(filePath, projectDir);
	if (!meta) return null;

	// 解析完整会话
	const messages = await parseClaudeCodeSession(filePath, maxMessages);
	return { metadata: meta, messages };
}

/** 查找会话文件 */
async function findSessionFile(sessionId: string): Promise<string | null> {
	const projectsDir = path.join(CLAUDE_HOME, CLAUDE_PROJECTS_DIR);

	try {
		const entries = await fs.readdir(projectsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;

			const candidate = path.join(
				projectsDir,
				entry.name,
				`${sessionId}.jsonl`
			);
			try {
				await fs.access(candidate);
				return candidate;
			} catch {
				continue;
			}
		}
	} catch {
		// 忽略
	}
	return null;
}

/** Claude Code JSONL 条目类型 */
interface ClaudeCodeJSONLEntry {
	type?: string;
	message?: {
		role: string;
		content: unknown;
		stop_reason?: string;
	};
	uuid?: string;
	parentUuid?: string;
	sessionId?: string;
	timestamp?: string;
	cwd?: string;
	version?: string;
	gitBranch?: string;
	isSidechain?: boolean;
	toolUseResult?: unknown;
}

/** Claude Code message content 类型 */
interface ClaudeCodeContent {
	type: string;
	text?: string;
	name?: string;
	input?: Record<string, unknown>;
	content?: unknown;
	id?: string;
}

/**
 * 解析 Claude Code 会话 JSONL 文件
 */
async function parseClaudeCodeSession(
	filePath: string,
	maxMessages: number
): Promise<ExternalSessionMessage[]> {
	const messages: ExternalSessionMessage[] = [];

	const fileStream = createReadStream(filePath, { encoding: "utf-8" });
	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		if (messages.length >= maxMessages) break;
		if (!line.trim()) continue;

		try {
			const entry = JSON.parse(line) as ClaudeCodeJSONLEntry;

			// 跳过非消息类型（如 file-history-snapshot）
			if (entry.type !== "user" && entry.type !== "assistant") continue;

			// 跳过 sidechain 消息
			if (entry.isSidechain) continue;

			const msg = entry.message;
			if (!msg) continue;

			const timestamp = entry.timestamp
				? new Date(entry.timestamp).getTime()
				: Date.now();

			if (msg.role === "user") {
				const content = extractContentFromMessage(msg);
				if (content) {
					messages.push({
						id: entry.uuid || `cc_${messages.length}`,
						role: "user",
						timestamp,
						content,
						parentId: entry.parentUuid || undefined,
					});
				}
			} else if (msg.role === "assistant") {
				const { text, thinking, toolCalls } =
					extractAssistantContent(msg.content);
				if (text || toolCalls.length > 0) {
					messages.push({
						id: entry.uuid || `cc_${messages.length}`,
						role: "assistant",
						timestamp,
						content: text,
						thinking: thinking || undefined,
						toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
						parentId: entry.parentUuid || undefined,
					});
				}
			}
		} catch {
			// skip malformed lines
		}
	}

	return messages;
}

/** 从 message 中提取文本内容 */
function extractContentFromMessage(msg: {
	content: unknown;
}): string {
	if (typeof msg.content === "string") return msg.content;

	if (Array.isArray(msg.content)) {
		return (msg.content as ClaudeCodeContent[])
			.filter((c) => c.type === "text")
			.map((c) => c.text || "")
			.join("\n");
	}
	return "";
}

/** 从 assistant 消息中提取文本、思考和工具调用 */
function extractAssistantContent(content: unknown): {
	text: string;
	thinking: string | null;
	toolCalls: ExternalToolCall[];
} {
	let text = "";
	let thinking: string | null = null;
	const toolCalls: ExternalToolCall[] = [];

	if (typeof content === "string") {
		return { text: content, thinking: null, toolCalls: [] };
	}

	if (Array.isArray(content)) {
		for (const block of content as ClaudeCodeContent[]) {
			if (block.type === "text") {
				text += (block.text || "") + "\n";
			} else if (block.type === "thinking") {
				thinking = (thinking || "") + (block.text || "");
			} else if (block.type === "tool_use") {
				toolCalls.push({
					id: block.id || `tool_${toolCalls.length}`,
					name: block.name || "unknown",
					input: (block.input as Record<string, unknown>) || {},
					status: "completed",
				});
			}
		}
	}

	return { text: text.trim(), thinking, toolCalls };
}
