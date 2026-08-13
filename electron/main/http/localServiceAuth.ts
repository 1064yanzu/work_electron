/**
 * 本地 HTTP 服务的统一鉴权基座。
 *
 * ## 为什么回环端口也必须鉴权
 *
 * `127.0.0.1` 不是安全边界：本机任意进程都能连；更麻烦的是用户浏览器里打开的
 * **任意网页**都能向回环端口发起跨域请求。只要 CORS 放行（哪怕只是简单请求
 * 的副作用），一个恶意页面就能白嫖用户的 API key 额度、或者往知识库里注入
 * 内容做间接提示注入。反向 MCP 服务（`routers/harnessMcpRouter.ts`）一开始就
 * 是这么做的，这里把同一套做法抽出来给 Anthropic 代理和剪藏服务复用。
 *
 * ## 三道闸
 *
 * 1. **Token**：`x-api-key` / `Authorization: Bearer` / `x-ipo-token` 任一命中即可，
 *    用 `timingSafeEqual` 比较避免计时侧信道。token 存 app_config，随应用长期有效。
 * 2. **Host 头白名单**：只接受 `127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>`。
 *    这是防 DNS rebinding 的关键——攻击者把恶意域名解析到 127.0.0.1 后，浏览器
 *    发出的请求 Host 头仍是那个恶意域名。
 * 3. **豁免路径**：`/health` 之类的探活端点不含任何用户数据，保持开放，
 *    否则外部消费方（浏览器扩展、CLI）连"服务在不在"都探不出来。
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { DbContext } from "../db/client";

/** app_config 里各本地服务 token 的 key。 */
export const ANTHROPIC_PROXY_TOKEN_KEY = "anthropic_proxy_token";
export const CLIP_SERVICE_TOKEN_KEY = "clip_service_token";

/**
 * 进程内的 token 副本。中间件通过它读当前有效值，因此 `rotateServiceToken()`
 * 一落库就立刻生效，不需要重启服务或重新探测端口。
 */
const activeTokens = new Map<string, string>();

/** 取进程内当前有效的 token（服务尚未启动时返回空串）。 */
export function getActiveServiceToken(configKey: string): string {
	return activeTokens.get(configKey) ?? "";
}

/**
 * 取（必要时生成）某个本地服务的 token。
 *
 * 注意：这里**不走 secretVault 加密**。这些 token 是本机服务的访问凭证，
 * 主进程每次启动都要读出明文塞进中间件；而且它们不是用户资产（泄漏了轮换即可），
 * 与 API key 的威胁模型不同。加密只会平白增加一次启动期解密失败就全盘不可用的风险。
 */
export async function ensureServiceToken(
	db: DbContext,
	configKey: string,
): Promise<string> {
	const res = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [configKey],
	});
	const existing = (res.rows[0] as Record<string, unknown> | undefined)?.value;
	if (typeof existing === "string" && existing.length >= 32) {
		activeTokens.set(configKey, existing);
		return existing;
	}

	const token = randomBytes(24).toString("base64url");
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [configKey, token, Date.now()],
	});
	activeTokens.set(configKey, token);
	return token;
}

/**
 * 重新生成 token（用户怀疑泄漏时）。落库并同步刷新进程内副本，立即生效。
 *
 * 注意：轮换 Anthropic 代理的 token 会让**正在运行的 Agent SDK 子进程**失效
 * （它的 `ANTHROPIC_API_KEY` 是启动时注入的，不会热更新）。调用方应提示用户
 * 先停掉进行中的会话。
 */
export async function rotateServiceToken(
	db: DbContext,
	configKey: string,
): Promise<string> {
	const token = randomBytes(24).toString("base64url");
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [configKey, token, Date.now()],
	});
	activeTokens.set(configKey, token);
	return token;
}

/** 定长比较，避免用 `===` 泄漏前缀匹配长度。 */
export function safeTokenEquals(a: string, b: string): boolean {
	if (!a || !b) return false;
	const bufA = Buffer.from(a, "utf-8");
	const bufB = Buffer.from(b, "utf-8");
	if (bufA.length !== bufB.length) return false;
	try {
		return timingSafeEqual(bufA, bufB);
	} catch {
		return false;
	}
}

/** 从请求头里取出调用方提供的 token（支持三种写法）。 */
function extractToken(req: Request): string {
	const auth = String(req.headers.authorization ?? "").trim();
	if (auth.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim();
	}
	const apiKey = req.headers["x-api-key"];
	if (typeof apiKey === "string" && apiKey.trim()) return apiKey.trim();
	const ipoToken = req.headers["x-ipo-token"];
	if (typeof ipoToken === "string" && ipoToken.trim()) return ipoToken.trim();
	return "";
}

/**
 * Host 头是否指向本机回环。
 *
 * 允许省略端口（少数客户端不带），但主机名必须是回环字面量——
 * 任何域名（含解析到 127.0.0.1 的域名）都会被拒绝。
 */
export function isLoopbackHost(hostHeader: unknown, port: number): boolean {
	if (typeof hostHeader !== "string" || !hostHeader) return false;
	const host = hostHeader.trim().toLowerCase();

	const candidates = [
		`127.0.0.1:${port}`,
		`localhost:${port}`,
		`[::1]:${port}`,
		"127.0.0.1",
		"localhost",
		"[::1]",
	];
	return candidates.includes(host);
}

export interface LocalAuthOptions {
	/** 读当前有效 token（用闭包读，支持运行时轮换）。 */
	getToken: () => string;
	/** 服务监听端口，用于 Host 白名单校验。 */
	port: number;
	/** 无需鉴权的路径（精确匹配，相对于挂载点）。 */
	publicPaths?: string[];
	/** 401 响应体构造器；不同服务的错误协议不同（JSON-RPC / Anthropic / 普通 JSON）。 */
	buildUnauthorizedBody?: (reason: string) => unknown;
}

export function createLocalAuthMiddleware(
	options: LocalAuthOptions,
): RequestHandler {
	const publicPaths = new Set(options.publicPaths ?? ["/health"]);
	const buildBody =
		options.buildUnauthorizedBody ??
		((reason: string) => ({
			error: { type: "authentication_error", message: reason },
		}));

	return (req: Request, res: Response, next: NextFunction) => {
		if (publicPaths.has(req.path)) {
			next();
			return;
		}

		if (!isLoopbackHost(req.headers.host, options.port)) {
			res.status(403).json(buildBody("Forbidden: unexpected Host header"));
			return;
		}

		const expected = options.getToken();
		if (!expected) {
			// token 还没就绪（理论上不会发生：服务启动前就 ensure 过）——
			// 宁可拒绝也不要静默放行。
			res.status(503).json(buildBody("Service token not ready"));
			return;
		}

		if (!safeTokenEquals(extractToken(req), expected)) {
			res.status(401).json(buildBody("Unauthorized: invalid or missing token"));
			return;
		}

		next();
	};
}
