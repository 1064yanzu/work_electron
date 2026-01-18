import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { ClipStore } from "./store";
import type { ClipPayload, StoredClip } from "./types";

type FileClipStoreOptions = {
	filename?: string;
};

export function createFileClipStore(
	options: FileClipStoreOptions = {},
): ClipStore {
	const filename = options.filename ?? "clip-inbox.jsonl";

	const resolveFilePath = () => {
		const dir = app.getPath("userData");
		return path.join(dir, filename);
	};

	const append: ClipStore["append"] = async (payload: ClipPayload) => {
		const record: StoredClip = {
			id: randomUUID(),
			receivedAt: Date.now(),
			payload: { ...payload, createdAt: payload.createdAt ?? Date.now() },
		};

		const filePath = resolveFilePath();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, "utf8");
		return record;
	};

	const list: ClipStore["list"] = async () => {
		const filePath = resolveFilePath();
		try {
			const content = await fs.readFile(filePath, "utf8");
			const lines = content
				.split("\n")
				.map((line: string) => line.trim())
				.filter((line: string) => line.length > 0);
			const records = lines.map(
				(line: string) => JSON.parse(line) as StoredClip,
			);
			return records;
		} catch (error) {
			if ((error as { code?: string }).code === "ENOENT") return [];
			throw error;
		}
	};

	return { append, list };
}
