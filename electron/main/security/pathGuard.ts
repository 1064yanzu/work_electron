/**
 * `*_safe` 文件系统 handler 的路径守卫。
 *
 * ## 为什么不是白名单根目录
 *
 * Agent 的核心价值就是在用户指定的任意工作区里干活，把可写范围锁进某个固定根
 * 会直接废掉这个能力。所以这里走**黑名单 + 破坏性操作的额外约束**：
 * 挡住"绝不该被自动化触碰"的少数几类路径，其余照旧放行。
 *
 * ## 三条规则
 *
 * 1. **凭证目录**（`~/.ssh`、`~/.aws`、`~/.gnupg`、钥匙串……）读写删全禁。
 *    这些目录被读走等于账号丢失，而且没有任何正当的自动化理由要碰它们。
 * 2. **应用自身的数据库文件**（`db.sqlite` 及 `-wal` / `-shm`）禁止写和删。
 *    读放行（有诊断价值），但绕过 libSQL 直接写文件必然损坏数据。
 * 3. **删除的深度约束**：禁止删根目录、home 目录本身、`/Volumes/<卷>` 这类挂载点
 *    根，以及任何离文件系统根不足两级的路径。`rm -rf /` 类事故基本都栽在这里。
 *
 * ## 符号链接
 *
 * 所有判定都在 `fs.realpath` 之后做。否则 `ln -s ~/.ssh /tmp/x` 再读 `/tmp/x/id_rsa`
 * 就能绕开整个黑名单。目标不存在时回退到"最深的存在祖先"做解析，
 * 这样新建文件的路径也能被正确校验。
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

export type FsAccessMode = "read" | "write" | "delete";

/** 触碰即视为凭证泄漏的目录/文件（相对 home）。 */
const HOME_RELATIVE_CREDENTIAL_PATHS = [
	".ssh",
	".aws",
	".gnupg",
	".gpg",
	".kube",
	".docker/config.json",
	".config/gcloud",
	".password-store",
	// macOS 钥匙串
	"Library/Keychains",
	// Windows DPAPI 主密钥
	"AppData/Roaming/Microsoft/Crypto",
	"AppData/Roaming/Microsoft/Protect",
];

/** 与 home 无关的绝对凭证路径。 */
const ABSOLUTE_CREDENTIAL_PATHS = [
	"/etc/ssl/private",
	"/etc/shadow",
	"/private/etc/master.passwd",
	"/Library/Keychains",
];

export class PathAccessDeniedError extends Error {
	readonly code = "EPATHDENIED";
	constructor(message: string) {
		super(message);
		this.name = "PathAccessDeniedError";
	}
}

function normalizeForCompare(p: string): string {
	const resolved = path.resolve(p);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** `child` 是否等于 `parent` 或位于其下（已归一化的路径比较，不做字符串前缀匹配）。 */
export function isWithin(parent: string, child: string): boolean {
	const a = normalizeForCompare(parent);
	const b = normalizeForCompare(child);
	if (a === b) return true;
	const rel = path.relative(a, b);
	return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function credentialRoots(): string[] {
	const home = os.homedir();
	return [
		...HOME_RELATIVE_CREDENTIAL_PATHS.map((rel) => path.join(home, rel)),
		...ABSOLUTE_CREDENTIAL_PATHS,
	];
}

function protectedDatabaseFiles(): string[] {
	let userData = "";
	try {
		userData = app.getPath("userData");
	} catch {
		// app 尚未 ready（理论上不会走到：IPC 一定在 ready 之后）
		return [];
	}
	const base = path.join(userData, "db.sqlite");
	return [base, `${base}-wal`, `${base}-shm`, `${base}-journal`];
}

/**
 * 把路径解析到真实位置。目标不存在时，逐级回退到最深的存在祖先再拼回剩余段，
 * 这样"要新建的文件"也能拿到一个可用于黑名单判定的真实路径。
 */
export async function resolveRealPath(target: string): Promise<string> {
	let current = path.resolve(target);
	const trailing: string[] = [];

	for (let depth = 0; depth < 64; depth += 1) {
		try {
			const real = await fs.realpath(current);
			return trailing.length ? path.join(real, ...trailing.reverse()) : real;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException)?.code;
			if (code !== "ENOENT" && code !== "ENOTDIR") return current;
			const parent = path.dirname(current);
			if (parent === current) return path.resolve(target);
			trailing.push(path.basename(current));
			current = parent;
		}
	}
	return path.resolve(target);
}

/** 路径相对文件系统根的层级数（`/a/b` → 2，`C:\a\b` → 2）。 */
function depthFromRoot(target: string): number {
	const resolved = path.resolve(target);
	const { root } = path.parse(resolved);
	const rest = resolved.slice(root.length);
	return rest.split(/[\\/]+/).filter(Boolean).length;
}

/**
 * 是否是「挂载点根」——macOS 的 `/Volumes/<卷名>`、Linux 的 `/media|/mnt/<名>`。
 * 删这种路径等于抹掉整块盘。
 */
function isMountRoot(target: string): boolean {
	const resolved = path.resolve(target);
	for (const base of ["/Volumes", "/media", "/mnt", "/run/media"]) {
		if (path.dirname(resolved) === base) return true;
	}
	return false;
}

/**
 * 校验一次文件系统访问是否被允许。违规抛 `PathAccessDeniedError`。
 *
 * @param rawPath 已经归一化成绝对路径的目标
 * @param mode    read / write / delete —— 约束强度递增
 */
export async function assertPathAllowed(
	rawPath: string,
	mode: FsAccessMode,
): Promise<string> {
	const real = await resolveRealPath(rawPath);

	for (const root of credentialRoots()) {
		if (isWithin(root, real)) {
			throw new PathAccessDeniedError(
				`拒绝访问凭证目录：${rawPath}（命中安全黑名单 ${root}）`,
			);
		}
	}

	if (mode !== "read") {
		for (const dbFile of protectedDatabaseFiles()) {
			if (normalizeForCompare(dbFile) === normalizeForCompare(real)) {
				throw new PathAccessDeniedError(
					`拒绝${mode === "delete" ? "删除" : "写入"}应用数据库文件：${rawPath}。请通过 IPC 命令操作数据，不要直接改文件。`,
				);
			}
		}
	}

	if (mode === "delete") {
		const { root } = path.parse(real);
		if (normalizeForCompare(real) === normalizeForCompare(root)) {
			throw new PathAccessDeniedError(`拒绝删除文件系统根目录：${rawPath}`);
		}
		if (normalizeForCompare(real) === normalizeForCompare(os.homedir())) {
			throw new PathAccessDeniedError(`拒绝删除用户主目录：${rawPath}`);
		}
		if (isMountRoot(real)) {
			throw new PathAccessDeniedError(`拒绝删除磁盘挂载点：${rawPath}`);
		}
		if (depthFromRoot(real) < 2) {
			throw new PathAccessDeniedError(
				`拒绝删除顶层目录（离文件系统根不足两级）：${rawPath}`,
			);
		}
	}

	return real;
}
