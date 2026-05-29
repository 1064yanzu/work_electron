/**
 * 缓存根目录 IPC Handlers
 *
 * 让用户把"可清理缓存"（阅读器图书、Agent 沙盒、通用缓存、媒体、远控去重、
 * 生成图片）整体迁移到自定义位置（换盘 / NAS / 外置硬盘）。
 *
 * 设计与 storage（Vault）handler 对齐：
 *   - pick 复用 dialog.showOpenDialog
 *   - update 校验路径 → 可选迁移 → 写 override 文件 → 失效内存缓存
 *
 * 路径解析的单一事实源在 `electron/main/storage/cacheRoots.ts`。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { dialog } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	type CacheScopeKey,
	clearCacheRootOverride,
	getCacheRoot,
	getDefaultCacheRoot,
	invalidateCacheRoot,
	isCacheRootOverridden,
	writeCacheRootOverride,
} from "../../storage/cacheRoots";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// 需要迁移的全部缓存子目录（与 CacheScopeKey 保持一致）
const MIGRATE_SCOPES: CacheScopeKey[] = [
	"reader-library",
	"agent-sandboxes",
	"cache",
	"media",
	"remote-control/dedupe",
	"generated-images",
];

async function pathExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

async function ensureWritableDir(target: string): Promise<void> {
	await fs.mkdir(target, { recursive: true });
	const stat = await fs.stat(target);
	if (!stat.isDirectory()) {
		throw new Error("所选路径不是目录");
	}
	// 探针：尝试写一个临时文件确认可写
	const probe = path.join(target, `.cache-root-probe-${process.pid}`);
	await fs.writeFile(probe, "ok", "utf-8");
	await fs.rm(probe, { force: true });
}

// 递归统计目录字节数与文件数（用于迁移报告）
async function measureDir(
	dir: string,
): Promise<{ bytes: number; files: number }> {
	let bytes = 0;
	let files = 0;
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(dir, entry.name as string);
			if (entry.isDirectory()) {
				const sub = await measureDir(full);
				bytes += sub.bytes;
				files += sub.files;
			} else if (entry.isFile()) {
				try {
					const st = await fs.stat(full);
					bytes += st.size;
					files += 1;
				} catch {
					// 无法读取的条目忽略统计
				}
			}
		}
	} catch {
		return { bytes: 0, files: 0 };
	}
	return { bytes, files };
}

// 判断 child 是否等于或位于 parent 之内，避免把缓存迁进自身造成无限复制
function isSameOrInside(child: string, parent: string): boolean {
	const c = path.resolve(child);
	const p = path.resolve(parent);
	if (c === p) return true;
	const rel = path.relative(p, c);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function createCacheRootHandlers() {
	const cache_root_get: Handler<"cache_root_get"> = async () => {
		const current = getCacheRoot();
		const defaultRoot = getDefaultCacheRoot();
		return {
			current,
			isDefault: !isCacheRootOverridden(),
			defaultRoot,
		};
	};

	const cache_root_pick: Handler<"cache_root_pick"> = async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			title: "选择缓存目录",
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}
		return { path: result.filePaths[0] };
	};

	const cache_root_update: Handler<"cache_root_update"> = async (
		_event,
		input,
	) => {
		const rawRoot = (input?.newRoot ?? "").trim();
		if (!rawRoot || !path.isAbsolute(rawRoot)) {
			throw new Error("缓存目录必须是绝对路径");
		}
		const newRoot = path.resolve(rawRoot);
		const oldRoot = getCacheRoot();
		const defaultRoot = getDefaultCacheRoot();

		// 校验新目录可写
		await ensureWritableDir(newRoot);

		// 新根落在旧根内部（或反之）会导致复制循环，直接拒绝
		if (newRoot !== oldRoot && isSameOrInside(newRoot, oldRoot)) {
			throw new Error("新缓存目录不能位于当前缓存目录内部");
		}

		let migration:
			| {
					copied: number;
					bytes: number;
					skipped: number;
					errors: Array<{ path: string; error: string }>;
			  }
			| undefined;

		const samePlace = newRoot === path.resolve(oldRoot);
		if (input.migrate && !samePlace) {
			let copied = 0;
			let bytes = 0;
			let skipped = 0;
			const errors: Array<{ path: string; error: string }> = [];

			for (const scope of MIGRATE_SCOPES) {
				const src = path.join(oldRoot, scope);
				const dest = path.join(newRoot, scope);
				if (!(await pathExists(src))) {
					skipped += 1;
					continue;
				}
				try {
					const measured = await measureDir(src);
					await fs.mkdir(path.dirname(dest), { recursive: true });
					await fs.cp(src, dest, { recursive: true, force: true });
					copied += measured.files;
					bytes += measured.bytes;
				} catch (err) {
					errors.push({
						path: src,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			// 复制成功的 scope 删除旧目录（有错误的 scope 保留旧数据兜底）
			if (errors.length === 0) {
				for (const scope of MIGRATE_SCOPES) {
					const src = path.join(oldRoot, scope);
					try {
						await fs.rm(src, { recursive: true, force: true });
					} catch {
						// 删除失败不阻断（旧数据残留可由用户手动清理）
					}
				}
			}

			migration = { copied, bytes, skipped, errors };
		}

		// 写 override（新根 == 默认 userData 则视为恢复默认）
		if (newRoot === path.resolve(defaultRoot)) {
			clearCacheRootOverride();
		} else {
			writeCacheRootOverride(newRoot);
		}
		invalidateCacheRoot();

		return {
			current: getCacheRoot(),
			isDefault: !isCacheRootOverridden(),
			migration,
		};
	};

	return {
		cache_root_get,
		cache_root_pick,
		cache_root_update,
	};
}
