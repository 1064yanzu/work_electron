/**
 * browserCookieImport —— 把本机浏览器里某个站点的登录态搬进内嵌视图的分区。
 *
 * ## 为什么需要它
 *
 * 内嵌 Web AI 用的是独立 `persist:aihub-<siteId>` 分区，与用户日常浏览器完全隔离，
 * 所以每个站点都得在 App 里再登录一次。浏览器之间无法共享 session：Chrome 系把
 * cookie 用系统密钥加密后存在自己的 profile 里，没有任何官方共享途径。
 *
 * 这里做的是**用户显式发起的一次性搬运**：读用户自己机器上、自己浏览器的 cookie，
 * 解密后写进本 App 的分区。
 *
 * ## 安全边界（重要，改动时不要放宽）
 *
 * 1. **按域名限定**：只读目标站点自身的注册域（含子域），外加站点配置里**显式声明**
 *    的 `authDomains`。导入 ChatGPT 会碰 `chatgpt.com` 与 `openai.com`——后者是因为
 *    OpenAI 把会话清单放在 `.auth.openai.com` 上，不带就是半套 cookie、页面依旧未登录。
 *    绝不整库搬运，`authDomains` 也不接受前端写入（见 webSites.mergeWebSites）。
 * 2. **只由用户显式动作触发**：没有任何后台/自动路径调用它。
 * 3. **不落盘、不外发**：解密结果只在内存里走一趟 `session.cookies.set`，
 *    不写日志（日志里只出现域名、cookie 名与条数，绝不出现 cookie 值）。
 * 4. **临时副本即用即删**：浏览器运行时会锁住 Cookies 库，必须先拷贝再读，
 *    拷贝出来的文件（含 -wal/-shm）在 finally 里删干净。
 *
 * ## 光搬 cookie 不够：UA 也要对齐
 *
 * Cloudflare 的 `cf_clearance` 绑 **IP + User-Agent**。搬了 Chrome 151 的 cookie 却用
 * Electron 自带 Chromium（如 144）的 UA 发请求，一比对就作废。`detectBrowserUserAgent`
 * 负责读出来源浏览器的真实主版本号拼出一致的 UA，由 aiHubViewService 打到分区上。
 *
 * ## 各平台的加密方式
 *
 * | 平台 | 密钥来源 | 算法 |
 * | --- | --- | --- |
 * | macOS | 钥匙串 `<Browser> Safe Storage` → PBKDF2-SHA1(1003, "saltysalt") | AES-128-CBC |
 * | Windows | `Local State` 的 `os_crypt.encrypted_key` → DPAPI 解包 | AES-256-GCM |
 * | Linux | 钥匙串取不到时用固定口令 `peanuts` → PBKDF2-SHA1(1) | AES-128-CBC |
 *
 * **Windows 的 v20（App-Bound Encryption）导不了**：Chrome 127+ 把密钥绑定到
 * 浏览器可执行文件本身，设计目的就是阻止其它进程读取，属于按预期失败，
 * 会如实报给用户而不是静默吞掉。
 */

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createClient } from "@libsql/client";
import { session } from "electron";
import { createLogger } from "../logging/logger";

const logger = createLogger();
const execFileAsync = promisify(execFile);

/** 可导入的浏览器 profile。 */
export interface BrowserCookieSource {
	/** `chrome` / `edge` / `brave` */
	browser: string;
	/** 展示名（"Google Chrome · Default"） */
	label: string;
	/** profile 目录名（Default / Profile 1 …） */
	profile: string;
	/** Cookies 库绝对路径 */
	cookiePath: string;
}

export interface CookieImportResult {
	ok: boolean;
	/** 实际写入的 cookie 条数 */
	imported: number;
	/** 解密失败被跳过的条数 */
	skipped: number;
	/** ok=false 时的原因（中文，直接展示给用户） */
	error?: string;
}

interface BrowserSpec {
	id: string;
	label: string;
	/** 相对 userData 根的目录（各平台不同，见 browserRoots） */
	dirs: { darwin?: string; win32?: string; linux?: string };
	/** macOS 钥匙串里的 service 名 */
	keychainService: string;
	/** macOS 钥匙串里的 account 名 */
	keychainAccount: string;
}

const BROWSERS: BrowserSpec[] = [
	{
		id: "chrome",
		label: "Google Chrome",
		dirs: {
			darwin: "Library/Application Support/Google/Chrome",
			win32: "AppData/Local/Google/Chrome/User Data",
			linux: ".config/google-chrome",
		},
		keychainService: "Chrome Safe Storage",
		keychainAccount: "Chrome",
	},
	{
		id: "edge",
		label: "Microsoft Edge",
		dirs: {
			darwin: "Library/Application Support/Microsoft Edge",
			win32: "AppData/Local/Microsoft/Edge/User Data",
			linux: ".config/microsoft-edge",
		},
		keychainService: "Microsoft Edge Safe Storage",
		keychainAccount: "Microsoft Edge",
	},
	{
		id: "brave",
		label: "Brave",
		dirs: {
			darwin: "Library/Application Support/BraveSoftware/Brave-Browser",
			win32: "AppData/Local/BraveSoftware/Brave-Browser/User Data",
			linux: ".config/BraveSoftware/Brave-Browser",
		},
		keychainService: "Brave Safe Storage",
		keychainAccount: "Brave",
	},
];

/** 常见的 profile 目录名。Chrome 系就这套命名，穷举比解析 Local State 稳。 */
const PROFILE_DIRS = [
	"Default",
	"Profile 1",
	"Profile 2",
	"Profile 3",
	"Profile 4",
];

function browserRoot(spec: BrowserSpec): string | null {
	const rel = spec.dirs[process.platform as "darwin" | "win32" | "linux"];
	if (!rel) return null;
	return path.join(os.homedir(), ...rel.split("/"));
}

/** Cookies 库在 profile 里的位置（Windows 上在 Network 子目录）。 */
function cookieFileCandidates(profileDir: string): string[] {
	return [
		path.join(profileDir, "Network", "Cookies"),
		path.join(profileDir, "Cookies"),
	];
}

/** 列出本机可导入的浏览器 profile。 */
export function listCookieSources(): BrowserCookieSource[] {
	const found: BrowserCookieSource[] = [];
	for (const spec of BROWSERS) {
		const root = browserRoot(spec);
		if (!root || !existsSync(root)) continue;
		for (const profile of PROFILE_DIRS) {
			const profileDir = path.join(root, profile);
			if (!existsSync(profileDir)) continue;
			const cookiePath = cookieFileCandidates(profileDir).find((p) =>
				existsSync(p),
			);
			if (!cookiePath) continue;
			found.push({
				browser: spec.id,
				label: `${spec.label} · ${profile}`,
				profile,
				cookiePath,
			});
		}
	}
	return found;
}

/**
 * 数一下某 profile 里该站点有多少条**未过期**的 cookie。
 *
 * 给 profile 选择器用：只显示「Google Chrome · Default」这种标签的话，用户根本
 * 无从判断哪个 profile 真的登录过——本次事故就是选中了一个四个月没动过、
 * 压根没有 session token 的旧 profile，导入"成功"却依然是未登录。
 *
 * 只读行、不解密，所以**不会触发钥匙串授权框**，可以在打开菜单时批量调用。
 */
export async function countValidCookies(options: {
	source: BrowserCookieSource;
	siteUrl: string;
	authDomains?: string[];
}): Promise<number> {
	const { source, siteUrl, authDomains = [] } = options;
	let domains: string[];
	try {
		domains = resolveDomains(siteUrl, authDomains);
	} catch {
		return 0;
	}
	if (domains.length === 0) return 0;

	let tempDir: string | null = null;
	try {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "aihub-count-"));
		const tempPath = path.join(tempDir, "Cookies");
		await copyFile(source.cookiePath, tempPath);
		for (const suffix of ["-wal", "-shm"]) {
			const sidecar = `${source.cookiePath}${suffix}`;
			if (existsSync(sidecar)) {
				await copyFile(sidecar, `${tempPath}${suffix}`).catch(() => undefined);
			}
		}

		const client = createClient({ url: `file:${tempPath}`, intMode: "bigint" });
		try {
			const filter = buildDomainFilter(domains);
			const result = await client.execute({
				sql: `SELECT expires_utc FROM cookies WHERE ${filter.where}`,
				args: filter.args,
			});
			const now = Math.floor(Date.now() / 1000);
			let valid = 0;
			for (const row of result.rows as unknown as { expires_utc: bigint }[]) {
				const at = chromeTimeToUnixSeconds(toNumber(row.expires_utc));
				// expires_utc = 0 是会话级 cookie，算有效
				if (at === undefined || at > now) valid++;
			}
			return valid;
		} finally {
			client.close();
		}
	} catch {
		// 数不出来就当 0，不要因为一个 profile 读失败而挡住整个菜单
		return 0;
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
		}
	}
}

// ============================================================
// 来源浏览器的 User-Agent
// ============================================================

/**
 * 读出来源浏览器的真实主版本号，拼一条与它一致的 User-Agent。
 *
 * ## 为什么必须做
 *
 * Cloudflare 的 `cf_clearance` 是 **IP + User-Agent 绑定**的。我们把 Chrome 的
 * `cf_clearance` 搬进内嵌分区，却用 Electron 自带 Chromium 版本拼出来的 UA 发请求
 * （Electron 128 vs 用户 Chrome 140），Cloudflare 一比对就作废 → 挑战页 / 未登录。
 * ChatGPT 全站在 Cloudflare 后面，`.chatgpt.com` / `.openai.com` / `.auth.openai.com`
 * 各有一条 `cf_clearance`，UA 对不上等于白搬。
 *
 * ## 为什么只需要主版本号
 *
 * Chrome 107+ 起 UA 已「精简化」（UA Reduction）：次版本一律归零，真实 Chrome 发出去
 * 的就是 `Chrome/140.0.0.0`。所以拿到主版本号就能拼出**逐字节一致**的 UA。
 *
 * 拿不到版本号时返回 null，调用方回退到原有的 UA 策略——宁可不改，也不要拼一条
 * 半真半假的 UA 反而更容易被风控。
 */
export async function detectBrowserUserAgent(
	browserId: string,
): Promise<string | null> {
	const spec = BROWSERS.find((b) => b.id === browserId);
	if (!spec) return null;

	const major = await readBrowserMajorVersion(spec);
	if (!major) return null;

	const platform =
		process.platform === "darwin"
			? "Macintosh; Intel Mac OS X 10_15_7"
			: process.platform === "win32"
				? "Windows NT 10.0; Win64; x64"
				: "X11; Linux x86_64";

	// Brave 刻意不在 UA 里留标识（它就是要和 Chrome 一模一样）；Edge 追加 Edg/ token
	const suffix = spec.id === "edge" ? ` Edg/${major}.0.0.0` : "";
	return (
		`Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
		`Chrome/${major}.0.0.0 Safari/537.36${suffix}`
	);
}

/** 从浏览器安装位置读主版本号（macOS 读 Info.plist，Win/Linux 读 Last Version 文件）。 */
async function readBrowserMajorVersion(
	spec: BrowserSpec,
): Promise<string | null> {
	if (process.platform === "darwin") {
		const appPath = MAC_APP_PATHS[spec.id];
		if (!appPath || !existsSync(appPath)) return null;
		try {
			const { stdout } = await execFileAsync("defaults", [
				"read",
				path.join(appPath, "Contents", "Info"),
				"CFBundleShortVersionString",
			]);
			return parseMajor(stdout);
		} catch {
			return null;
		}
	}

	// Chrome 系会在 userData 根写一个 "Last Version" 纯文本文件
	const root = browserRoot(spec);
	if (!root) return null;
	const versionFile = path.join(root, "Last Version");
	if (!existsSync(versionFile)) return null;
	try {
		return parseMajor(await readFile(versionFile, "utf-8"));
	} catch {
		return null;
	}
}

function parseMajor(raw: string): string | null {
	const major = raw.trim().split(".")[0];
	return /^\d+$/.test(major) ? major : null;
}

/** macOS 上各浏览器的默认安装路径。 */
const MAC_APP_PATHS: Record<string, string> = {
	chrome: "/Applications/Google Chrome.app",
	edge: "/Applications/Microsoft Edge.app",
	brave: "/Applications/Brave Browser.app",
};

// ============================================================
// 解密密钥
// ============================================================

/** macOS：从钥匙串取 Safe Storage 口令，再 PBKDF2 出 AES-128 key。 */
async function macKey(spec: BrowserSpec): Promise<Buffer> {
	// 首次调用会弹系统授权框——这是用户显式发起导入时该有的确认，不要绕过
	const { stdout } = await execFileAsync("security", [
		"find-generic-password",
		"-w",
		"-s",
		spec.keychainService,
		"-a",
		spec.keychainAccount,
	]);
	const password = stdout.trim();
	if (!password) throw new Error("钥匙串里没有该浏览器的 Safe Storage 口令");
	return crypto.pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

/** Windows：Local State 里的 DPAPI 密钥，交给 PowerShell 解包。 */
async function winKey(spec: BrowserSpec): Promise<Buffer> {
	const root = browserRoot(spec);
	if (!root) throw new Error("未找到该浏览器的数据目录");
	const raw = await readFile(path.join(root, "Local State"), "utf-8");
	const parsed = JSON.parse(raw) as {
		os_crypt?: { encrypted_key?: string };
	};
	const encoded = parsed.os_crypt?.encrypted_key;
	if (!encoded) throw new Error("Local State 里没有 os_crypt.encrypted_key");
	const blob = Buffer.from(encoded, "base64");
	if (blob.subarray(0, 5).toString("ascii") !== "DPAPI") {
		throw new Error("os_crypt 密钥不是 DPAPI 格式，可能是新版应用绑定加密");
	}
	const protectedKey = blob.subarray(5).toString("base64");
	// 走 PowerShell 调 DPAPI，省掉一个原生依赖
	const script = [
		"Add-Type -AssemblyName System.Security;",
		`$b=[Convert]::FromBase64String('${protectedKey}');`,
		"$u=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser');",
		"[Convert]::ToBase64String($u)",
	].join(" ");
	const { stdout } = await execFileAsync("powershell.exe", [
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		script,
	]);
	const key = Buffer.from(stdout.trim(), "base64");
	if (key.length !== 32) throw new Error("DPAPI 解出的密钥长度不对");
	return key;
}

/** Linux：拿不到钥匙串就用 Chromium 的固定回退口令。 */
function linuxKey(): Buffer {
	return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
}

async function resolveKey(spec: BrowserSpec): Promise<Buffer> {
	if (process.platform === "darwin") return await macKey(spec);
	if (process.platform === "win32") return await winKey(spec);
	return linuxKey();
}

// ============================================================
// 解密单条 cookie
// ============================================================

/**
 * 解密 `encrypted_value`。
 *
 * - `v10`/`v11`（mac/linux）：AES-128-CBC，IV 是 16 个空格，PKCS#7 padding。
 *   Chrome 130+ 还会在明文前加 32 字节的 SHA256(domain) 校验前缀，需要剥掉。
 * - `v10`（win）：AES-256-GCM，3 字节前缀 + 12 字节 nonce + 密文 + 16 字节 tag。
 * - `v20`（win）：App-Bound Encryption，外部进程解不了，直接放弃这一条。
 * - 无前缀：老版本明文存储，直接用。
 */
function decryptValue(
	encrypted: Buffer,
	key: Buffer,
	hostKey: string,
): string | null {
	if (encrypted.length === 0) return "";
	const prefix = encrypted.subarray(0, 3).toString("ascii");

	if (process.platform === "win32") {
		if (prefix === "v20") return null; // 应用绑定加密，按预期解不了
		if (prefix !== "v10" && prefix !== "v11")
			return encrypted.toString("utf-8");
		try {
			const nonce = encrypted.subarray(3, 15);
			const tag = encrypted.subarray(encrypted.length - 16);
			const body = encrypted.subarray(15, encrypted.length - 16);
			const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
			decipher.setAuthTag(tag);
			return Buffer.concat([decipher.update(body), decipher.final()]).toString(
				"utf-8",
			);
		} catch {
			return null;
		}
	}

	if (prefix !== "v10" && prefix !== "v11") return encrypted.toString("utf-8");
	try {
		const iv = Buffer.alloc(16, " ");
		const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
		decipher.setAutoPadding(true);
		const plain = Buffer.concat([
			decipher.update(encrypted.subarray(3)),
			decipher.final(),
		]);
		// Chrome 130+ 的 domain 绑定前缀：明文头部 32 字节是 SHA256(host_key)
		const expected = crypto.createHash("sha256").update(hostKey).digest();
		if (plain.length >= 32 && plain.subarray(0, 32).equals(expected)) {
			return plain.subarray(32).toString("utf-8");
		}
		return plain.toString("utf-8");
	} catch {
		return null;
	}
}

// ============================================================
// 主流程
// ============================================================

/** 取 URL 的注册域（`chat.openai.com` → `openai.com`），用于匹配 cookie 域。 */
function registrableDomain(hostname: string): string {
	const parts = hostname.split(".").filter(Boolean);
	if (parts.length <= 2) return parts.join(".");
	// 简单够用：不处理 co.uk 这类多段公共后缀——目标站点都是单段 TLD
	return parts.slice(-2).join(".");
}

/**
 * 解析一次导入要覆盖的域集合：站点自身注册域 + 显式声明的关联登录域。
 *
 * 关联域来自站点配置的 `authDomains`，是**有意扩大**的安全边界，
 * 不接受用户在前端随意写入（见 webSites.mergeWebSites）。
 */
function resolveDomains(siteUrl: string, authDomains: string[]): string[] {
	const out = new Set<string>();
	const own = registrableDomain(new URL(siteUrl).hostname);
	if (own) out.add(own);
	for (const raw of authDomains) {
		const d = raw.trim().toLowerCase().replace(/^\./, "");
		if (d) out.add(registrableDomain(d));
	}
	return [...out];
}

/** 按域集合拼 WHERE 子句：每个域匹配「裸域 / .域 / 任意子域」三种写法。 */
function buildDomainFilter(domains: string[]): {
	where: string;
	args: string[];
} {
	const clauses: string[] = [];
	const args: string[] = [];
	for (const d of domains) {
		clauses.push("host_key = ? OR host_key = ? OR host_key LIKE ?");
		args.push(d, `.${d}`, `%.${d}`);
	}
	return { where: clauses.map((c) => `(${c})`).join(" OR "), args };
}

/** Chrome 的时间戳是 1601-01-01 起的微秒。 */
const CHROME_EPOCH_OFFSET_SECONDS = 11_644_473_600;

/**
 * 把 libsql 返回的整数列归一成 number。
 *
 * 客户端用 `intMode: "bigint"` 打开（见下方说明），所以整数列拿到的是 BigInt，
 * 直接参与算术会抛 "Cannot mix BigInt and other types"，`0n === 0` 也是 false。
 * `expires_utc` 量级 1.3e16，转成 number 的舍入误差在 2μs 内，对「秒级过期时间」无影响。
 */
function toNumber(value: bigint | number | string | null | undefined): number {
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}

function chromeTimeToUnixSeconds(value: number): number | undefined {
	if (!value) return undefined;
	const seconds = value / 1_000_000 - CHROME_EPOCH_OFFSET_SECONDS;
	if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
	return Math.floor(seconds);
}

/** Chrome 的 samesite 列：-1 未指定 / 0 None / 1 Lax / 2 Strict。 */
function mapSameSite(
	value: number,
): "unspecified" | "no_restriction" | "lax" | "strict" {
	if (value === 0) return "no_restriction";
	if (value === 1) return "lax";
	if (value === 2) return "strict";
	return "unspecified";
}

interface CookieRow {
	host_key: string;
	name: string;
	/** libsql 的 BLOB 列返回 ArrayBuffer（不是 Uint8Array） */
	encrypted_value: ArrayBuffer | null;
	value: string | null;
	path: string;
	/** 以下整数列在 intMode:"bigint" 下是 BigInt，取值一律过 toNumber() */
	expires_utc: bigint;
	is_secure: bigint;
	is_httponly: bigint;
	samesite: bigint;
}

/**
 * 把某浏览器 profile 里属于 `siteUrl`（及其 `authDomains`）的 cookie
 * 导入到 `partition`。
 *
 * 失败一律返回 `ok:false` + 中文原因，不抛异常给 IPC 层。
 */
export async function importCookiesForSite(options: {
	source: BrowserCookieSource;
	siteUrl: string;
	partition: string;
	/** 站点显式声明的额外登录域，见 WebSiteConfig.authDomains */
	authDomains?: string[];
}): Promise<CookieImportResult> {
	const { source, siteUrl, partition, authDomains = [] } = options;
	const spec = BROWSERS.find((b) => b.id === source.browser);
	if (!spec)
		return { ok: false, imported: 0, skipped: 0, error: "未知的浏览器" };

	let domains: string[];
	try {
		domains = resolveDomains(siteUrl, authDomains);
	} catch {
		return { ok: false, imported: 0, skipped: 0, error: "站点 URL 无效" };
	}
	if (domains.length === 0) {
		return { ok: false, imported: 0, skipped: 0, error: "无法解析站点域名" };
	}
	// 日志里用得到的可读域名（只记域名，不记 cookie 内容）
	const domain = domains.join(", ");

	let key: Buffer;
	try {
		key = await resolveKey(spec);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error({
			msg: "取不到浏览器解密密钥",
			browser: spec.id,
			profile: source.profile,
			domain,
			error: message,
		});
		// macOS 上最常见的失败是用户在钥匙串授权框点了「拒绝」，
		// `security` 的原始报错（exit 128 / User interaction is not allowed）没人看得懂
		const hint =
			process.platform === "darwin"
				? `取不到 ${spec.label} 的解密密钥。系统会弹出钥匙串授权框，需要点「允许」并输入登录密码；若刚才点了「拒绝」，请重试一次。`
				: `取不到 ${spec.label} 的解密密钥：${message}`;
		return { ok: false, imported: 0, skipped: 0, error: hint };
	}

	// 浏览器运行时会锁库，必须拷贝出来再读
	let tempDir: string | null = null;
	try {
		tempDir = await mkdtemp(path.join(os.tmpdir(), "aihub-cookies-"));
		const tempPath = path.join(tempDir, "Cookies");
		await copyFile(source.cookiePath, tempPath);
		// WAL 模式下最近写入的 cookie 还在 -wal 里，只拷主库会读到旧数据
		for (const suffix of ["-wal", "-shm"]) {
			const sidecar = `${source.cookiePath}${suffix}`;
			if (existsSync(sidecar)) {
				await copyFile(sidecar, `${tempPath}${suffix}`).catch(() => undefined);
			}
		}

		// intMode 必须是 bigint：Chrome 的 expires_utc 是「1601 年起的微秒」，
		// 2026 年的 cookie 约 1.34e16，超过 JS 安全整数上限 9.007e15。
		// libsql 默认的 intMode:"number" 遇到这种值会直接抛
		// "Received integer which cannot be safely represented as a JavaScript number"，
		// 整次导入随之失败。不要改回默认值。
		// （"string" 也能读，但 is_secure 会变成 "0"，Boolean("0") 是 true，坑更深。）
		const client = createClient({ url: `file:${tempPath}`, intMode: "bigint" });
		let rows: CookieRow[];
		try {
			// 只取目标域集合（含子域）的 cookie —— 绝不整库搬运
			const filter = buildDomainFilter(domains);
			const result = await client.execute({
				sql: `SELECT host_key, name, encrypted_value, value, path,
				             expires_utc, is_secure, is_httponly, samesite
				      FROM cookies
				      WHERE ${filter.where}`,
				args: filter.args,
			});
			rows = result.rows as unknown as CookieRow[];
		} finally {
			client.close();
		}

		if (rows.length === 0) {
			return {
				ok: false,
				imported: 0,
				skipped: 0,
				error: `${spec.label} 里没有 ${domain} 的 cookie，可能是没在该浏览器登录过`,
			};
		}

		const target = session.fromPartition(partition);
		const nowSeconds = Math.floor(Date.now() / 1000);
		let imported = 0;
		let skipped = 0;
		// 分开统计失败原因，好让最后的报错说人话，而不是一律「解密失败」
		let decryptFailed = 0;
		let expired = 0;
		const writeFailed: string[] = [];

		for (const row of rows) {
			const encrypted = row.encrypted_value
				? Buffer.from(row.encrypted_value)
				: Buffer.alloc(0);
			const plain =
				encrypted.length > 0
					? decryptValue(encrypted, key, row.host_key)
					: (row.value ?? "");
			if (plain === null) {
				decryptFailed++;
				skipped++;
				continue;
			}

			// 已过期的条目写进去也会被立刻丢弃，不该算进「已导入」里虚报成功
			const expiresAt = chromeTimeToUnixSeconds(toNumber(row.expires_utc));
			if (expiresAt !== undefined && expiresAt <= nowSeconds) {
				expired++;
				skipped++;
				continue;
			}

			const isSecure = toNumber(row.is_secure) !== 0;
			const host = row.host_key.startsWith(".")
				? row.host_key.slice(1)
				: row.host_key;
			// `__Host-` 前缀的 cookie 必须是 host-only：带 domain 属性会被 Chromium
			// 直接拒收（RFC 6265bis）。next-auth 的 __Host-next-auth.csrf-token 就是
			// 这一类，丢了它登录态就不完整。同前缀还强制 path="/" 与 secure。
			const hostOnly = row.name.startsWith("__Host-");
			const cookiePath = hostOnly ? "/" : row.path || "/";
			const secure = hostOnly ? true : isSecure;
			try {
				await target.cookies.set({
					url: `${secure ? "https" : "http"}://${host}${cookiePath}`,
					name: row.name,
					value: plain,
					domain: hostOnly ? undefined : row.host_key,
					path: cookiePath,
					secure,
					httpOnly: toNumber(row.is_httponly) !== 0,
					expirationDate: expiresAt,
					sameSite: mapSameSite(toNumber(row.samesite)),
				});
				imported++;
			} catch (error) {
				// 单条写失败（域名与 url 不匹配等）不影响其余，但要留痕：
				// 静默吞掉会让「导入成功却没登录」变成无从查起的黑箱（只记名字，不记值）
				writeFailed.push(
					`${row.name}@${row.host_key}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				skipped++;
			}
		}

		// 只记域名与条数，绝不记 cookie 内容
		logger.info({
			msg: "已从本机浏览器导入登录态",
			browser: spec.id,
			profile: source.profile,
			domain,
			total: rows.length,
			imported,
			skipped,
			decryptFailed,
			expired,
			writeFailed: writeFailed.length > 0 ? writeFailed : undefined,
		});

		if (imported === 0) {
			// 全过期 ≠ 解密失败，别把「登录早就失效了」报成「加密方式变了」
			if (expired > 0 && decryptFailed === 0) {
				return {
					ok: false,
					imported,
					skipped,
					error: `${spec.label} 里 ${domain} 的登录信息已全部过期，请先在该浏览器重新登录一次`,
				};
			}
			return {
				ok: false,
				imported,
				skipped,
				error:
					process.platform === "win32"
						? "全部条目解密失败。Chrome 127+ 的应用绑定加密（v20）不允许其它程序读取，这种情况只能在应用内手动登录。"
						: "全部条目解密失败，可能是浏览器版本的加密方式已变更",
			};
		}
		return { ok: true, imported, skipped };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// 失败路径以前一条日志都不打，出问题只能靠用户复述报错——补上（仍不含 cookie 内容）
		logger.error({
			msg: "从本机浏览器导入登录态失败",
			browser: spec.id,
			profile: source.profile,
			domain,
			error: message,
		});
		return {
			ok: false,
			imported: 0,
			skipped: 0,
			error: `导入失败：${message}`,
		};
	} finally {
		if (tempDir) {
			// 临时副本连同 libsql 可能生成的 -wal/-shm 一起删掉
			await rm(tempDir, { recursive: true, force: true }).catch(
				() => undefined,
			);
		}
	}
}
