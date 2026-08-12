/**
 * AI Hub 反向 MCP Server 的启动器。
 *
 * 端口从 8790 起探测（8765 是 Anthropic 代理、21064 是剪藏服务，避开）。
 * **服务始终监听，但被开关保护**：端口在启动时就定下来，用户在设置里
 * 打开开关时不需要重启应用；开关关闭时所有请求返回 503。
 * 反过来做（关时不监听）会导致每次开关都要重新探测端口、
 * 已经配置好的 CLI 里的地址随之失效。
 */
import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { findAvailablePort } from "./ports";
import { createHttpRequestLogger } from "./middleware/httpRequestLogger";
import {
	createHarnessMcpRouter,
	ensureMcpToken,
	isMcpEnabled,
} from "./routers/harnessMcpRouter";

export interface HarnessMcpServerStatus {
	port: number;
	baseUrl: string;
	/** 给 CLI 用的 MCP 端点 */
	endpoint: string;
	token: string;
}

let current: HarnessMcpServerStatus | null = null;

/** 取当前运行中的反向 MCP 服务状态（IPC handler 要用来生成接入命令）。 */
export function getHarnessMcpStatus(): HarnessMcpServerStatus | null {
	return current;
}

/** token 轮换后刷新内存中的副本，避免旧 token 继续被接受。 */
export function updateHarnessMcpToken(token: string): void {
	if (current) current.token = token;
}

export async function startHarnessMcpServer({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}): Promise<HarnessMcpServerStatus> {
	const port = await findAvailablePort(8790, 10);
	const host = "127.0.0.1";
	const token = await ensureMcpToken(db);

	const app = express();
	// 只允许本机来源；MCP 客户端是本地进程，不需要跨域放行任意站点
	app.use(cors({ origin: false }));
	app.use(express.json({ limit: "8mb" }));
	app.use(createHttpRequestLogger({ logger, service: "aihub-mcp" }));

	app.get("/health", (_req: Request, res: Response) =>
		res.json({ status: "ok", service: "aihub_mcp_server", port }),
	);

	app.use(
		"/mcp",
		createHarnessMcpRouter({
			db,
			logger,
			getToken: () => current?.token ?? token,
			isEnabled: () => isMcpEnabled(db),
		}),
	);

	app.use(
		(
			err: unknown,
			_req: Request,
			res: Response,
			_next: (err: unknown) => void,
		) => {
			const anyErr = err as { message?: string };
			res.status(400).json({ error: anyErr?.message || "Bad Request" });
		},
	);

	const server = await new Promise<import("node:http").Server>((resolve) => {
		const s = app.listen(port, host, () => resolve(s));
	});

	const baseUrl = `http://${host}:${port}`;
	current = { port, baseUrl, endpoint: `${baseUrl}/mcp`, token };

	logger.info({
		msg: "AI Hub MCP server started",
		port,
		host,
		enabled: await isMcpEnabled(db),
	});
	server.on("close", () => {
		logger.info({ msg: "AI Hub MCP server closed", port, host });
		current = null;
	});

	return current;
}
