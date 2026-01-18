import type { Request, Response } from "express";
import { Router } from "express";
import { createFileClipStore } from "../../clip/fileClipStore";
import type { ClipPayload } from "../../clip/types";
import type { DbContext } from "../../db/client";
import { ingestClipToDb } from "../../kb/ingestClip";
import type { Logger } from "../../logging/types";

export function createClipRouter({
	logger,
	db,
}: {
	logger: Logger;
	db: DbContext;
}) {
	const router = Router();
	const store = createFileClipStore();

	router.get("/health", (_req: Request, res: Response) => {
		res.json({ ok: true, service: "clip", ts: Date.now() });
	});

	router.post("/clip", async (req: Request, res: Response) => {
		const payload = req.body as ClipPayload;
		const record = await store.append(payload);
		const ingest = await ingestClipToDb(db, record);
		logger.info({ msg: "clip received", id: record.id, url: payload.url });
		res.json({
			ok: true,
			id: record.id,
			receivedAt: record.receivedAt,
			ingest,
		});
	});

	return router;
}
