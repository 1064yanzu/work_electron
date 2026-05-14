/**
 * Agent 显式调用的长期记忆工具（MCP）
 *
 * 工具名：mcp__ipo_agent_memory__memory
 *
 * action：
 *   - add(target, content)              新增条目（user/memory）
 *   - replace(target, old_text, content) 替换条目（精确匹配且唯一）
 *   - remove(target, old_text)           删除条目
 *   - read(target)                       读取当前文件全文（含 SOUL）
 *
 * 设计要点：
 *   - target 不接受 soul 的写入操作——SOUL 是用户独占
 *   - 任何写入都经过 scanForInjection 安全扫描
 *   - 写入命中限额 / 找不到 / 多条匹配 / 安全拒绝 时，返回当前文件全文，
 *     让 Agent 自我修正
 *   - 工具结果体保持 JSON 字符串形式，方便 SDK 透传给模型
 */
import { z } from "zod";
import {
	addEntry,
	MEMORY_FILES,
	MemoryEntryAmbiguousError,
	MemoryEntryNotFoundError,
	MemoryQuotaError,
	type MemoryFileName,
	readFile as readMemoryFile,
	removeEntry,
	replaceEntry,
} from "./memoryFileStore";
import { scanForInjection } from "./memorySecurityScan";

const MEMORY_SERVER_NAME = "ipo_agent_memory";
const MEMORY_TOOL_NAME = "memory";

export const MEMORY_MCP_TOOL_NAME =
	`mcp__${MEMORY_SERVER_NAME}__${MEMORY_TOOL_NAME}` as const;

type ClaudeAgentSdkLike = {
	createSdkMcpServer: (options: unknown) => unknown;
	tool: (
		name: string,
		description: string,
		inputSchema: Record<string, unknown>,
		handler: (args: Record<string, unknown>) => Promise<unknown>,
		extras?: Record<string, unknown>,
	) => unknown;
};

const TARGET_DESC =
	"目标文件：user=用户偏好/习惯/禁用项；memory=环境事实/约定/教训。SOUL 由用户独占，工具不可写。";

type WriteTarget = Extract<MemoryFileName, "user" | "memory">;

function isWriteTarget(value: unknown): value is WriteTarget {
	return value === "user" || value === "memory";
}

function asJsonResult(payload: unknown) {
	return {
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
	};
}

async function readSnapshotForError(
	target: MemoryFileName,
): Promise<{ content: string; charCount: number; limit: number }> {
	const file = await readMemoryFile(target);
	return {
		content: file.content,
		charCount: file.charCount,
		limit: file.limit,
	};
}

export function createMemoryMcpServer(sdk: ClaudeAgentSdkLike) {
	return sdk.createSdkMcpServer({
		name: MEMORY_SERVER_NAME,
		version: "1.0.0",
		alwaysLoad: true,
		tools: [
			sdk.tool(
				MEMORY_TOOL_NAME,
				[
					"Long-term memory: manage USER/MEMORY markdown files that get injected into future sessions.",
					"Use sparingly — only when the user asks you to remember something, or when a fact has clear long-term value.",
					"Each entry is a self-contained paragraph; the system separates entries with § markers.",
					"Read SOUL with action=read to inspect the persona file (user-owned, read-only via this tool).",
				].join(" "),
				{
					action: z
						.enum(["add", "replace", "remove", "read"])
						.describe("Memory action."),
					target: z
						.enum(["user", "memory", "soul"])
						.describe(TARGET_DESC),
					content: z
						.string()
						.optional()
						.describe(
							"New entry text for add/replace. Self-contained paragraph in user's language.",
						),
					old_text: z
						.string()
						.optional()
						.describe(
							"For replace/remove: substring that uniquely identifies the existing entry.",
						),
				},
				async (args) => {
					const action = String(args.action || "").toLowerCase();
					const target = String(args.target || "").toLowerCase();
					const content = typeof args.content === "string" ? args.content : "";
					const oldText =
						typeof args.old_text === "string" ? args.old_text : "";

					if (!["add", "replace", "remove", "read"].includes(action)) {
						return asJsonResult({
							ok: false,
							error: "INVALID_ACTION",
							message: `Unknown action: ${action}`,
						});
					}
					if (!["user", "memory", "soul"].includes(target)) {
						return asJsonResult({
							ok: false,
							error: "INVALID_TARGET",
							message: `Unknown target: ${target}`,
						});
					}

					if (action === "read") {
						const file = await readMemoryFile(target as MemoryFileName);
						return asJsonResult({
							ok: true,
							target,
							content: file.content,
							charCount: file.charCount,
							limit: file.limit,
							exists: file.exists,
							lastModified: file.lastModified,
						});
					}

					if (!isWriteTarget(target)) {
						return asJsonResult({
							ok: false,
							error: "INVALID_TARGET",
							message: "SOUL is user-owned and cannot be modified by the tool.",
						});
					}

					try {
						if (action === "add") {
							if (!content.trim()) {
								return asJsonResult({
									ok: false,
									error: "EMPTY_CONTENT",
									message: "content is required for add",
								});
							}
							const scan = scanForInjection(content);
							if (!scan.ok) {
								const cur = await readSnapshotForError(target);
								return asJsonResult({
									ok: false,
									error: "SECURITY_REJECTED",
									reason: scan.reason,
									matched: scan.matchedPattern,
									currentContent: cur.content,
									charCount: cur.charCount,
									limit: cur.limit,
								});
							}
							const next = await addEntry(target, content);
							return asJsonResult({
								ok: true,
								action,
								target,
								content: next.content,
								charCount: next.charCount,
								limit: next.limit,
								lastModified: next.lastModified,
							});
						}

						if (action === "replace") {
							if (!oldText.trim()) {
								return asJsonResult({
									ok: false,
									error: "EMPTY_OLD_TEXT",
									message: "old_text is required for replace",
								});
							}
							if (!content.trim()) {
								return asJsonResult({
									ok: false,
									error: "EMPTY_CONTENT",
									message: "content is required for replace",
								});
							}
							const scan = scanForInjection(content);
							if (!scan.ok) {
								const cur = await readSnapshotForError(target);
								return asJsonResult({
									ok: false,
									error: "SECURITY_REJECTED",
									reason: scan.reason,
									matched: scan.matchedPattern,
									currentContent: cur.content,
									charCount: cur.charCount,
									limit: cur.limit,
								});
							}
							const next = await replaceEntry(target, oldText, content);
							return asJsonResult({
								ok: true,
								action,
								target,
								content: next.content,
								charCount: next.charCount,
								limit: next.limit,
								lastModified: next.lastModified,
							});
						}

						// action === "remove"
						if (!oldText.trim()) {
							return asJsonResult({
								ok: false,
								error: "EMPTY_OLD_TEXT",
								message: "old_text is required for remove",
							});
						}
						const next = await removeEntry(target, oldText);
						return asJsonResult({
							ok: true,
							action,
							target,
							content: next.content,
							charCount: next.charCount,
							limit: next.limit,
							lastModified: next.lastModified,
						});
					} catch (err) {
						if (err instanceof MemoryQuotaError) {
							return asJsonResult({
								ok: false,
								error: "OVER_QUOTA",
								attempted: err.attempted,
								limit: err.limit,
								currentContent: err.currentContent,
								message:
									`Writing this entry would exceed ${MEMORY_FILES[target].displayName} limit (${err.limit}). ` +
									`Remove or shorten existing entries first.`,
							});
						}
						if (err instanceof MemoryEntryNotFoundError) {
							return asJsonResult({
								ok: false,
								error: "NOT_FOUND",
								searchText: err.searchText,
								currentContent: err.currentContent,
								message: `No entry in ${target} contained the given substring. Read current file and try again with a more specific search.`,
							});
						}
						if (err instanceof MemoryEntryAmbiguousError) {
							return asJsonResult({
								ok: false,
								error: "AMBIGUOUS",
								searchText: err.searchText,
								matchCount: err.matchCount,
								currentContent: err.currentContent,
								message: `Multiple entries match the search text; provide more context to disambiguate.`,
							});
						}
						return asJsonResult({
							ok: false,
							error: "IO_ERROR",
							message: err instanceof Error ? err.message : String(err),
						});
					}
				},
				{
					alwaysLoad: true,
					searchHint:
						"long-term memory, remember preference, user instruction, persona",
					annotations: {
						title: "长期记忆",
						readOnlyHint: false,
						openWorldHint: false,
					},
				},
			),
		],
	});
}
