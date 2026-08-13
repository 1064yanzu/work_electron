import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { findAvailablePort } from "./ports";
import {
	ANTHROPIC_PROXY_TOKEN_KEY,
	createLocalAuthMiddleware,
	ensureServiceToken,
	getActiveServiceToken,
} from "./localServiceAuth";
import { createHttpRequestLogger } from "./middleware/httpRequestLogger";
import { createAnthropicProxyRouter } from "./routers/anthropicProxyRouter";

export async function startAnthropicProxyServer({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}) {
	const port = await findAvailablePort(8765, 10);
	const host = "127.0.0.1";
	const token = await ensureServiceToken(db, ANTHROPIC_PROXY_TOKEN_KEY);

	const app = express();
	// 只服务本机进程（Agent SDK / 内部调用），不放行任何跨站请求。
	// 历史配置是 origin:"*"，等于让浏览器里的任意网页都能白嫖用户的 API key 额度。
	app.use(cors({ origin: false }));
	app.use(express.json({ limit: "10mb" }));
	app.use(createHttpRequestLogger({ logger, service: "anthropic-proxy" }));

	app.get("/health", (_req: Request, res: Response) =>
		res.json({ ok: true, service: "anthropic-proxy", ts: Date.now() }),
	);

	// SDK 遥测端点：接受但不处理遥测数据，防止 SDK 因 404 而崩溃。
	// 放在鉴权之前——它不碰任何用户数据，而且 SDK 可能在拿到 key 之前就打过来。
	const acceptTelemetry = (_req: Request, res: Response) => {
		res.json({ success: true });
	};
	app.post("/api/event_logging/batch", acceptTelemetry);
	// 兼容：某些 SDK/配置会在 ANTHROPIC_BASE_URL 后附加 /v1，导致请求走到 /v1/api/event_logging/batch
	app.post("/v1/api/event_logging/batch", acceptTelemetry);

	// 鉴权闸门：SDK 侧通过 ANTHROPIC_API_KEY 环境变量把 token 带成 x-api-key。
	app.use(
		createLocalAuthMiddleware({
			getToken: () => getActiveServiceToken(ANTHROPIC_PROXY_TOKEN_KEY),
			port,
			publicPaths: ["/health"],
		}),
	);

	// 兼容：在根路径和 /v1 下都挂载路由，确保 SDK 无论是否追加 /v1 都能访问
	const proxyRouter = createAnthropicProxyRouter({ db, logger });
	app.use("/", proxyRouter);
	app.use("/v1", proxyRouter);

	const server = await new Promise<import("node:http").Server>((resolve) => {
		const s = app.listen(port, host, () => resolve(s));
	});

	const baseUrl = `http://${host}:${port}`;
	logger.info({ msg: "anthropic proxy server started", port, host });

	server.on("close", () => {
		logger.info({ msg: "anthropic proxy server closed", port, host });
	});

	return { port, baseUrl, token };
}
