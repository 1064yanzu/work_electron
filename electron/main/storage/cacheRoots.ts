/**
 * 缓存根目录解析器
 *
 * 单一事实源：所有"可清理的 userData 缓存"都从这里取根目录与子目录。
 *
 * 设计参考 `electron/main/db/paths.ts` 的 override 文件模式：
 *   - 优先读 `<userData>/cache_root_override.json` 里的 `cache_root` 字段
 *   - 校验绝对路径 + 目录可写后采纳
 *   - 否则静默回落到 `app.getPath("userData")`
 *
 * 模块内做了内存缓存；通过 IPC 修改根目录后会调用 `invalidateCacheRoot()` 刷新。
 *
 * 注意：已经在运行的服务（例如 Agent 沙盒、preview server）可能已经持有旧目录的
 * 句柄或者已经把路径缓存到自身状态。修改根目录后通常应建议用户重启应用，
 * 以保证所有 producer 都切换到新位置。
 */
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const OVERRIDE_FILE = "cache_root_override.json";

export type CacheScopeKey =
	| "reader-library"
	| "agent-sandboxes"
	| "cache"
	| "media"
	| "remote-control/dedupe"
	| "generated-images";

interface OverrideShape {
	cache_root?: unknown;
}

let cachedRoot: string | null = null;

function overrideFilePath(): string {
	return path.join(app.getPath("userData"), OVERRIDE_FILE);
}

function readOverride(): string | null {
	const filePath = overrideFilePath();
	try {
		if (!fs.existsSync(filePath)) return null;
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as OverrideShape;
		if (typeof parsed.cache_root !== "string") return null;
		const root = parsed.cache_root.trim();
		if (!root || !path.isAbsolute(root)) return null;
		try {
			const st = fs.statSync(root);
			if (!st.isDirectory()) return null;
		} catch {
			return null;
		}
		try {
			fs.accessSync(root, fs.constants.W_OK);
		} catch {
			return null;
		}
		return root;
	} catch {
		return null;
	}
}

/** 默认根目录：始终是 userData，不受 override 影响。 */
export function getDefaultCacheRoot(): string {
	return app.getPath("userData");
}

/** 当前生效的根目录（含 override）。 */
export function getCacheRoot(): string {
	if (cachedRoot) return cachedRoot;
	const override = readOverride();
	cachedRoot = override ?? getDefaultCacheRoot();
	return cachedRoot;
}

/** 某个 scope 当前生效的目录（不会自动 mkdir，使用方按需建）。 */
export function getCacheDir(scope: CacheScopeKey): string {
	return path.join(getCacheRoot(), scope);
}

/** 模块缓存失效，强制下次重新读 override 文件。 */
export function invalidateCacheRoot(): void {
	cachedRoot = null;
}

/** 是否处于"已被用户改过"的状态。 */
export function isCacheRootOverridden(): boolean {
	return readOverride() !== null;
}

/**
 * 写入新的根目录到 override 文件。
 * 调用方负责：
 *   1. 在此调用前校验路径可写
 *   2. 在此调用前做完迁移（复制 → 验证 → 删旧）
 *   3. 在此调用后 `invalidateCacheRoot()`
 */
export function writeCacheRootOverride(newRoot: string): void {
	const filePath = overrideFilePath();
	const payload: OverrideShape = { cache_root: newRoot };
	fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

/** 清除 override 文件，回到默认 userData。 */
export function clearCacheRootOverride(): void {
	const filePath = overrideFilePath();
	try {
		fs.unlinkSync(filePath);
	} catch {
		// 不存在视为成功
	}
}
