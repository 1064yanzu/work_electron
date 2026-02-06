/**
 * Agent Executor - SDK Version with Anthropic Proxy
 *
 * Uses Claude Agent SDK for ALL models by routing through the local Anthropic proxy
 * which translates requests to our multi-provider LLM backend.
 *
 * Architecture:
 *   SDK -> ANTHROPIC_BASE_URL (http://127.0.0.1:8765) -> Anthropic Proxy -> Multi-Provider LLM
 */

import { settingsStore } from "../settingsStore";
import { skillsStore } from "../skillsStore";
import { safeInvoke } from "../tauriBridge";
import { type AgentMessage, ClaudeAgentService } from "./claudeAgentService";
import { agentStore } from "./store";
import type { AgentTaskStep } from "./types";
import { getAgentSandboxDir } from "../api";
import { agentModelSettingsStore } from "../models/agentModelSettingsStore";
import { saveCheckpoint, deleteCheckpoint } from "./api";
import { managedModeStore } from "../managedModeStore";

// Include both ASCII and full-width Chinese punctuation that may cause issues with SDK tools
const ILLEGAL_FILENAME_CHARS_RE =
	/[<>:"/\\|?*\u0000-\u001F？！""''“”‘’：；【】（）《》、，。]/g;

function sanitizeFilename(name: string): string {
	const base = String(name || "file")
		.normalize("NFC")
		.trim();
	const normalized = base.replace(ILLEGAL_FILENAME_CHARS_RE, "_");
	const collapsed = normalized.replace(/\s+/g, " ").trim();
	// Also collapse multiple underscores
	const cleanUnderscores = collapsed.replace(/_+/g, "_");
	const withoutTrailingDotsOrSpaces = cleanUnderscores
		.replace(/[. _]+$/g, "")
		.trim();
	const safe =
		withoutTrailingDotsOrSpaces === "." || withoutTrailingDotsOrSpaces === ".."
			? "file"
			: withoutTrailingDotsOrSpaces;
	return safe.length > 0 ? safe.slice(0, 180) : "file";
}

function ensureExtension(name: string, ext: string): string {
	const e = ext.startsWith(".") ? ext : `.${ext}`;
	if (name.toLowerCase().endsWith(e.toLowerCase())) return name;
	return `${name}${e}`;
}

function getBasename(p: string): string {
	const s = String(p || "");
	const parts = s.split(/[/\\]/).filter(Boolean);
	return parts.length > 0 ? (parts[parts.length - 1] as string) : s;
}

function stripTrailingSlash(p: string): string {
	return String(p || "").replace(/[\\/]+$/, "");
}

function splitExtension(name: string): { stem: string; ext: string } {
	const s = String(name || "").trim();
	const base = getBasename(s);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return { stem: base, ext: "" };
	return { stem: base.slice(0, dot), ext: base.slice(dot) };
}

function extFromMime(mimeType?: string): string {
	const mt = String(mimeType || "")
		.toLowerCase()
		.trim();
	if (!mt) return "";
	if (mt === "text/markdown") return ".md";
	if (mt.startsWith("text/")) return ".txt";
	if (mt === "application/json") return ".json";
	if (mt === "application/pdf") return ".pdf";
	return "";
}

const IMAGE_FILE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
	"tif",
	"tiff",
]);

const DATA_IMAGE_URL_RE = /data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const DATA_IMAGE_URL_LIMIT = 1;

function extensionFromDataImageMime(raw: string): string {
	const mime = String(raw || "").toLowerCase().trim();
	if (!mime) return "png";
	if (mime === "jpeg") return "jpg";
	if (mime === "svg+xml") return "svg";
	return mime.replace(/[^a-z0-9]+/g, "") || "png";
}

function collectDataImageUrlsFromString(raw: string, limit = DATA_IMAGE_URL_LIMIT): string[] {
	const text = String(raw || "");
	if (!text || text.length > 8_000_000) return [];
	const found: string[] = [];
	DATA_IMAGE_URL_RE.lastIndex = 0;
	let match: RegExpExecArray | null = null;
	while ((match = DATA_IMAGE_URL_RE.exec(text)) !== null) {
		if (!match[0]) continue;
		found.push(match[0]);
		if (found.length >= limit) break;
	}
	return found;
}

function collectDataImageUrlsFromUnknown(value: unknown, limit = DATA_IMAGE_URL_LIMIT): string[] {
	const found = new Set<string>();
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number) => {
		if (v === null || v === undefined) return;
		if (depth > 8 || found.size >= limit) return;
		if (typeof v === "string") {
			for (const item of collectDataImageUrlsFromString(v, limit - found.size)) {
				found.add(item);
				if (found.size >= limit) break;
			}
			return;
		}
		if (Array.isArray(v)) {
			for (const item of v) {
				visit(item, depth + 1);
				if (found.size >= limit) break;
			}
			return;
		}
		if (typeof v !== "object") return;
		if (seen.has(v)) return;
		seen.add(v);
		for (const item of Object.values(v as Record<string, unknown>)) {
			visit(item, depth + 1);
			if (found.size >= limit) break;
		}
	};

	visit(value, 0);
	return [...found];
}

async function persistDataImageUrlToSandbox(input: {
	dataUrl: string;
	sandboxDir?: string;
	prefix?: string;
}): Promise<string | null> {
	const sandboxDir = String(input.sandboxDir || "").trim();
	if (!sandboxDir) return null;
	const match = String(input.dataUrl || "").match(
		/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i,
	);
	if (!match) return null;
	const ext = extensionFromDataImageMime(match[1] || "png");
	const base64Data = match[2] || "";
	if (!base64Data) return null;

	const fileName = `${input.prefix || "generated-image"}-${Date.now()}-${Math.random()
		.toString(36)
		.slice(2, 8)}.${ext}`;
	const filePath = `${stripTrailingSlash(sandboxDir)}/images/${fileName}`;

	await safeInvoke<{ success: boolean }>("write_file_safe", {
		payload: {
			path: filePath,
			content: base64Data,
			encoding: "base64",
			create_dirs: true,
		},
	});
	return filePath;
}

function uniqStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const s = String(value || "").trim();
		if (!s || seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

function mergeImagePathsIntoToolOutput(
	toolOutput: unknown,
	imagePaths: string[],
): unknown {
	const paths = uniqStrings(imagePaths);
	if (paths.length === 0) return toolOutput;
	if (toolOutput && typeof toolOutput === "object" && !Array.isArray(toolOutput)) {
		const record = toolOutput as Record<string, unknown>;
		const existing = Array.isArray(record.image_paths)
			? record.image_paths.filter((v): v is string => typeof v === "string")
			: [];
		return {
			...record,
			image_paths: uniqStrings([...existing, ...paths]),
		};
	}
	return {
		image_paths: paths,
	};
}

function stripWrapping(value: string): string {
	let s = String(value || "").trim();
	const pairs: Array<[string, string]> = [
		['"', '"'],
		["'", "'"],
		["`", "`"],
		["<", ">"],
	];
	let changed = true;
	while (changed) {
		changed = false;
		for (const [l, r] of pairs) {
			if (s.startsWith(l) && s.endsWith(r) && s.length >= 2) {
				s = s.slice(1, -1).trim();
				changed = true;
			}
		}
	}
	return s;
}

function hasImageFileExtension(value: string): boolean {
	const s = String(value || "")
		.trim()
		.replace(/^file:\/\//i, "")
		.split("#")[0]
		.split("?")[0];
	const base = getBasename(s);
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return false;
	const ext = base.slice(dot + 1).toLowerCase();
	return IMAGE_FILE_EXTENSIONS.has(ext);
}

function isAbsolutePath(value: string): boolean {
	const s = String(value || "").trim();
	return s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s);
}

function normalizeImageFilePathCandidate(
	raw: string,
	sandboxDir?: string,
): string | null {
	let value = stripWrapping(raw).replace(/^file:\/\//i, "").trim();
	try {
		value = decodeURIComponent(value);
	} catch { }
	if (!value) return null;
	if (value.startsWith("data:image/")) return null;
	if (value.startsWith("http://") || value.startsWith("https://")) return null;
	if (!hasImageFileExtension(value)) return null;

	if (isAbsolutePath(value)) return value;
	if (value.startsWith("~/")) return value;

	if (sandboxDir) {
		const base = stripTrailingSlash(sandboxDir);
		const rel = value
			.replace(/^\.\/+/, "")
			.replace(/\\/g, "/")
			.replace(/^\/+/, "");
		return `${base}/${rel}`;
	}

	return value;
}

function extractImagePathsFromString(raw: string, sandboxDir?: string): string[] {
	const value = String(raw || "");
	if (!value.trim()) return [];

	const found = new Set<string>();

	const addCandidate = (candidate: string) => {
		const normalized = normalizeImageFilePathCandidate(candidate, sandboxDir);
		if (normalized) found.add(normalized);
	};

	// Markdown image syntax: ![alt](<path/to/file with spaces.png>)
	for (const match of value.matchAll(
		/!\[[^\]]*]\((?:<)?([^)\n>]+)(?:>)?\)/g,
	)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	// Quoted absolute/relative paths (supports spaces)
	for (const match of value.matchAll(/["'`]([^"'`\n]+\.[A-Za-z0-9]{2,6})["'`]/g)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	// Unquoted filesystem-like paths (no spaces)
	for (const match of value.matchAll(
		/(?:^|[\s(])((?:\/|\.{1,2}\/|~\/|[A-Za-z]:[\\/])[^"'\n()<>{}]*?\.[A-Za-z0-9]{2,6})(?=$|[\s),])/g,
	)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	return [...found];
}

function collectImageFilePathsFromToolOutput(
	output: unknown,
	sandboxDir?: string,
): string[] {
	const found = new Set<string>();
	const visited = new Set<unknown>();

	const add = (candidate: string) => {
		const normalized = normalizeImageFilePathCandidate(candidate, sandboxDir);
		if (normalized) found.add(normalized);
	};

	const visit = (value: unknown, depth: number) => {
		if (value === null || value === undefined) return;
		if (depth > 8) return;

		if (typeof value === "string") {
			for (const candidate of extractImagePathsFromString(value, sandboxDir)) {
				add(candidate);
			}
			const trimmed = value.trim();
			if (
				(trimmed.startsWith("{") || trimmed.startsWith("[")) &&
				trimmed.length <= 200_000
			) {
				try {
					visit(JSON.parse(trimmed), depth + 1);
				} catch {}
			}
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}

		if (typeof value !== "object") return;
		if (visited.has(value)) return;
		visited.add(value);

		const record = value as Record<string, unknown>;
		for (const [key, v] of Object.entries(record)) {
			const lowerKey = key.toLowerCase();

			if (
				typeof v === "string" &&
				(lowerKey.includes("image") ||
					lowerKey.includes("img") ||
					lowerKey.endsWith("path") ||
					lowerKey.endsWith("url") ||
					lowerKey.includes("file"))
			) {
				add(v);
			}

			if (
				Array.isArray(v) &&
				(lowerKey.includes("image") ||
					lowerKey.endsWith("paths") ||
					lowerKey.includes("files"))
			) {
				for (const item of v) {
					if (typeof item === "string") add(item);
				}
			}

			visit(v, depth + 1);
		}
	};

	visit(output, 0);
	return [...found];
}

function chooseSandboxFileName(input: {
	title: string;
	sourcePath: string;
	mimeType?: string;
}): string {
	const titleBase = getBasename(input.title);
	const { stem: titleStem, ext: titleExt } = splitExtension(titleBase);
	const { ext: pathExt } = splitExtension(
		getBasename(stripTrailingSlash(input.sourcePath)),
	);
	const ext = titleExt || pathExt || extFromMime(input.mimeType);
	const stemRaw = titleExt ? titleStem : titleBase;
	const safeStem = sanitizeFilename(stemRaw);
	return ext ? ensureExtension(safeStem, ext) : safeStem;
}

// Agent 执行配置
interface AgentExecutorConfig {
	maxToolCalls?: number;
	timeout?: number;
	autoExecute?: boolean;
}

/**
 * SDK-based Agent Executor
 *
 * Routes ALL models through Claude Agent SDK via local Anthropic proxy.
 * The proxy translates Anthropic API calls to our multi-provider backend.
 */
class AgentExecutor {
	private abortController: AbortController | null = null;
	private sdkService: ClaudeAgentService;

	constructor() {
		this.sdkService = new ClaudeAgentService();
	}

	/**
	 * Execute a custom task using Claude Agent SDK
	 */
	async executeCustomTask(
		query: string,
		systemPrompt?: string,
		_config: AgentExecutorConfig = {},
		options?: {
			conversationContext?: string[];
			fallbackSearchQuery?: string | null;
			activeDocContent?: string | null;
			hasActiveDoc?: boolean;
			attachedContexts?: Array<{ title: string; content: string }>;
			attachedFiles?: Array<{
				title: string;
				path: string;
				type?: "file" | "document";
				mimeType?: string;
				size?: number;
				isBinary?: boolean;
			}>;
			/** Chat window/session ID for log grouping. */
			conversationSessionId?: string;
			workingDirectory?: string;
			/** Reuse the same sandbox dir across turns by providing a stable key */
			sandboxKey?: string;
			/** Resume an existing SDK session to enable SDK context management/compaction */
			resumeSessionId?: string;
			/** Whether to persist SDK sessions to disk (defaults to true in SDK) */
			persistSession?: boolean;
			/** 强制使用的 Agent Skill 名称 */
			forcedSkillName?: string;
			onChunk?: (chunk: string) => void;
		},
	): Promise<{ sdkSessionId?: string; sandboxDir?: string }> {
		// Ensure skills & model stores are initialized
		await skillsStore.init();
		await agentModelSettingsStore.init();

		// Model selection priority:
		// 1) User-selected active model (UI dropdown) - highest priority
		// 2) Smart scenario suggestion (when enabled and user hasn't selected)
		// 3) Agent settings default model
		// 4) Hardcoded fallback
		const userSelectedModel = settingsStore.getActiveModel();
		const smartEnabled =
			agentModelSettingsStore.getSettings().enableSmartScenarioSwitch === true;
		const modelConfig = agentModelSettingsStore.getModelForTask(query);

		// Only use smart scenario override when user hasn't explicitly selected a model
		const shouldUseSmartScenario =
			!userSelectedModel &&
			smartEnabled &&
			!!modelConfig?.modelId &&
			modelConfig.scenario !== "default";

		// Priority: User selection > Smart scenario > Agent default > Hardcoded fallback
		const activeModel =
			userSelectedModel ||
			(shouldUseSmartScenario ? modelConfig?.modelId : null) ||
			modelConfig?.modelId ||
			"claude-sonnet-4-5";

		console.log("[AgentExecutor SDK] Model selection:", {
			userSelectedModel: userSelectedModel || null,
			smartEnabled,
			shouldUseSmartScenario,
			smartScenario: modelConfig?.scenario || null,
			smartModel: modelConfig?.modelId || null,
			finalActiveModel: activeModel,
		});

		const enabledSkills = skillsStore.getEnabledSkills();
		console.log(
			"[AgentExecutor SDK] Enabled skills:",
			enabledSkills.map((s) => s.name),
		);

		// 强制执行指定 skill
		const forcedSkillName = options?.forcedSkillName;
		if (forcedSkillName) {
			console.log("[AgentExecutor SDK] Forced skill:", forcedSkillName);
		}

		// Start task in UI store
		const task = agentStore.startTask("custom", query);

		// Build initial steps for UI
		const analysisStep: AgentTaskStep = {
			id: "analysis-step",
			title: "分析任务",
			status: "running",
			kind: "analysis",
		};
		agentStore.setTaskSteps([analysisStep]);

		this.abortController = new AbortController();
		options = options || {};

		let sandboxDir = options?.workingDirectory;
		if (!sandboxDir) {
			try {
				const sandboxKey =
					typeof options?.sandboxKey === "string" && options.sandboxKey.trim()
						? options.sandboxKey.trim()
						: task.id;
				const res = await getAgentSandboxDir(sandboxKey);
				sandboxDir = res.path;
			} catch { }
		}
		if (sandboxDir) {
			agentStore.setTaskMetadata({ sandboxDir });
		}

		if (sandboxDir && options?.attachedContexts?.length) {
			const seen = new Map<string, number>();
			options.attachedFiles = options.attachedFiles || [];
			for (const ctx of options.attachedContexts) {
				const baseTitle = ctx.title || "document";
				const safeBase = chooseSandboxFileName({
					title: baseTitle,
					sourcePath: baseTitle,
					mimeType: "text/markdown",
				});
				const count = (seen.get(safeBase) ?? 0) + 1;
				seen.set(safeBase, count);
				const dot = safeBase.lastIndexOf(".");
				const stem = dot > 0 ? safeBase.slice(0, dot) : safeBase;
				const ext = dot > 0 ? safeBase.slice(dot) : "";
				const name = count === 1 ? safeBase : `${stem}-${count}${ext}`;
				const dest = `${sandboxDir}/${name}`;
				try {
					await safeInvoke<{ success: boolean }>("write_file_safe", {
						payload: {
							path: dest,
							content: ctx.content,
							encoding: "utf-8",
							create_dirs: true,
						},
					});
					options.attachedFiles.push({
						title: ctx.title,
						path: dest,
						type: "document",
						mimeType: "text/markdown",
						size: ctx.content.length,
						isBinary: false,
					});
				} catch { }
			}
			options.attachedContexts = [];
		}

		if (sandboxDir && options?.attachedFiles?.length) {
			const seen = new Map<string, number>();
			for (const file of options.attachedFiles) {
				const srcPath = String(file.path || "").trim();
				const baseFromPath = getBasename(stripTrailingSlash(srcPath));
				const safeBase = chooseSandboxFileName({
					title: file.title || baseFromPath || "file",
					sourcePath: srcPath,
					mimeType: file.mimeType,
				});
				const count = (seen.get(safeBase) ?? 0) + 1;
				seen.set(safeBase, count);
				const dot = safeBase.lastIndexOf(".");
				const stem = dot > 0 ? safeBase.slice(0, dot) : safeBase;
				const ext = dot > 0 ? safeBase.slice(dot) : "";
				const name = count === 1 ? safeBase : `${stem}-${count}${ext}`;
				const dest = `${sandboxDir}/${name}`;
				if (
					typeof file.path === "string" &&
					file.path.startsWith(`${sandboxDir}/`)
				) {
					continue;
				}
				try {
					try {
						const entries = await safeInvoke<
							Array<{
								path: string;
								name: string;
								is_file: boolean;
								is_dir: boolean;
								size?: number;
							}>
						>("list_files_safe", {
							payload: {
								path: srcPath,
								recursive: true,
							},
						});

						const singleFile =
							entries.length === 1 &&
							entries[0]?.is_file &&
							stripTrailingSlash(String(entries[0]?.path ?? "")) ===
							stripTrailingSlash(srcPath);

						if (singleFile) {
							await safeInvoke<{ success: boolean }>("copy_file_safe", {
								src: srcPath,
								dest,
								create_dirs: true,
							});
							file.path = dest;
							continue;
						}

						const dirRoot = stripTrailingSlash(srcPath);
						const folderName = sanitizeFilename(
							file.title || baseFromPath || "dir",
						);
						for (const e of entries) {
							if (!e.is_file) continue;
							const rel = String(e.path).startsWith(dirRoot)
								? String(e.path)
									.slice(dirRoot.length)
									.replace(/^[/\\]+/, "")
								: getBasename(e.path);
							const finalRel = rel || getBasename(e.path);
							const out = `${sandboxDir}/${folderName}/${finalRel}`;
							try {
								await safeInvoke<{ success: boolean }>("copy_file_safe", {
									src: e.path,
									dest: out,
									create_dirs: true,
								});
							} catch { }
						}
						file.path = `${sandboxDir}/${folderName}`;
						file.type = file.type || "file";
					} catch {
						await safeInvoke<{ success: boolean }>("copy_file_safe", {
							src: srcPath,
							dest,
							create_dirs: true,
						});
						file.path = dest;
					}
				} catch { }
			}
		}

		// Build enhanced system prompt with minimal context (avoid embedding large source text here).
		// IMPORTANT:
		// - Keep "user-configured" systemPrompt content as-is.
		// - Avoid duplicating large runtime context here (conversation/doc/files); prefer placing it in the user prompt.
		let enhancedPrompt = systemPrompt || "";

		const promptMentionsDoc =
			/:::update-doc|:::create-doc|文档输出协议|当前编辑器|文档内容|正在编辑文档/i.test(
				enhancedPrompt,
			);

		// 强制执行指定 skill 的指令
		if (forcedSkillName) {
			enhancedPrompt +=
				`\n\n## 强制技能\n必须使用 Skill 工具：${forcedSkillName}\n不要用其他方式绕过；如需输入（如文件路径），直接使用用户已提供的信息。`;
		}

		// Document protocol guidance for the editor integration (only if not already present in user-configured prompt).
		if (!promptMentionsDoc) {
			const hasActiveDoc = Boolean(options?.hasActiveDoc);
			enhancedPrompt +=
				"\n\n## 文档输出协议\n" +
				(hasActiveDoc
					? "当前编辑器已打开一个文档：如需改写/润色/续写，请用 `:::update-doc ... :::` 输出完整新文档内容。\n"
					: "当前编辑器没有打开任何文档：如需生成新文章，请用 `:::create-doc ... :::` 创建新文档（不要用 update-doc）。\n");

			// Add active document content only when the base prompt doesn't already carry doc context.
			if (options?.activeDocContent) {
				const content = String(options.activeDocContent || "");
				if (content.trim()) {
					enhancedPrompt += "\n\n## 当前编辑器文档\n```\n" + content + "\n```";
				}
			}
		}

		// Internal marker for proxy-side log grouping (does not affect user-visible UI).
		if (
			typeof options?.conversationSessionId === "string" &&
			options.conversationSessionId.trim()
		) {
			enhancedPrompt += `\n\n<ipo-conversation id="${options.conversationSessionId.trim()}" />`;
		}

		let finalResult = "";
		let sdkSessionId: string | undefined;
		let toolStepCounter = 0;
		let lastToolCallId: string | null = null;
		const processedToolResultIds = new Set<string>();
		let shouldRetryWithoutResume = false;
		// 检查点相关：跟踪已完成的工具调用
		const completedToolCalls: string[] = [];

		const isResumeFailure = (text: string) => {
			const t = String(text || "");
			return (
				t.includes("--resume requires a valid session ID") ||
				t.includes("No conversation found with session ID")
			);
		};

		// 构建增强版用户 prompt - 优先在 user prompt 注入运行时上下文（对话历史/附件），避免 system prompt 过长
		let enhancedUserPrompt = query;

		// Add conversation context if available (trimmed; user message scope, not system).
		if (!options?.resumeSessionId && options?.conversationContext?.length) {
			const lines = options.conversationContext
				.map((s) => String(s || "").trim())
				.filter(Boolean);
			// Keep the tail to reduce prompt bloat
			const maxLines = 16;
			const tail = lines.length > maxLines ? lines.slice(-maxLines) : lines;
			// Hard cap to avoid accidental huge injections
			const maxChars = 4000;
			let joined = tail.join("\n");
			if (joined.length > maxChars) joined = joined.slice(-maxChars);
			enhancedUserPrompt =
				`【对话历史（节选）】\n${joined}\n\n` + enhancedUserPrompt;
		}

		if (options?.attachedFiles?.length || options?.attachedContexts?.length) {
			const fileList: string[] = [];
			if (options?.attachedFiles?.length) {
				for (const file of options.attachedFiles) {
					fileList.push(
						`- ${file.title} (文件路径: ${file.path})${file.type ? ` [${file.type}]` : ""
						}`,
					);
				}
			}
			if (options?.attachedContexts?.length) {
				for (const ctx of options.attachedContexts) {
					fileList.push(`- ${ctx.title}`);
				}
			}
			if (fileList.length > 0) {
				enhancedUserPrompt += `\n\n【用户附加的文件/资料】\n${fileList.join("\n")}\n\n注意：这些文件以“路径”形式提供。若需要查看内容，请使用 Read 工具读取文件；若需要上传/处理文件，请将文件路径作为参数传递给对应 Skill 工具。`;
			}
		}

		const runOnce = async (resumeSessionId?: string) => {
			shouldRetryWithoutResume = false;
			await this.sdkService.execute({
				prompt: enhancedUserPrompt,
				systemPrompt: enhancedPrompt || undefined,
				workingDirectory: sandboxDir,
				resumeSessionId,
				persistSession: options?.persistSession,
				model: activeModel,
				skills: enabledSkills.map((s) => s.name),
				abortController: this.abortController ?? undefined,

				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},

				onMessage: async (message: AgentMessage) => {
					// Update UI based on message type
					switch (message.type) {
						case "tool_call": {
							toolStepCounter++;
							const toolCallIdBase =
								typeof message.toolCallId === "string" &&
									message.toolCallId.trim()
									? message.toolCallId.trim()
									: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
							const toolCallId = `sdk-tool-${toolCallIdBase}`;

							const truncate = (s: string, max = 180) => {
								const t = String(s || "").replace(/\s+/g, " ").trim();
								return t.length > max ? `${t.slice(0, max)}…` : t;
							};

							// 构建工具描述，包含参数信息（避免把超长 command/content 直接塞进 UI）
							let description =
								message.content || `Calling ${message.toolName || "Tool"}...`;
							if (message.toolInput && Object.keys(message.toolInput).length > 0) {
								const toolLower = String(message.toolName || "").toLowerCase();
								if (toolLower === "bash") {
									const cmd =
										typeof (message.toolInput as any)?.command === "string"
											? String((message.toolInput as any).command)
											: "";
									const desc =
										typeof (message.toolInput as any)?.description === "string"
											? String((message.toolInput as any).description)
											: "";
									description = desc ? truncate(desc, 160) : truncate(cmd, 160);
								} else {
									const inputDesc = Object.entries(message.toolInput)
										.map(([k, v]) => {
											if (typeof v === "string") return `${k}: ${truncate(v, 120)}`;
											return `${k}: ${truncate(JSON.stringify(v), 120)}`;
										})
										.slice(0, 3) // 最多显示3个参数
										.join(", ");
									description = inputDesc || description;
								}
							}

							// 推断工具类型
							const inferToolType = (
								name: string,
							): import("./types").ToolType => {
								const lower = name?.toLowerCase() || "";
								if (lower === "todowrite") return "custom";
								if (
									lower === "bash" ||
									lower.includes("terminal") ||
									lower.includes("shell")
								)
									return "code_execute";
								if (lower.includes("skill")) return "skill_call";
								if (lower.includes("search")) return "web_search";
								if (lower.includes("read") || lower.includes("view"))
									return "file_read";
								if (lower.includes("write") || lower.includes("edit"))
									return "file_write";
								if (lower.includes("list") || lower.includes("ls"))
									return "file_list";
								return "custom";
							};

							// 创建并添加 ToolCall 到 store，这会触发 tool_started 事件
							const toolCall: import("./types").ToolCall = {
								id: toolCallId,
								type: inferToolType(message.toolName || ""),
								name: message.toolName || "Tool",
								description: description,
								input: message.toolInput || {},
								status: "running",
								startedAt: Date.now(),
							};
							console.log("[AgentExecutor SDK] Adding ToolCall to store:", {
								id: toolCall.id,
								name: toolCall.name,
								type: toolCall.type,
								hasCurrentTask: !!agentStore.getState().currentTask,
							});
							agentStore.addToolCall(toolCall);

							// 同时添加任务步骤到 UI
							const toolStep: AgentTaskStep = {
								id: `tool-step-${toolStepCounter}`,
								title: message.toolName || "Tool",
								description: description,
								status: "running",
								kind: "custom",
							};

							// Get current steps and append
							const currentSteps =
								agentStore.getState().currentTask?.steps || [];
							agentStore.setTaskSteps([...currentSteps, toolStep]);

							// 保存 toolCallId 以便 tool_result 使用
							lastToolCallId = toolCallId;
							break;
						}

						case "tool_result": {
							const resolvedToolCallId =
								typeof message.toolCallId === "string" &&
									message.toolCallId.trim()
									? `sdk-tool-${message.toolCallId.trim()}`
									: lastToolCallId;
							if (resolvedToolCallId) {
								if (processedToolResultIds.has(resolvedToolCallId)) {
									break;
								}
								processedToolResultIds.add(resolvedToolCallId);
							}
							let normalizedToolOutput = message.toolOutput;

							// 子代理/工具若返回 data:image;base64，先落盘到沙盒并改写为 image_paths，避免上下文和 UI 被 base64 污染
							try {
								const dataUrls = collectDataImageUrlsFromUnknown(
									message.toolOutput,
									DATA_IMAGE_URL_LIMIT,
								);
								if (dataUrls.length > 0 && sandboxDir) {
									const savedPaths: string[] = [];
									for (const dataUrl of dataUrls) {
										try {
											const saved = await persistDataImageUrlToSandbox({
												dataUrl,
												sandboxDir,
												prefix: "subagent-image",
											});
											if (saved) savedPaths.push(saved);
										} catch {
											// 单条失败不影响其他图片
										}
									}
									if (savedPaths.length > 0) {
										normalizedToolOutput = mergeImagePathsIntoToolOutput(
											message.toolOutput,
											savedPaths,
										);
									}
								}
							} catch {
								// 静默失败，回退使用原始工具输出
							}

							// 更新工具调用状态（优先使用 SDK 的 tool_use_id）
							if (resolvedToolCallId) {
								agentStore.updateToolCall(resolvedToolCallId, {
									output: normalizedToolOutput,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});
							}

							// 更新最新的工具步骤状态和描述
							const steps = agentStore.getState().currentTask?.steps || [];
							if (steps.length > 0) {
								const lastStep = steps[steps.length - 1];
								if (
									lastStep.status === "running" ||
									lastStep.status === "pending"
								) {
									// 格式化输出内容
									const outputStr =
										typeof normalizedToolOutput === "string"
											? normalizedToolOutput
											: JSON.stringify(normalizedToolOutput, null, 2);

									// 追加结果到描述中（限制长度避免 UI 爆炸）
									const truncatedOutput =
										outputStr.length > 1000
											? outputStr.slice(0, 1000) + "\n...(truncated)"
											: outputStr;

									const newDescription = `${lastStep.description}\n\n**Result:**\n\`\`\`\n${truncatedOutput}\n\`\`\``;

									const updatedSteps = [...steps];
									updatedSteps[updatedSteps.length - 1] = {
										...lastStep,
										description: newDescription,
										status: message.status === "error" ? "error" : "completed",
									};
									agentStore.setTaskSteps(updatedSteps);
								}
							}

							// 从工具输出中提取图片文件路径并创建产物（兼容子代理/自定义工具）
							try {
								const imagePaths = collectImageFilePathsFromToolOutput(
									normalizedToolOutput,
									sandboxDir,
								);
								const existing = new Set(
									(agentStore.getState().currentTask?.artifacts || [])
										.filter((a) => a.type === "image")
										.map((a) => String(a.url || "").trim()),
								);
								if (imagePaths.length > 0) {
									for (const imagePath of imagePaths) {
										const normalized = String(imagePath || "").trim();
										if (!normalized || existing.has(normalized)) continue;
										existing.add(normalized);

										const cleanForName = normalized
											.split("#")[0]
											.split("?")[0];
										const fileName =
											getBasename(cleanForName) ||
											`generated-image-${Date.now()}.png`;

										agentStore.addArtifact({
											id: `artifact-img-${Date.now()}-${Math.random()
												.toString(36)
												.slice(2, 7)}`,
											type: "image",
											title: fileName,
											url: normalized,
											metadata: {
												...(resolvedToolCallId
													? { toolCallId: resolvedToolCallId }
													: {}),
												source: "tool_output",
											},
										});
									}
								}

								// 同步中间栏文件树并自动预览第一张新图
								if (sandboxDir && imagePaths.length > 0) {
									await managedModeStore.scanSandboxDir(sandboxDir);
									const firstPath = String(imagePaths[0] || "").trim();
									if (firstPath) {
										const selectedId = managedModeStore.selectFileByPath(firstPath);
										if (selectedId) {
											managedModeStore.setCenterView("preview");
											managedModeStore.setPreviewMode("preview");
										}
									}
								}
							} catch {
								// 静默失败
							}

							// 检查点：记录已完成的工具调用并保存
							if (resolvedToolCallId && message.status !== "error") {
								completedToolCalls.push(resolvedToolCallId);
								// 异步保存检查点（不阻塞主流程）
								saveCheckpoint({
									task_id: task.id,
									session_id: options?.conversationSessionId || task.id,
									sdk_session_id: sdkSessionId,
									sandbox_dir: sandboxDir,
									last_tool_call_id: resolvedToolCallId,
									tool_calls_completed: completedToolCalls,
									accumulated_result: finalResult,
									metadata: { query, systemPrompt, model: activeModel },
								}).catch((err) => {
									console.warn("[AgentExecutor] Failed to save checkpoint:", err);
								});
							}

							break;
						}

						case "assistant":
							// Text content - already handled by onChunk
							break;

						case "tool_input_update": {
							// 更新工具调用的 input 字段（工具输入流式传输完成）
							const resolvedId =
								typeof message.toolCallId === "string" &&
									message.toolCallId.trim()
									? `sdk-tool-${message.toolCallId.trim()}`
									: null;
							if (resolvedId && message.toolInput) {
								agentStore.updateToolCall(resolvedId, {
									input: message.toolInput,
								});
							}
							break;
						}

						case "result":

							if (message.status === "completed") {
								agentStore.updateTaskStepByKind("analysis", "completed");
							}
							break;

						case "system":
							console.log(
								"[AgentExecutor SDK] System message:",
								message.content,
							);
							break;
					}
				},

				onComplete: async (result) => {
					sdkSessionId = result.sessionId;
					if (sdkSessionId) {
						agentStore.setTaskMetadata({ sdkSessionId });
					}
					if (result.usage) {
						agentStore.setTaskMetadata({ tokenUsage: result.usage });
					}

					// Save SDK session data to database
					if (task?.id && (result.sessionId || result.usage || activeModel)) {
						try {
							const updateData: {
								id: string;
								sdk_session_id?: string;
								model?: string;
								total_prompt_tokens?: number;
								total_completion_tokens?: number;
								total_tokens?: number;
							} = { id: task.id };

							if (result.sessionId) {
								updateData.sdk_session_id = result.sessionId;
							}
							if (activeModel) {
								updateData.model = activeModel;
							}
							if (result.usage) {
								updateData.total_prompt_tokens = result.usage.promptTokens;
								updateData.total_completion_tokens =
									result.usage.completionTokens;
								updateData.total_tokens = result.usage.totalTokens;
							}

							// await safeInvoke('agent_update_session', updateData);
							console.log("[AgentExecutor] Saved session data:", updateData);
						} catch (err) {
							console.error(
								"[AgentExecutor] Failed to save session data:",
								err,
							);
						}
					}

					if (result.success) {
						// Mark analysis step as complete
						agentStore.updateTaskStepByKind("analysis", "completed");
						agentStore.completeTask(
							finalResult || result.summary || "Task completed",
						);
						// 任务成功，删除检查点
						deleteCheckpoint(task.id).catch((err) => {
							console.warn("[AgentExecutor] Failed to delete checkpoint:", err);
						});
					} else {
						if (
							resumeSessionId &&
							isResumeFailure(result.summary || "") &&
							!shouldRetryWithoutResume
						) {
							shouldRetryWithoutResume = true;
							return;
						}
						// 任务失败，保存检查点以便断点续传
						saveCheckpoint({
							task_id: task.id,
							session_id: options?.conversationSessionId || task.id,
							sdk_session_id: sdkSessionId,
							sandbox_dir: sandboxDir,
							last_tool_call_id: lastToolCallId || undefined,
							tool_calls_completed: completedToolCalls,
							accumulated_result: finalResult,
							metadata: {
								query,
								systemPrompt,
								model: activeModel,
								error: result.summary,
							},
						}).catch((err) => {
							console.warn("[AgentExecutor] Failed to save checkpoint on failure:", err);
						});
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		};

		try {
			await runOnce(options?.resumeSessionId);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			if (options?.resumeSessionId && shouldRetryWithoutResume) {
				try {
					finalResult = "";
					toolStepCounter = 0;
					lastToolCallId = null;
					await runOnce(undefined);
					return { sdkSessionId, sandboxDir };
				} catch (e) {
					const second = e instanceof Error ? e.message : "执行失败";
					console.error("[AgentExecutor SDK] Error:", second);
					agentStore.failTask(second);
					return { sdkSessionId, sandboxDir };
				}
			}
			console.error("[AgentExecutor SDK] Error:", errorMessage);
			agentStore.failTask(errorMessage);
			return { sdkSessionId, sandboxDir };
		} finally {
			this.abortController = null;
		}

		return { sdkSessionId, sandboxDir };
	}

	/**
	 * Execute a research task
	 */
	async executeResearchTask(
		query: string,
		config: AgentExecutorConfig = {},
	): Promise<{ sdkSessionId?: string; sandboxDir?: string }> {
		// Research task is just a custom task with research-focused prompt
		const researchPrompt = `你是一个研究助手。请对以下主题进行深入研究：

${query}

请使用 WebSearch 工具搜索相关信息，然后综合整理成一份全面的研究报告。`;

		return this.executeCustomTask(query, researchPrompt, config);
	}

	/**
	 * Abort current execution (alias for cancel)
	 */
	abort(): void {
		this.cancel();
	}

	/**
	 * Cancel current execution
	 */
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		agentStore.cancelTask();
	}

	/**
	 * Check if currently executing
	 */
	isExecuting(): boolean {
		return this.abortController !== null;
	}
}

// Export singleton instance
export const agentExecutor = new AgentExecutor();
