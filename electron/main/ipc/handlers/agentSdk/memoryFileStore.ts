/**
 * Markdown 文件式 Agent 长期记忆——底座
 *
 * 三个文件位于 <userData>/agent-memory/：
 *   - SOUL.md   ：Agent 人格、语调、风格（仅用户编辑）
 *   - USER.md   ：用户偏好、习惯、禁用项（Agent + 用户）
 *   - MEMORY.md ：环境事实、约定、教训（Agent + 用户）
 *
 * 写入策略：tmp + rename 原子写；每个文件一个 mutex 串行化读写，避免
 * 并发条目操作互踩。
 */
import { promises as fsp } from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { DbContext } from "../../../db/client";

export type MemoryFileName = "soul" | "user" | "memory";

export interface MemoryFileMeta {
	name: MemoryFileName;
	displayName: string;
	limit: number;
	allowsEntries: boolean; // 是否使用 § 条目分隔
	writableByAgent: boolean;
}

export const MEMORY_FILES: Record<MemoryFileName, MemoryFileMeta> = {
	soul: {
		name: "soul",
		displayName: "SOUL.md",
		limit: 3000,
		allowsEntries: false,
		writableByAgent: false,
	},
	user: {
		name: "user",
		displayName: "USER.md",
		limit: 1500,
		allowsEntries: true,
		writableByAgent: true,
	},
	memory: {
		name: "memory",
		displayName: "MEMORY.md",
		limit: 2400,
		allowsEntries: true,
		writableByAgent: true,
	},
};

export const ENTRY_SEPARATOR = "§";

export interface MemoryFileSnapshot {
	name: MemoryFileName;
	displayName: string;
	path: string;
	content: string;
	charCount: number;
	limit: number;
	lastModified: number;
	exists: boolean;
}

let cachedDir: string | null = null;

export function getMemoryDir(): string {
	if (cachedDir) return cachedDir;
	const userData = app.getPath("userData");
	cachedDir = path.join(userData, "agent-memory");
	return cachedDir;
}

export function getMemoryFilePath(name: MemoryFileName): string {
	const meta = MEMORY_FILES[name];
	return path.join(getMemoryDir(), meta.displayName);
}

// ==================
// Mutex（每个文件一把）
// ==================
const mutexes: Map<MemoryFileName, Promise<void>> = new Map();

async function withFileLock<T>(
	name: MemoryFileName,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = mutexes.get(name) ?? Promise.resolve();
	let release!: () => void;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	mutexes.set(
		name,
		previous.then(() => next),
	);
	await previous;
	try {
		return await fn();
	} finally {
		release();
		// 清理：当当前锁链结束时移除引用
		if (mutexes.get(name) === previous.then(() => next)) {
			mutexes.delete(name);
		}
	}
}

// ==================
// 基础读写
// ==================

async function readFileRaw(name: MemoryFileName): Promise<{
	content: string;
	lastModified: number;
	exists: boolean;
}> {
	const filePath = getMemoryFilePath(name);
	try {
		const [content, stat] = await Promise.all([
			fsp.readFile(filePath, "utf8"),
			fsp.stat(filePath),
		]);
		return { content, lastModified: stat.mtimeMs, exists: true };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return { content: "", lastModified: 0, exists: false };
		}
		throw err;
	}
}

async function writeFileAtomic(
	name: MemoryFileName,
	content: string,
): Promise<void> {
	const filePath = getMemoryFilePath(name);
	const dir = path.dirname(filePath);
	await fsp.mkdir(dir, { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await fsp.writeFile(tmpPath, content, "utf8");
	await fsp.rename(tmpPath, filePath);
}

export async function readFile(
	name: MemoryFileName,
): Promise<MemoryFileSnapshot> {
	return withFileLock(name, async () => {
		const meta = MEMORY_FILES[name];
		const raw = await readFileRaw(name);
		return {
			name,
			displayName: meta.displayName,
			path: getMemoryFilePath(name),
			content: raw.content,
			charCount: raw.content.length,
			limit: meta.limit,
			lastModified: raw.lastModified,
			exists: raw.exists,
		};
	});
}

export class MemoryQuotaError extends Error {
	constructor(
		public readonly target: MemoryFileName,
		public readonly attempted: number,
		public readonly limit: number,
		public readonly currentContent: string,
	) {
		super(
			`Memory quota exceeded for ${target}: attempted ${attempted} > limit ${limit}`,
		);
		this.name = "MemoryQuotaError";
	}
}

export class MemoryEntryNotFoundError extends Error {
	constructor(
		public readonly target: MemoryFileName,
		public readonly searchText: string,
		public readonly currentContent: string,
	) {
		super(`Memory entry not found in ${target}`);
		this.name = "MemoryEntryNotFoundError";
	}
}

export class MemoryEntryAmbiguousError extends Error {
	constructor(
		public readonly target: MemoryFileName,
		public readonly searchText: string,
		public readonly matchCount: number,
		public readonly currentContent: string,
	) {
		super(
			`Memory search text matches ${matchCount} entries in ${target}; provide more context`,
		);
		this.name = "MemoryEntryAmbiguousError";
	}
}

export async function writeFile(
	name: MemoryFileName,
	content: string,
): Promise<MemoryFileSnapshot> {
	const meta = MEMORY_FILES[name];
	const normalized = content.replace(/\r\n/g, "\n").trimEnd();
	const finalContent = normalized ? `${normalized}\n` : "";
	if (finalContent.length > meta.limit) {
		throw new MemoryQuotaError(
			name,
			finalContent.length,
			meta.limit,
			(await readFileRaw(name)).content,
		);
	}
	return withFileLock(name, async () => {
		await writeFileAtomic(name, finalContent);
		const stat = await fsp.stat(getMemoryFilePath(name)).catch(() => null);
		return {
			name,
			displayName: meta.displayName,
			path: getMemoryFilePath(name),
			content: finalContent,
			charCount: finalContent.length,
			limit: meta.limit,
			lastModified: stat?.mtimeMs ?? Date.now(),
			exists: true,
		};
	});
}

// ==================
// 条目级操作（user / memory）
// ==================

function parseEntries(content: string): string[] {
	if (!content.trim()) return [];
	// 按行首的 § 分割
	const parts = content.split(/(?:^|\n)§\s*/g);
	const cleaned = parts.map((p) => p.trim()).filter((p) => p.length > 0);
	return cleaned;
}

function formatEntries(entries: string[]): string {
	if (entries.length === 0) return "";
	return entries.map((e) => `§ ${e.trim()}`).join("\n\n");
}

async function ensureEntryTarget(name: MemoryFileName): Promise<void> {
	const meta = MEMORY_FILES[name];
	if (!meta.allowsEntries) {
		throw new Error(`Memory file ${name} does not support entries`);
	}
}

export async function addEntry(
	name: MemoryFileName,
	entry: string,
): Promise<MemoryFileSnapshot> {
	await ensureEntryTarget(name);
	const meta = MEMORY_FILES[name];
	const trimmed = entry.trim();
	if (!trimmed) {
		throw new Error("entry is empty");
	}
	return withFileLock(name, async () => {
		const raw = await readFileRaw(name);
		const entries = parseEntries(raw.content);
		entries.push(trimmed);
		const next = formatEntries(entries);
		const finalContent = next ? `${next}\n` : "";
		if (finalContent.length > meta.limit) {
			throw new MemoryQuotaError(
				name,
				finalContent.length,
				meta.limit,
				raw.content,
			);
		}
		await writeFileAtomic(name, finalContent);
		const stat = await fsp.stat(getMemoryFilePath(name)).catch(() => null);
		return {
			name,
			displayName: meta.displayName,
			path: getMemoryFilePath(name),
			content: finalContent,
			charCount: finalContent.length,
			limit: meta.limit,
			lastModified: stat?.mtimeMs ?? Date.now(),
			exists: true,
		};
	});
}

function findMatchIndexes(entries: string[], needle: string): number[] {
	const indexes: number[] = [];
	const needleNorm = needle.trim();
	if (!needleNorm) return indexes;
	for (let i = 0; i < entries.length; i++) {
		if (entries[i].includes(needleNorm)) {
			indexes.push(i);
		}
	}
	return indexes;
}

export async function replaceEntry(
	name: MemoryFileName,
	oldText: string,
	newText: string,
): Promise<MemoryFileSnapshot> {
	await ensureEntryTarget(name);
	const meta = MEMORY_FILES[name];
	const newTrim = newText.trim();
	if (!newTrim) {
		throw new Error("newText is empty");
	}
	return withFileLock(name, async () => {
		const raw = await readFileRaw(name);
		const entries = parseEntries(raw.content);
		const indexes = findMatchIndexes(entries, oldText);
		if (indexes.length === 0) {
			throw new MemoryEntryNotFoundError(name, oldText, raw.content);
		}
		if (indexes.length > 1) {
			throw new MemoryEntryAmbiguousError(
				name,
				oldText,
				indexes.length,
				raw.content,
			);
		}
		entries[indexes[0]] = newTrim;
		const next = formatEntries(entries);
		const finalContent = next ? `${next}\n` : "";
		if (finalContent.length > meta.limit) {
			throw new MemoryQuotaError(
				name,
				finalContent.length,
				meta.limit,
				raw.content,
			);
		}
		await writeFileAtomic(name, finalContent);
		const stat = await fsp.stat(getMemoryFilePath(name)).catch(() => null);
		return {
			name,
			displayName: meta.displayName,
			path: getMemoryFilePath(name),
			content: finalContent,
			charCount: finalContent.length,
			limit: meta.limit,
			lastModified: stat?.mtimeMs ?? Date.now(),
			exists: true,
		};
	});
}

export async function removeEntry(
	name: MemoryFileName,
	oldText: string,
): Promise<MemoryFileSnapshot> {
	await ensureEntryTarget(name);
	const meta = MEMORY_FILES[name];
	return withFileLock(name, async () => {
		const raw = await readFileRaw(name);
		const entries = parseEntries(raw.content);
		const indexes = findMatchIndexes(entries, oldText);
		if (indexes.length === 0) {
			throw new MemoryEntryNotFoundError(name, oldText, raw.content);
		}
		if (indexes.length > 1) {
			throw new MemoryEntryAmbiguousError(
				name,
				oldText,
				indexes.length,
				raw.content,
			);
		}
		entries.splice(indexes[0], 1);
		const next = formatEntries(entries);
		const finalContent = next ? `${next}\n` : "";
		await writeFileAtomic(name, finalContent);
		const stat = await fsp.stat(getMemoryFilePath(name)).catch(() => null);
		return {
			name,
			displayName: meta.displayName,
			path: getMemoryFilePath(name),
			content: finalContent,
			charCount: finalContent.length,
			limit: meta.limit,
			lastModified: stat?.mtimeMs ?? Date.now(),
			exists: true,
		};
	});
}

// ==================
// 高层 API
// ==================

export async function getMemoryStats(): Promise<{
	soul: { chars: number; limit: number };
	user: { chars: number; limit: number; entries: number };
	memory: { chars: number; limit: number; entries: number };
}> {
	const [soul, user, memory] = await Promise.all([
		readFile("soul"),
		readFile("user"),
		readFile("memory"),
	]);
	return {
		soul: { chars: soul.charCount, limit: soul.limit },
		user: {
			chars: user.charCount,
			limit: user.limit,
			entries: parseEntries(user.content).length,
		},
		memory: {
			chars: memory.charCount,
			limit: memory.limit,
			entries: parseEntries(memory.content).length,
		},
	};
}

export async function getMemoryPreview(): Promise<string> {
	const { renderMemoryPromptSection } = await import("./memorySnapshot");
	const [soul, user, memory] = await Promise.all([
		readFile("soul"),
		readFile("user"),
		readFile("memory"),
	]);
	return renderMemoryPromptSection({
		runId: "(preview)",
		frozenAt: Date.now(),
		soul: soul.content,
		user: user.content,
		memory: memory.content,
	});
}

export function listEntries(content: string): string[] {
	return parseEntries(content);
}

// ==================
// 启动钩子：首启创建空三件套 + drop 旧表
// ==================

const CLEANED_MARKER = ".cleaned_v1";

const SOUL_STARTER = "";
const USER_STARTER = "";
const MEMORY_STARTER = "";

export async function ensureMemoryFiles(db?: DbContext): Promise<void> {
	const dir = getMemoryDir();
	await fsp.mkdir(dir, { recursive: true });

	// 首启创建空文件
	await Promise.all([
		ensureEmptyFile("soul", SOUL_STARTER),
		ensureEmptyFile("user", USER_STARTER),
		ensureEmptyFile("memory", MEMORY_STARTER),
	]);

	// 一次性清理旧 agent_memories 表
	const markerPath = path.join(dir, CLEANED_MARKER);
	let markerExists = false;
	try {
		await fsp.access(markerPath);
		markerExists = true;
	} catch {
		markerExists = false;
	}
	if (!markerExists && db) {
		try {
			await db.client.execute({
				sql: "DROP TABLE IF EXISTS agent_memories",
				args: [],
			});
			await fsp.writeFile(
				markerPath,
				`cleaned at ${new Date().toISOString()}\n`,
				"utf8",
			);
		} catch (err) {
			// 失败不阻塞启动；下次启动会重试
			console.warn(
				"[memoryFileStore] Failed to drop legacy agent_memories table:",
				err,
			);
		}
	}
}

async function ensureEmptyFile(
	name: MemoryFileName,
	starter: string,
): Promise<void> {
	const filePath = getMemoryFilePath(name);
	try {
		await fsp.access(filePath);
		return; // 已存在
	} catch {
		// 不存在则创建
	}
	const content = starter
		? starter.endsWith("\n")
			? starter
			: `${starter}\n`
		: "";
	await fsp.writeFile(filePath, content, "utf8");
}
