import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { app } from "electron";

type SaveTempFileInput = {
	payload: {
		content: string;
		extension?: string;
		prefix?: string;
	};
};

type SaveTempFileOutput = {
	path: string;
	size: number;
};

function sanitizeExtension(ext: string) {
	const normalized = ext.trim().replace(/^\./, "");
	if (!normalized) return "txt";
	// 只允许安全字符，避免路径注入
	if (!/^[a-zA-Z0-9_-]{1,16}$/.test(normalized)) return "txt";
	return normalized;
}

function sanitizePrefix(prefix: string) {
	const normalized = prefix.trim();
	if (!normalized) return "tmp";
	if (!/^[a-zA-Z0-9_-]{1,32}$/.test(normalized)) return "tmp";
	return normalized;
}

export function createTempFileHandlers() {
	const save_temp_file = async (
		_event: IpcMainInvokeEvent,
		input: SaveTempFileInput,
	): Promise<SaveTempFileOutput> => {
		const content = String(input?.payload?.content ?? "");
		const ext = sanitizeExtension(String(input?.payload?.extension ?? "txt"));
		const prefix = sanitizePrefix(String(input?.payload?.prefix ?? "tmp"));

		const baseDir = path.join(app.getPath("temp"), "ipo-workbench");
		await fs.mkdir(baseDir, { recursive: true });

		const fileName = `${prefix}-${randomUUID()}.${ext}`;
		const filePath = path.join(baseDir, fileName);

		const buf = Buffer.from(content, "utf-8");
		await fs.writeFile(filePath, buf);

		return { path: filePath, size: buf.byteLength };
	};

	return { save_temp_file };
}
