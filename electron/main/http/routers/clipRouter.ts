import type { Request, Response } from "express";
import { Router } from "express";
import { createFileClipStore } from "../../clip/fileClipStore";
import type { DbContext } from "../../db/client";
import { normalizeClipRequest } from "../../clip/normalizeClipRequest";
import { ingestClipToDb } from "../../kb/ingestClip";
import type { Logger } from "../../logging/types";

export function createClipRouter({
	logger,
	db,
	port,
}: {
	logger: Logger;
	db: DbContext;
	port: number;
}) {
	const router = Router();
	const store = createFileClipStore();

	router.get("/health", (_req: Request, res: Response) => {
		res.json({
			status: "ok",
			service: "clip_server",
			port,
		});
	});

	router.get("/port", (_req: Request, res: Response) => {
		res.json({ port });
	});

	router.post("/clip", async (req: Request, res: Response) => {
		const normalized = normalizeClipRequest(req.body);
		if (!normalized.ok) {
			res.status(400).json({ error: normalized.error });
			return;
		}

		const record = await store.append(normalized.payload);

		try {
			await ingestClipToDb(db, record);
			logger.info({
				msg: "clip received",
				id: record.id,
				url: normalized.payload.url,
			});
			res.json({ source_id: record.id, status: "ok" });
		} catch (error) {
			logger.error({ msg: "clip ingest failed", error: String(error) });
			res.status(500).json({ error: "ingest failed" });
		}
	});

	return router;
}
