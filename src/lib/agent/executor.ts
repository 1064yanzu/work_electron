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
import { agentModelSettingsStore } from "../models/agentModelSettingsStore";
import { saveCheckpoint, deleteCheckpoint } from "./api";
import { buildRuntimeUserPrompt } from "./context/userPrompt";
import { managedModeStore } from "../managedModeStore";
import { EVENTS, events } from "../events";
import { generateErrorRecoveryStrategy } from "./errorRecoveryStrategies";
import { isHtmlPreviewPath } from "../frontendPreview";
import { extractToolErrorMessageFromUnknown } from "./runtimeText";
import { previewServerStore } from "../previewServerStore";

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

const DATA_IMAGE_URL_RE =
	/data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const DATA_IMAGE_URL_LIMIT = 1;

function extensionFromDataImageMime(raw: string): string {
	const mime = String(raw || "")
		.toLowerCase()
		.trim();
	if (!mime) return "png";
	if (mime === "jpeg") return "jpg";
	if (mime === "svg+xml") return "svg";
	return mime.replace(/[^a-z0-9]+/g, "") || "png";
}

function collectDataImageUrlsFromString(
	raw: string,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
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

function collectDataImageUrlsFromUnknown(
	value: unknown,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const found = new Set<string>();
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number) => {
		if (v === null || v === undefined) return;
		if (depth > 8 || found.size >= limit) return;
		if (typeof v === "string") {
			for (const item of collectDataImageUrlsFromString(
				v,
				limit - found.size,
			)) {
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

function normalizePathKey(value: string): string {
	return String(value || "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.toLowerCase();
}

function simpleFingerprint(text: string): string {
	let hash = 2166136261;
	const raw = String(text || "");
	for (let i = 0; i < raw.length; i++) {
		hash ^= raw.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return `${hash >>> 0}`;
}

function isContextTooLongError(text: string): boolean {
	const t = String(text || "").toLowerCase();
	return (
		t.includes("context_length_exceeded") ||
		t.includes("context too long") ||
		t.includes("max tokens") ||
		t.includes("token limit")
	);
}

function trimConversationContextLines(
	lines: string[],
	maxLines: number,
	maxCharsPerLine: number,
): string[] {
	const trimmed = lines
		.map((line) => String(line || "").trim())
		.filter(Boolean)
		.map((line) =>
			line.length > maxCharsPerLine
				? `${line.slice(0, maxCharsPerLine)}...`
				: line,
		);
	if (trimmed.length <= maxLines) return trimmed;
	return trimmed.slice(-maxLines);
}

function mergeImagePathsIntoToolOutput(
	toolOutput: unknown,
	imagePaths: string[],
): unknown {
	const paths = uniqStrings(imagePaths);
	if (paths.length === 0) return toolOutput;
	if (
		toolOutput &&
		typeof toolOutput === "object" &&
		!Array.isArray(toolOutput)
	) {
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
	let value = stripWrapping(raw)
		.replace(/^file:\/\//i, "")
		.trim();
	try {
		value = decodeURIComponent(value);
	} catch {}
	if (!value) return null;
	if (value.startsWith("data:image/")) return null;
	if (value.startsWith("http://") || value.startsWith("https://")) return null;
	if (/[<>|;&]/.test(value)) return null;
	if (!hasImageFileExtension(value)) return null;
	if (isLikelyShellImageCommand(value)) return null;

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

function isLikelyShellImageCommand(value: string): boolean {
	const normalized = String(value || "").trim();
	if (!normalized) return false;
	if (
		/^(ffmpeg|magick|convert|python|python3|node|bash|sh|zsh)\s/i.test(
			normalized,
		)
	) {
		return true;
	}
	if (
		/\s-(i|ss|vf|filter|frames?|frames:v|loop|t|to|itsoffset)\b/i.test(
			normalized,
		)
	) {
		return true;
	}
	if (
		/\.(mp4|mov|mkv|avi|webm|wav|mp3)\b/i.test(normalized) &&
		/\.(png|jpg|jpeg|gif|webp|svg)\b/i.test(normalized) &&
		/\s/.test(normalized)
	) {
		return true;
	}
	return false;
}

function extractImagePathsFromString(
	raw: string,
	sandboxDir?: string,
): string[] {
	const value = String(raw || "");
	if (!value.trim()) return [];

	const found = new Set<string>();

	const addCandidate = (candidate: string) => {
		const normalized = normalizeImageFilePathCandidate(candidate, sandboxDir);
		if (normalized) found.add(normalized);
	};

	// Markdown image syntax: ![alt](<path/to/file with spaces.png>)
	for (const match of value.matchAll(/!\[[^\]]*]\((?:<)?([^)\n>]+)(?:>)?\)/g)) {
		const candidate = match?.[1];
		if (candidate) addCandidate(candidate);
	}

	// Quoted absolute/relative paths (supports spaces)
	for (const match of value.matchAll(
		/["'`]([^"'`\n]+\.[A-Za-z0-9]{2,6})["'`]/g,
	)) {
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
			activeDocPath?: string | null;
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
			/** Project root / wiki scope path (actual user folder, may differ from sandbox workingDirectory) */
			wikiScopePath?: string;
			/** Reuse the same sandbox dir across turns by providing a stable key */
			sandboxKey?: string;
			/** Resume an existing SDK session to enable SDK context management/compaction */
			resumeSessionId?: string;
			/** Whether to persist SDK sessions to disk (defaults to true in SDK) */
			persistSession?: boolean;
			forkSession?: boolean;
			resumeSessionAt?: string;
			maxTurns?: number;
			thinkingLevel?: import("../models/agentModelConfig").ThinkingLevel;
			maxBudgetUsd?: number;
			settingSources?: Array<"user" | "project" | "local">;
			betas?: string[];
			contextPolicy?: "balanced" | "strict" | "aggressive";
			subagentContextMode?: "capsule" | "inherit";
			documentContextInjected?: boolean;
			contextBudget?: {
				maxContextChars: number;
				maxFiles: number;
				maxFileChars: number;
			};
			enableToolSearch?: "auto" | "auto:5" | "true" | "false";
			parentSdkSessionId?: string;
			/** 是否启用规划模式 */
			planMode?: boolean;
			/** 已确认的计划（用于执行阶段） */
			confirmedPlan?: import("./planModeStore").PlanData;
			onChunk?: (chunk: string) => void;
			onMessage?: (message: AgentMessage) => void;
			onThoughtChunk?: (
				chunk: string,
				meta?: {
					title?: string;
					source?: string;
					phase?: string;
					durationMs?: number;
				},
			) => void;
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

		const runtimeConfig = agentModelSettingsStore.getSettings().contextRuntime;
		const resolvedContextPolicy =
			options.contextPolicy ||
			runtimeConfig?.contextPolicy ||
			("balanced" as const);
		const resolvedSubagentContextMode =
			options.subagentContextMode ||
			runtimeConfig?.subagentContextMode ||
			("capsule" as const);
		const resolvedContextBudget = {
			maxContextChars:
				options.contextBudget?.maxContextChars ||
				runtimeConfig?.contextBudget?.maxContextChars ||
				16000,
			maxFiles:
				options.contextBudget?.maxFiles ||
				runtimeConfig?.contextBudget?.maxFiles ||
				12,
			maxFileChars:
				options.contextBudget?.maxFileChars ||
				runtimeConfig?.contextBudget?.maxFileChars ||
				6000,
		};
		const resolvedSettingSources = options.settingSources?.length
			? options.settingSources
			: runtimeConfig?.settingSources?.length
				? runtimeConfig.settingSources
				: (["user", "project"] as Array<"user" | "project" | "local">);
		const resolvedMaxTurns = options.maxTurns ?? runtimeConfig?.maxTurns ?? 100;
		const resolvedThinkingLevel =
			options.thinkingLevel ?? runtimeConfig?.thinkingLevel;
		const resolvedMaxBudgetUsd =
			options.maxBudgetUsd ?? runtimeConfig?.maxBudgetUsd;
		const resolvedBetas =
			options.betas && options.betas.length > 0
				? options.betas
				: runtimeConfig?.betas || [];
		const resolvedEnableToolSearch =
			options.enableToolSearch ||
			runtimeConfig?.enableToolSearch ||
			("auto:5" as const);
		const conversationContextBeforeChars = String(
			(options.conversationContext || []).join("\n"),
		).length;
		const attachedFilesBefore = options.attachedFiles?.length || 0;
		const attachedContextsBefore = options.attachedContexts?.length || 0;
		agentStore.setTaskMetadata({
			contextPolicy: resolvedContextPolicy,
			subagentContextMode: resolvedSubagentContextMode,
			contextCharsBefore: conversationContextBeforeChars,
			attachedFilesBefore: attachedFilesBefore + attachedContextsBefore,
			degradeLevel: 0,
			compactionCount: 0,
			agentRole: "leader",
			parentSessionId: options.parentSdkSessionId,
		});

		// Agent 工作目录：必须由 caller 传入用户选定的真实目录（session.cwd）。
		// 不再 fallback 到 userData/agent-sandboxes/{taskId} 隔离沙盒——和
		// Claude Code CLI 一致：直接在用户目录里干活，产物落在用户目录。
		// 没传就用进程 cwd 兜底，避免 SDK 因 cwd 缺失炸掉。
		const sandboxDir =
			options?.workingDirectory && options.workingDirectory.trim()
				? options.workingDirectory.trim()
				: undefined;
		if (sandboxDir) {
			agentStore.setTaskMetadata({ sandboxDir });
		}

		let dedupeHitCount = 0;
		if (options?.attachedFiles?.length) {
			const pathSeen = new Set<string>();
			const dedupedFiles: NonNullable<typeof options.attachedFiles> = [];
			for (const file of options.attachedFiles) {
				const pathKey = normalizePathKey(file.path);
				if (pathKey && pathSeen.has(pathKey)) {
					dedupeHitCount++;
					continue;
				}
				if (pathKey) pathSeen.add(pathKey);
				dedupedFiles.push(file);
			}
			options.attachedFiles = dedupedFiles;
		}
		if (options?.attachedContexts?.length) {
			const ctxSeen = new Set<string>();
			const dedupedContexts: NonNullable<typeof options.attachedContexts> = [];
			for (const ctx of options.attachedContexts) {
				const content = String(ctx.content || "");
				const fingerprint = `${ctx.title}::${simpleFingerprint(content)}`;
				if (ctxSeen.has(fingerprint)) {
					dedupeHitCount++;
					continue;
				}
				ctxSeen.add(fingerprint);
				dedupedContexts.push({
					...ctx,
					content:
						content.length > resolvedContextBudget.maxFileChars
							? `${content.slice(0, resolvedContextBudget.maxFileChars)}\n...(已按上下文预算截断)`
							: content,
				});
			}
			options.attachedContexts = dedupedContexts;
		}
		const allowedFiles = Math.max(1, resolvedContextBudget.maxFiles);
		if ((options?.attachedFiles?.length || 0) > allowedFiles) {
			dedupeHitCount += (options?.attachedFiles?.length || 0) - allowedFiles;
			options.attachedFiles = (options?.attachedFiles || []).slice(
				0,
				allowedFiles,
			);
		}
		const remainForContexts = Math.max(
			0,
			allowedFiles - (options?.attachedFiles?.length || 0),
		);
		if ((options?.attachedContexts?.length || 0) > remainForContexts) {
			dedupeHitCount +=
				(options?.attachedContexts?.length || 0) - remainForContexts;
			options.attachedContexts = (options?.attachedContexts || []).slice(
				0,
				remainForContexts,
			);
		}

		// attachedContexts 是用户在 UI 里贴的临时文本（无原路径），写到 cwd/.agent-attachments/
		// 让 agent 能 Read。其余真实 attachedFiles 直接传原路径，**不再拷贝到沙盒**——
		// 与 Claude Code CLI 一致，让 agent 在用户真实目录里直接操作原文件。
		if (sandboxDir && options?.attachedContexts?.length) {
			const attachmentsDir = `${stripTrailingSlash(sandboxDir)}/.agent-attachments`;
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
				const dest = `${attachmentsDir}/${name}`;
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
				} catch {}
			}
			options.attachedContexts = [];
		}

		// attachedFiles：用户从 UI 里选的真实文件，直接保留原路径不拷贝。

		let degradeLevel = 0;
		const getConversationContextForRun = () => {
			const source = options?.conversationContext || [];
			if (degradeLevel <= 0) return source;
			if (degradeLevel === 1)
				return trimConversationContextLines(source, 8, 220);
			return trimConversationContextLines(source, 4, 160);
		};
		const getAttachedForRun = () => {
			const files = [...(options?.attachedFiles || [])];
			const contexts = [...(options?.attachedContexts || [])];
			if (degradeLevel < 3) return { files, contexts };
			const maxFilesOnDegrade = Math.max(
				1,
				Math.floor(resolvedContextBudget.maxFiles / 2),
			);
			return {
				files: files.slice(0, maxFilesOnDegrade),
				contexts: contexts.slice(
					0,
					Math.max(0, maxFilesOnDegrade - files.length),
				),
			};
		};
		const buildEnhancedPromptForRun = () => {
			return systemPrompt || "";
		};

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

		const runOnce = async (resumeSessionId?: string) => {
			shouldRetryWithoutResume = false;
			const conversationContextForRun = getConversationContextForRun();
			const attachedForRun = getAttachedForRun();
			const enhancedPrompt = buildEnhancedPromptForRun();
			const userPromptForRun = buildRuntimeUserPrompt({
				query,
				resumeSessionId,
				conversationContext: conversationContextForRun,
				attachedFiles: attachedForRun.files,
				attachedContexts: attachedForRun.contexts,
				contextBudget: {
					// 历史代码硬截断到 6000 字符（≈1500 token），导致多轮对话上下文被砍光、
					// 模型每次"冷启动"。直接用用户配置的 maxContextChars（默认 16000）。
					// degradeLevel ≥1 时仍会通过 maxContextLines 自动降级，无需在这里再叠加上限。
					maxContextChars: resolvedContextBudget.maxContextChars,
					maxContextLines: degradeLevel >= 2 ? 4 : degradeLevel >= 1 ? 8 : 16,
					maxFiles:
						attachedForRun.files.length + attachedForRun.contexts.length,
				},
			});
			agentStore.setTaskMetadata({
				contextCharsAfter: userPromptForRun.length,
				attachedFilesAfter:
					attachedForRun.files.length + attachedForRun.contexts.length,
				dedupeHitCount,
				degradeLevel,
			});
			await this.sdkService.execute({
				prompt: userPromptForRun,
				systemPrompt: enhancedPrompt || undefined,
				workingDirectory: sandboxDir,
				wikiScopePath: options?.wikiScopePath,
				resumeSessionId,
				persistSession: options?.persistSession,
				forkSession: options?.forkSession,
				resumeSessionAt: options?.resumeSessionAt,
				model: activeModel,
				skills: enabledSkills.map((s) => s.name),
				maxTurns: resolvedMaxTurns,
				thinkingLevel: resolvedThinkingLevel,
				maxBudgetUsd: resolvedMaxBudgetUsd,
				settingSources: resolvedSettingSources,
				betas: resolvedBetas,
				contextPolicy: resolvedContextPolicy,
				subagentContextMode: resolvedSubagentContextMode,
				contextBudget: {
					max_context_chars: resolvedContextBudget.maxContextChars,
					max_files: resolvedContextBudget.maxFiles,
					max_file_chars: resolvedContextBudget.maxFileChars,
				},
				enableToolSearch: resolvedEnableToolSearch,
				planMode: options?.planMode,
				confirmedPlan: options?.confirmedPlan,
				abortController: this.abortController ?? undefined,

				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},

				onMessage: async (message: AgentMessage) => {
					options?.onMessage?.(message);
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
								const t = String(s || "")
									.replace(/\s+/g, " ")
									.trim();
								return t.length > max ? `${t.slice(0, max)}…` : t;
							};

							// 构建工具描述，包含参数信息（避免把超长 command/content 直接塞进 UI）
							let description =
								message.content || `Calling ${message.toolName || "Tool"}...`;
							if (
								message.toolInput &&
								Object.keys(message.toolInput).length > 0
							) {
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
											if (typeof v === "string")
												return `${k}: ${truncate(v, 120)}`;
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

							const toolErrorMessage =
								message.status === "error"
									? extractToolErrorMessageFromUnknown(normalizedToolOutput) ||
										"工具调用失败"
									: undefined;
							const displayToolOutput =
								message.status === "error" && toolErrorMessage
									? toolErrorMessage
									: normalizedToolOutput;

							// 更新工具调用状态（优先使用 SDK 的 tool_use_id）
							if (resolvedToolCallId) {
								agentStore.updateToolCall(resolvedToolCallId, {
									output: displayToolOutput,
									error: toolErrorMessage,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});

								if (toolErrorMessage) {
									const currentToolCall =
										agentStore
											.getState()
											.currentTask?.toolCalls.find(
												(tc) => tc.id === resolvedToolCallId,
											) || null;
									if (currentToolCall) {
										agentStore.setPendingErrorRecovery(
											resolvedToolCallId,
											generateErrorRecoveryStrategy(
												toolErrorMessage,
												currentToolCall.type,
												currentToolCall.name,
												currentToolCall.retryCount || 0,
											),
										);
									}
								}
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
										typeof displayToolOutput === "string"
											? displayToolOutput
											: JSON.stringify(displayToolOutput, null, 2);

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

										const cleanForName = normalized.split("#")[0].split("?")[0];
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

								// 同步中间栏文件树；自动预览交由 SandboxWorkspace 统一仲裁
								if (sandboxDir && imagePaths.length > 0) {
									await managedModeStore.scanSandboxDir(sandboxDir);
									const firstPath = String(imagePaths[0] || "").trim();
									if (firstPath) {
										events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
											toolCallId: resolvedToolCallId,
											artifactUrl: firstPath,
											autoPreview: true,
										});
									}
								}

								// 对非图片类文件写入（Write/Edit 工具）也触发沙箱刷新和自动预览
								if (sandboxDir && imagePaths.length === 0) {
									const currentArtifacts =
										agentStore.getState().currentTask?.artifacts || [];
									const latestArtifact = currentArtifacts.find(
										(a) =>
											a?.metadata?.toolCallId === resolvedToolCallId &&
											(a.type === "file" || a.type === "code"),
									);
									if (latestArtifact?.url) {
										await managedModeStore.scanSandboxDir(sandboxDir);
										if (isHtmlPreviewPath(latestArtifact.url)) {
											events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
												toolCallId: resolvedToolCallId,
												artifactUrl: latestArtifact.url,
												autoPreview: true,
											});
										}

										// 自动启动预览服务器（如果检测到 package.json 或多文件项目）
										const fileName = latestArtifact.url.split("/").pop() || "";
										const isPackageJson = fileName === "package.json";
										const isHtmlFile = isHtmlPreviewPath(latestArtifact.url);
										const isCssOrJs = /\.(css|js|jsx|ts|tsx)$/.test(fileName);

										if (isPackageJson || isHtmlFile || isCssOrJs) {
											const taskId = task.id;
											const serverState =
												previewServerStore.getState().servers[taskId];
											if (!serverState?.running) {
												previewServerStore.start(taskId, sandboxDir);
											}
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
									console.warn(
										"[AgentExecutor] Failed to save checkpoint:",
										err,
									);
								});
							}

							break;
						}

						case "assistant":
							// Text content - already handled by onChunk
							break;

						case "thought_delta":
							options?.onThoughtChunk?.(message.content, message.thoughtMeta);
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

						case "tool_progress": {
							const resolvedId =
								typeof message.toolCallId === "string" &&
								message.toolCallId.trim()
									? `sdk-tool-${message.toolCallId.trim()}`
									: null;
							const progressMessage =
								typeof message.message === "string" && message.message.trim()
									? message.message
									: typeof message.content === "string" &&
											message.content.trim()
										? message.content
										: "";
							if (resolvedId && progressMessage) {
								agentStore.updateToolProgress(
									resolvedId,
									progressMessage,
									message.progress,
								);
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
							if (message.metadata && typeof message.metadata === "object") {
								agentStore.setTaskMetadata(message.metadata);
							}
							if (
								/压缩上下文|compacting|compact/i.test(
									String(message.content || ""),
								)
							) {
								const currentCount = Number(
									(agentStore.getState().currentTask?.metadata as any)
										?.compactionCount || 0,
								);
								agentStore.setTaskMetadata({
									compactionCount: currentCount + 1,
								});
							}
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
							console.warn(
								"[AgentExecutor] Failed to save checkpoint on failure:",
								err,
							);
						});
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		};

		try {
			await runOnce(options?.resumeSessionId);
		} catch (error) {
			let errorMessage = error instanceof Error ? error.message : "执行失败";
			if (isContextTooLongError(errorMessage) && degradeLevel < 3) {
				while (degradeLevel < 3) {
					degradeLevel += 1;
					agentStore.setTaskMetadata({ degradeLevel });
					console.warn(
						`[AgentExecutor SDK] Context too long, retry with degrade level=${degradeLevel}`,
					);
					try {
						finalResult = "";
						toolStepCounter = 0;
						lastToolCallId = null;
						await runOnce(options?.resumeSessionId);
						return { sdkSessionId, sandboxDir };
					} catch (retryError) {
						errorMessage =
							retryError instanceof Error ? retryError.message : "执行失败";
						if (!isContextTooLongError(errorMessage)) break;
					}
				}
			}
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
	 * 检查是否有存活的 run 可以接收 followup 消息。
	 * 如果有，caller 应该用 executeFollowup 代替 executeCustomTask。
	 */
	get canFollowup(): boolean {
		return this.sdkService.alive && !!this.sdkService.activeRunId;
	}

	/**
	 * 向存活的 run 发送 followup 消息。
	 * 不再拼 conversationContext——进程内存中已有完整历史，直接发送本轮 query。
	 */
	async executeFollowup(
		query: string,
		options?: {
			attachedContexts?: Array<{ title: string; content: string }>;
			attachedFiles?: Array<{
				title: string;
				path: string;
				type?: "file" | "document";
				mimeType?: string;
				size?: number;
				isBinary?: boolean;
			}>;
			workingDirectory?: string;
			onChunk?: (chunk: string) => void;
			onMessage?: (message: AgentMessage) => void;
			onThoughtChunk?: (
				chunk: string,
				meta?: {
					title?: string;
					source?: string;
					phase?: string;
					durationMs?: number;
				},
			) => void;
		},
	): Promise<{ sdkSessionId?: string }> {
		agentStore.startTask("custom", query);
		const analysisStep: AgentTaskStep = {
			id: "analysis-step",
			title: "分析任务",
			status: "running",
			kind: "analysis",
		};
		agentStore.setTaskSteps([analysisStep]);

		this.abortController = new AbortController();
		let finalResult = "";
		let sdkSessionId: string | undefined;

		try {
			await this.sdkService.sendFollowup({
				message: query,
				abortController: this.abortController,
				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},
				onMessage: async (message: AgentMessage) => {
					options?.onMessage?.(message);
					// 复用 executeCustomTask 中的消息处理逻辑
					switch (message.type) {
						case "tool_call": {
							const toolCallId = `sdk-tool-${message.toolCallId || Date.now()}`;
							const toolCall: import("./types").ToolCall = {
								id: toolCallId,
								type: "custom",
								name: message.toolName || "Tool",
								description: message.content || "",
								input: message.toolInput || {},
								status: "running",
								startedAt: Date.now(),
							};
							agentStore.addToolCall(toolCall);
							break;
						}
						case "tool_result": {
							const resolvedId = message.toolCallId
								? `sdk-tool-${message.toolCallId}`
								: null;
							if (resolvedId) {
								agentStore.updateToolCall(resolvedId, {
									output: message.toolOutput,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});
							}
							break;
						}
						case "thought_delta":
							options?.onThoughtChunk?.(message.content, message.thoughtMeta);
							break;
						case "result":
							if (message.status === "completed") {
								agentStore.updateTaskStepByKind("analysis", "completed");
							}
							break;
					}
				},
				onComplete: (result) => {
					if (result.sessionId) {
						sdkSessionId = result.sessionId;
					}
					if (result.success) {
						agentStore.updateTaskStepByKind("analysis", "completed");
						agentStore.completeTask(
							finalResult || result.summary || "Task completed",
						);
					} else {
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Followup failed";
			console.error("[AgentExecutor] Followup error:", errorMessage);
			agentStore.failTask(errorMessage);
		} finally {
			this.abortController = null;
		}

		return { sdkSessionId };
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
	cancel(options?: { updateStore?: boolean }): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		if (options?.updateStore !== false) {
			agentStore.cancelTask();
		}
	}

	async setRuntimePermissionMode(mode: string): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "set_permission_mode",
			mode,
		});
		return result.success;
	}

	async setRuntimeModel(model: string): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "set_model",
			model,
		});
		return result.success;
	}

	async interruptRuntime(): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "interrupt",
		});
		return result.success;
	}

	async getRuntimeMcpStatus(): Promise<unknown[] | null> {
		const result = await this.sdkService.control({
			action: "mcp_status",
		});
		if (!result.success || !Array.isArray(result.data)) return null;
		return result.data as unknown[];
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
