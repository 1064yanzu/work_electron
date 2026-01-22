import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { findAvailablePort } from "./ports";
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

	const app = express();
	app.use(cors({ origin: "*", methods: "*", allowedHeaders: "*" }));
	app.use(express.json({ limit: "10mb" }));
	app.use(createHttpRequestLogger({ logger, service: "anthropic-proxy" }));

	app.get("/health", (_req: Request, res: Response) =>
		res.json({ ok: true, service: "anthropic-proxy", ts: Date.now() }),
	);

	// SDK 遥测端点：接受但不处理遥测数据，防止 SDK 因 404 而崩溃
	app.post("/api/event_logging/batch", (_req: Request, res: Response) => {
		// 直接返回成功，不记录遥测数据
		res.json({ success: true });
	});

	app.use("/v1", createAnthropicProxyRouter({ db, logger }));


	const server = await new Promise<import("node:http").Server>((resolve) => {
		const s = app.listen(port, host, () => resolve(s));
	});

	const baseUrl = `http://${host}:${port}`;
	logger.info({ msg: "anthropic proxy server started", port, host });

	server.on("close", () => {
		logger.info({ msg: "anthropic proxy server closed", port, host });
	});

	return { port, baseUrl };
}
