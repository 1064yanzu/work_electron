import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { findAvailablePort } from "./ports";
import {
	CLIP_SERVICE_TOKEN_KEY,
	createLocalAuthMiddleware,
	ensureServiceToken,
	getActiveServiceToken,
} from "./localServiceAuth";
import { createHttpRequestLogger } from "./middleware/httpRequestLogger";
import { createClipRouter } from "./routers/clipRouter";

export async function startClipServer({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}) {
	const port = await findAvailablePort(21064, 10);
	const host = "127.0.0.1";
	const token = await ensureServiceToken(db, CLIP_SERVICE_TOKEN_KEY);

	const app = express();
	// 浏览器扩展是通过后台脚本发请求的（不受页面同源策略约束），因此不需要
	// 放行任意站点。历史配置 `cors()` 会反射任意 Origin，等于任何网页都能
	// 往用户知识库里写内容 —— 那是间接提示注入的入口。
	app.use(cors({ origin: false }));
	app.use(express.json({ limit: "10mb" }));
	app.use(createHttpRequestLogger({ logger, service: "clip" }));

	// 探活端点保持开放：扩展需要靠它在 10 个候选端口里找到本服务。
	// 注意它只回端口和服务名，不含任何用户数据。
	app.get("/health", (_req: Request, res: Response) =>
		res.json({ status: "ok", service: "clip_server", port }),
	);

	app.use(
		createLocalAuthMiddleware({
			getToken: () => getActiveServiceToken(CLIP_SERVICE_TOKEN_KEY),
			port,
			publicPaths: ["/health", "/api/health"],
			buildUnauthorizedBody: (reason) => ({ error: reason }),
		}),
	);

	app.use("/api", createClipRouter({ logger, db, port }));

	app.use(
		(
			err: unknown,
			_req: Request,
			res: Response,
			_next: (err: unknown) => void,
		) => {
			const anyErr = err as { type?: string; message?: string };
			if (anyErr?.type === "entity.too.large") {
				res.status(413).type("text/plain").send("request body too big");
				return;
			}
			res.status(400).json({ error: anyErr?.message || "Bad Request" });
		},
	);

	const server = await new Promise<import("node:http").Server>((resolve) => {
		const s = app.listen(port, host, () => resolve(s));
	});

	const baseUrl = `http://${host}:${port}`;
	logger.info({ msg: "clip server started", port, host });

	server.on("close", () => {
		logger.info({ msg: "clip server closed", port, host });
	});

	return { port, baseUrl, token };
}
