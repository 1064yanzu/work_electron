/**
 * mediaTemplateRegistry.ts
 *
 * 媒体生成的可复用提示词模板。两类来源：
 *   1) 内置：vendor/open-design/prompt-templates/{image,video}/*.json （由 open-design 同步而来）
 *   2) 用户：{userData}/design/media-templates/{image,video,audio}/*.json （用户导入或保存）
 *
 * 与 templateRegistry（开放设计 HTML 骨架）解耦。
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { getDesignLibraryRoot } from "./resourcePaths";

export type MediaTemplateKind = "image" | "video" | "audio";
export type MediaTemplateSource = "builtin" | "user";

export interface DesignMediaTemplateSummary {
	id: string;
	source: MediaTemplateSource;
	kind: MediaTemplateKind;
	title: string;
	summary: string;
	category?: string;
	tags: string[];
	model?: string;
	aspect?: string;
	duration_sec?: number;
	/** 用于卡片封面：可能是 http(s) URL 或 file:// URL（用户保存的本地图） */
	preview_image_url?: string;
	/** 视频模板可能携带预览视频 */
	preview_video_url?: string;
	created_at?: number;
	updated_at?: number;
}

export interface DesignMediaTemplateDetail extends DesignMediaTemplateSummary {
	prompt: string;
	source_path: string;
	source_meta?: Record<string, unknown>;
}

interface RawTemplate {
	id?: string;
	surface?: string;
	title?: string;
	summary?: string;
	category?: string;
	tags?: unknown;
	model?: string;
	aspect?: string;
	duration_sec?: number;
	prompt?: string;
	previewImageUrl?: string;
	preview_image_url?: string;
	previewVideoUrl?: string;
	preview_video_url?: string;
	source?: Record<string, unknown>;
	created_at?: number;
	updated_at?: number;
	kind?: string;
}

// ─── 路径 ─────────────────────────────────────────────────────────────────────

function getBuiltinPromptTemplatesRoot(): string {
	return path.join(
		getDesignLibraryRoot(),
		"vendor",
		"open-design",
		"prompt-templates",
	);
}

export function getUserMediaTemplatesRoot(): string {
	// 开发与生产都放到 userData 下，开发环境的 userData 通常在
	// ~/Library/Application Support/<app name>，足够稳定。
	return path.join(app.getPath("userData"), "design", "media-templates");
}

async function ensureDir(p: string): Promise<void> {
	await fs.mkdir(p, { recursive: true });
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function normalizeKind(value: string | undefined): MediaTemplateKind | null {
	if (!value) return null;
	const v = value.toLowerCase();
	if (v === "image" || v === "img" || v === "picture") return "image";
	if (v === "video" || v === "movie" || v === "clip") return "video";
	if (v === "audio" || v === "music" || v === "sound") return "audio";
	return null;
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((v) => (typeof v === "string" ? v.trim() : ""))
		.filter((v): v is string => v.length > 0);
}

function safeFileId(id: string): string {
	// 文件名只允许 [\w\-.]，并裁掉前后空格
	return id.replace(/[^\w\-.]/g, "").slice(0, 120) || randomUUID();
}

function toSummary(
	raw: RawTemplate,
	source: MediaTemplateSource,
	kind: MediaTemplateKind,
	filePath: string,
): DesignMediaTemplateSummary {
	const previewImage = raw.preview_image_url || raw.previewImageUrl;
	const previewVideo = raw.preview_video_url || raw.previewVideoUrl;

	// 内置库可能在同目录有 <id>.preview.png 这种本地预览图
	let resolvedPreview = previewImage;
	if (source === "builtin" && raw.id) {
		const localPreviewPng = path.join(
			path.dirname(filePath),
			`${raw.id}.preview.png`,
		);
		const localPreviewJpg = path.join(
			path.dirname(filePath),
			`${raw.id}.preview.jpg`,
		);
		if (!resolvedPreview) {
			if (fsSync.existsSync(localPreviewPng)) {
				resolvedPreview = `file://${localPreviewPng}`;
			} else if (fsSync.existsSync(localPreviewJpg)) {
				resolvedPreview = `file://${localPreviewJpg}`;
			}
		}
	}

	return {
		id: String(raw.id ?? path.basename(filePath, ".json")),
		source,
		kind,
		title: raw.title?.trim() || raw.id || "未命名模板",
		summary: raw.summary?.trim() || "",
		category: raw.category?.trim() || undefined,
		tags: asStringArray(raw.tags),
		model: raw.model?.trim() || undefined,
		aspect: raw.aspect?.trim() || undefined,
		duration_sec:
			typeof raw.duration_sec === "number" && Number.isFinite(raw.duration_sec)
				? raw.duration_sec
				: undefined,
		preview_image_url: resolvedPreview,
		preview_video_url: previewVideo,
		created_at: typeof raw.created_at === "number" ? raw.created_at : undefined,
		updated_at: typeof raw.updated_at === "number" ? raw.updated_at : undefined,
	};
}

async function readJson(filePath: string): Promise<RawTemplate | null> {
	try {
		const raw = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(raw);
		return data && typeof data === "object" ? (data as RawTemplate) : null;
	} catch {
		return null;
	}
}

async function scanDir(
	dir: string,
	source: MediaTemplateSource,
	kind: MediaTemplateKind,
): Promise<{ summary: DesignMediaTemplateSummary; filePath: string }[]> {
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const result: { summary: DesignMediaTemplateSummary; filePath: string }[] =
		[];
	for (const ent of entries) {
		if (!ent.isFile()) continue;
		if (!ent.name.endsWith(".json")) continue;
		if (ent.name.endsWith(".preview.json")) continue;
		const filePath = path.join(dir, ent.name);
		const raw = await readJson(filePath);
		if (!raw) continue;
		// 排除非媒体类型（surface=html 之类）
		const detectedKind =
			normalizeKind(raw.surface) ?? normalizeKind(raw.kind) ?? kind;
		if (detectedKind !== kind) continue;
		result.push({
			summary: toSummary(raw, source, detectedKind, filePath),
			filePath,
		});
	}
	return result;
}

// ─── 对外 API ─────────────────────────────────────────────────────────────────

export interface ListMediaTemplatesInput {
	kind?: MediaTemplateKind;
	source?: MediaTemplateSource;
	query?: string;
}

export async function listMediaTemplateSummaries(
	input?: ListMediaTemplatesInput,
): Promise<DesignMediaTemplateSummary[]> {
	const builtinRoot = getBuiltinPromptTemplatesRoot();
	const userRoot = getUserMediaTemplatesRoot();

	const kinds: MediaTemplateKind[] =
		input?.kind &&
		(["image", "video", "audio"] as MediaTemplateKind[]).includes(input.kind)
			? [input.kind]
			: ["image", "video", "audio"];

	const collected: DesignMediaTemplateSummary[] = [];

	for (const k of kinds) {
		if (!input?.source || input.source === "builtin") {
			const list = await scanDir(path.join(builtinRoot, k), "builtin", k);
			for (const it of list) collected.push(it.summary);
		}
		if (!input?.source || input.source === "user") {
			const list = await scanDir(path.join(userRoot, k), "user", k);
			for (const it of list) collected.push(it.summary);
		}
	}

	let result = collected;
	if (input?.query && input.query.trim()) {
		const q = input.query.trim().toLowerCase();
		result = result.filter(
			(t) =>
				t.title.toLowerCase().includes(q) ||
				t.summary.toLowerCase().includes(q) ||
				(t.category && t.category.toLowerCase().includes(q)) ||
				t.tags.some((tag) => tag.toLowerCase().includes(q)),
		);
	}

	// 用户模板优先（最近修改在前），其余按 title 排
	result.sort((a, b) => {
		if (a.source !== b.source) return a.source === "user" ? -1 : 1;
		const aTs = a.updated_at ?? 0;
		const bTs = b.updated_at ?? 0;
		if (aTs !== bTs) return bTs - aTs;
		return a.title.localeCompare(b.title, "zh");
	});

	return result;
}

export async function getMediaTemplate(
	id: string,
	source?: MediaTemplateSource,
): Promise<DesignMediaTemplateDetail | null> {
	const candidates: Array<{ root: string; source: MediaTemplateSource }> = [];
	if (!source || source === "user") {
		candidates.push({ root: getUserMediaTemplatesRoot(), source: "user" });
	}
	if (!source || source === "builtin") {
		candidates.push({
			root: getBuiltinPromptTemplatesRoot(),
			source: "builtin",
		});
	}

	const safeId = safeFileId(id);

	for (const cand of candidates) {
		for (const kind of ["image", "video", "audio"] as MediaTemplateKind[]) {
			const filePath = path.join(cand.root, kind, `${safeId}.json`);
			const raw = await readJson(filePath);
			if (!raw) continue;
			const summary = toSummary(raw, cand.source, kind, filePath);
			return {
				...summary,
				prompt: typeof raw.prompt === "string" ? raw.prompt : "",
				source_path: filePath,
				source_meta:
					raw.source && typeof raw.source === "object"
						? (raw.source as Record<string, unknown>)
						: undefined,
			};
		}
	}
	return null;
}

export interface SaveMediaTemplateInput {
	id?: string;
	kind: MediaTemplateKind;
	title: string;
	summary?: string;
	category?: string;
	tags?: string[];
	model?: string;
	aspect?: string;
	duration_sec?: number;
	prompt: string;
	preview_image_url?: string;
	preview_video_url?: string;
	source_meta?: Record<string, unknown>;
}

export async function saveMediaTemplate(
	input: SaveMediaTemplateInput,
): Promise<DesignMediaTemplateDetail> {
	const id = safeFileId(
		input.id || `${input.kind}-${randomUUID().slice(0, 8)}`,
	);
	const now = Date.now();

	const dir = path.join(getUserMediaTemplatesRoot(), input.kind);
	await ensureDir(dir);

	const filePath = path.join(dir, `${id}.json`);

	// 若已存在则保留 created_at
	let createdAt = now;
	try {
		const existing = await readJson(filePath);
		if (existing?.created_at && typeof existing.created_at === "number") {
			createdAt = existing.created_at;
		}
	} catch {
		// 新建
	}

	const payload: RawTemplate = {
		id,
		surface: input.kind,
		kind: input.kind,
		title: input.title.trim(),
		summary: input.summary?.trim() || "",
		category: input.category?.trim() || undefined,
		tags: Array.isArray(input.tags) ? input.tags : [],
		model: input.model?.trim() || undefined,
		aspect: input.aspect?.trim() || undefined,
		duration_sec:
			typeof input.duration_sec === "number" ? input.duration_sec : undefined,
		prompt: input.prompt,
		preview_image_url: input.preview_image_url || undefined,
		preview_video_url: input.preview_video_url || undefined,
		source: input.source_meta,
		created_at: createdAt,
		updated_at: now,
	};

	await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

	return {
		...toSummary(payload, "user", input.kind, filePath),
		prompt: payload.prompt ?? "",
		source_path: filePath,
		source_meta: payload.source,
	};
}

export async function importMediaTemplateFromFile(
	filePath: string,
): Promise<DesignMediaTemplateDetail> {
	const raw = await readJson(filePath);
	if (!raw) throw new Error("无法解析模板 JSON 文件");

	const detectedKind = normalizeKind(raw.surface) ?? normalizeKind(raw.kind);
	if (!detectedKind) {
		throw new Error(
			"模板缺少有效的 surface/kind 字段（应为 image / video / audio）",
		);
	}
	if (typeof raw.prompt !== "string" || raw.prompt.trim().length === 0) {
		throw new Error("模板缺少 prompt 字段");
	}

	return saveMediaTemplate({
		id: typeof raw.id === "string" ? raw.id : undefined,
		kind: detectedKind,
		title: raw.title?.trim() || path.basename(filePath, ".json"),
		summary: raw.summary,
		category: raw.category,
		tags: asStringArray(raw.tags),
		model: raw.model,
		aspect: raw.aspect,
		duration_sec: raw.duration_sec,
		prompt: raw.prompt,
		preview_image_url: raw.preview_image_url || raw.previewImageUrl,
		preview_video_url: raw.preview_video_url || raw.previewVideoUrl,
		source_meta: raw.source,
	});
}

export async function deleteUserMediaTemplate(
	id: string,
	kind: MediaTemplateKind,
): Promise<boolean> {
	const safeId = safeFileId(id);
	const filePath = path.join(
		getUserMediaTemplatesRoot(),
		kind,
		`${safeId}.json`,
	);
	try {
		await fs.unlink(filePath);
		return true;
	} catch {
		return false;
	}
}
