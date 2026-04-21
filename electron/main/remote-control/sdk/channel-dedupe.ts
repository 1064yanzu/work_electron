/**
 * 持久化消息去重 —— 进程重启后仍然生效
 *
 * 设计借鉴 openclaw `extensions/feishu/src/dedup.ts` + `dedup-runtime-api.ts`，
 * 但把 openclaw 的 state-dir / plugin-sdk 依赖换成 Electron 原生 `app.getPath("userData")`。
 *
 * 存储：
 * - 内存 LRU（快速命中）+ 磁盘 JSON（跨进程持久化）
 * - 按 namespace（通常是 channel id）分文件，避免写放大
 * - TTL 24h，定期清理
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

// ─── 配置 ──────────────────────────────────────────────

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
const DEFAULT_MEMORY_MAX_SIZE = 1_000;
const DEFAULT_FILE_MAX_ENTRIES = 10_000;
const SAVE_DEBOUNCE_MS = 2_000;

// ─── 内存 LRU ─────────────────────────────────────────

type MemoryEntry = { seenAt: number };

class LruTtlMap {
	private readonly map = new Map<string, MemoryEntry>();

	constructor(
		private readonly maxSize: number,
		private readonly ttlMs: number,
	) {}

	has(key: string): boolean {
		const entry = this.map.get(key);
		if (!entry) return false;
		if (Date.now() - entry.seenAt > this.ttlMs) {
			this.map.delete(key);
			return false;
		}
		// LRU: 刷新到末尾
		this.map.delete(key);
		this.map.set(key, entry);
		return true;
	}

	set(key: string): void {
		if (this.map.has(key)) {
			this.map.delete(key);
		}
		this.map.set(key, { seenAt: Date.now() });
		if (this.map.size > this.maxSize) {
			const first = this.map.keys().next().value;
			if (typeof first === "string") this.map.delete(first);
		}
	}

	delete(key: string): void {
		this.map.delete(key);
	}

	size(): number {
		return this.map.size;
	}

	sweep(): void {
		const now = Date.now();
		for (const [key, entry] of this.map) {
			if (now - entry.seenAt > this.ttlMs) this.map.delete(key);
		}
	}
}

// ─── 磁盘存储 ─────────────────────────────────────────

type DiskRecord = {
	version: 1;
	ttlMs: number;
	entries: Record<string, number>; // key -> seenAt (ms epoch)
};

class PersistentNamespace {
	private readonly memory: LruTtlMap;
	private readonly filePath: string;
	private diskLoaded = false;
	private dirty = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		namespace: string,
		private readonly options: {
			ttlMs: number;
			memoryMaxSize: number;
			fileMaxEntries: number;
			dir: string;
			onError?: (error: unknown) => void;
		},
	) {
		this.memory = new LruTtlMap(options.memoryMaxSize, options.ttlMs);
		const safe = namespace.replace(/[^a-zA-Z0-9_-]/g, "_");
		this.filePath = path.join(options.dir, `${safe}.json`);
	}

	private scheduleSave(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveNow();
		}, SAVE_DEBOUNCE_MS);
	}

	private async ensureLoaded(): Promise<void> {
		if (this.diskLoaded) return;
		this.diskLoaded = true;
		try {
			await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
			const text = await fsp.readFile(this.filePath, "utf8");
			const parsed = JSON.parse(text) as DiskRecord | null;
			if (!parsed || parsed.version !== 1 || !parsed.entries) return;
			const now = Date.now();
			for (const [key, seenAt] of Object.entries(parsed.entries)) {
				if (typeof seenAt !== "number") continue;
				if (now - seenAt > this.options.ttlMs) continue;
				this.memory.set(key);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			this.options.onError?.(error);
		}
	}

	async saveNow(): Promise<void> {
		if (!this.dirty) return;
		this.dirty = false;
		try {
			await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
			// 从内存重建磁盘记录
			const entries: Record<string, number> = {};
			let count = 0;
			// 只保留最新的 fileMaxEntries 条
			const limit = this.options.fileMaxEntries;
			// 这里 Map 遍历顺序是插入顺序，后面是新数据
			// 所以我们先拿到数组，再从末尾取
			// 但 memory 本身也只有 memoryMaxSize 条，通常够了
			for (const key of this.allMemoryKeys()) {
				entries[key] = Date.now();
				count += 1;
				if (count >= limit) break;
			}
			const record: DiskRecord = {
				version: 1,
				ttlMs: this.options.ttlMs,
				entries,
			};
			const tmpPath = `${this.filePath}.tmp`;
			await fsp.writeFile(tmpPath, JSON.stringify(record), "utf8");
			await fsp.rename(tmpPath, this.filePath);
		} catch (error) {
			this.options.onError?.(error);
		}
	}

	private allMemoryKeys(): string[] {
		// 借用内部 map 的 keys()；这里直接读取是为了 saveNow
		return Array.from(
			(this.memory as unknown as { map: Map<string, MemoryEntry> }).map.keys(),
		);
	}

	async check(key: string): Promise<boolean> {
		await this.ensureLoaded();
		return this.memory.has(key);
	}

	async record(key: string): Promise<boolean> {
		await this.ensureLoaded();
		if (this.memory.has(key)) return false;
		this.memory.set(key);
		this.dirty = true;
		this.scheduleSave();
		return true;
	}

	/** 原子操作：check + record */
	async checkAndRecord(key: string): Promise<boolean> {
		await this.ensureLoaded();
		if (this.memory.has(key)) return false;
		this.memory.set(key);
		this.dirty = true;
		this.scheduleSave();
		return true;
	}

	delete(key: string): void {
		this.memory.delete(key);
		this.dirty = true;
		this.scheduleSave();
	}

	async flush(): Promise<void> {
		await this.saveNow();
	}
}

// ─── 全局注册表 ───────────────────────────────────────

const namespaces = new Map<string, PersistentNamespace>();
let defaultDir: string | null = null;

function resolveDefaultDir(): string {
	if (defaultDir) return defaultDir;
	try {
		defaultDir = path.join(app.getPath("userData"), "remote-control", "dedupe");
	} catch {
		// 非 Electron 环境（测试）fallback
		defaultDir = path.join(
			process.env.HOME || process.env.USERPROFILE || ".",
			".work_electron",
			"remote-control",
			"dedupe",
		);
	}
	// 确保目录存在
	try {
		fs.mkdirSync(defaultDir, { recursive: true });
	} catch {
		// ignore
	}
	return defaultDir;
}

function getNamespace(namespace: string): PersistentNamespace {
	let ns = namespaces.get(namespace);
	if (!ns) {
		ns = new PersistentNamespace(namespace, {
			ttlMs: DEFAULT_TTL_MS,
			memoryMaxSize: DEFAULT_MEMORY_MAX_SIZE,
			fileMaxEntries: DEFAULT_FILE_MAX_ENTRIES,
			dir: resolveDefaultDir(),
		});
		namespaces.set(namespace, ns);
	}
	return ns;
}

// ─── 公共 API ─────────────────────────────────────────

export type ChannelDedupe = {
	/** 检查 key 是否最近出现过（不记录） */
	has(key: string): Promise<boolean>;
	/** 原子：如果没出现过，记下；返回是否「新」（true = 首次） */
	checkAndRecord(key: string): Promise<boolean>;
	/** 记录（幂等） */
	record(key: string): Promise<void>;
	/** 删除（例如手动重置） */
	forget(key: string): void;
	/** 落盘（stop 时调用） */
	flush(): Promise<void>;
};

/**
 * 拿一个 dedupe 句柄（按 namespace 隔离）。
 * 推荐用 channel id + 用途做 namespace，例如 `feishu:inbound`、`slack:outbound`。
 */
export function getChannelDedupe(namespace: string): ChannelDedupe {
	const ns = getNamespace(namespace);
	return {
		has: (key) => ns.check(key),
		checkAndRecord: (key) => ns.checkAndRecord(key),
		record: async (key) => {
			await ns.record(key);
		},
		forget: (key) => ns.delete(key),
		flush: () => ns.flush(),
	};
}

/**
 * 应用退出前调用，确保所有 namespace 都已经落盘。
 */
export async function flushAllChannelDedupe(): Promise<void> {
	await Promise.all(
		Array.from(namespaces.values()).map((ns) => ns.flush().catch(() => {})),
	);
}
