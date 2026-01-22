import cors from "cors";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import { findAvailablePort } from "./ports";
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

	const app = express();
	app.use(cors());
	app.use(express.json({ limit: "10mb" }));
	app.use(createHttpRequestLogger({ logger, service: "clip" }));

	app.get("/health", (_req: Request, res: Response) =>
		res.json({ status: "ok", service: "clip_server", port }),
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

	return { port, baseUrl };
}
