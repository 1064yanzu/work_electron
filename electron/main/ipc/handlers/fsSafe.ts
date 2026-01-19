import fs from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";

type ReadFileInput = { path: string; encoding?: "utf-8" | "base64" };
type ReadFileOutput = { content: string; encoding: string; size: number };

type WriteFileInput = {
	path: string;
	content: string;
	encoding?: "utf-8" | "base64";
	create_dirs?: boolean;
};
type WriteFileOutput = { success: boolean };

type ListFilesInput = { path: string; recursive?: boolean };
type ListFilesOutput = Array<{
	path: string;
	name: string;
	is_file: boolean;
	is_dir: boolean;
	size?: number;
}>;

function requireAbsolute(p: string) {
	if (!path.isAbsolute(p)) throw new Error("路径必须是绝对路径");
	if (p.includes("\0")) throw new Error("路径非法");
}

async function listDirOnce(dirPath: string): Promise<ListFilesOutput> {
	const ents = await fs.readdir(dirPath, { withFileTypes: true });
	const out: ListFilesOutput = [];
	for (const ent of ents) {
		const full = path.join(dirPath, ent.name);
		const is_dir = ent.isDirectory();
		const is_file = ent.isFile();
		let size: number | undefined;
		if (is_file) {
			try {
				const st = await fs.stat(full);
				size = st.size;
			} catch {}
		}
		out.push({ path: full, name: ent.name, is_file, is_dir, size });
	}
	return out;
}

async function listDirRecursive(dirPath: string): Promise<ListFilesOutput> {
	const result: ListFilesOutput = [];
	const queue: string[] = [dirPath];
	while (queue.length) {
		const current = queue.shift() as string;
		const entries = await listDirOnce(current);
		for (const e of entries) {
			result.push(e);
			if (e.is_dir) queue.push(e.path);
		}
	}
	return result;
}

export function createFsSafeHandlers() {
	const read_file_safe = async (
		_event: IpcMainInvokeEvent,
		input: ReadFileInput,
	): Promise<ReadFileOutput> => {
		const filePath = String(input.path ?? "").trim();
		requireAbsolute(filePath);
		const encoding = input.encoding === "base64" ? "base64" : "utf-8";
		const buf = await fs.readFile(filePath);
		const content =
			encoding === "base64" ? buf.toString("base64") : buf.toString("utf-8");
		return { content, encoding, size: buf.byteLength };
	};

	const write_file_safe = async (
		_event: IpcMainInvokeEvent,
		input: WriteFileInput,
	): Promise<WriteFileOutput> => {
		const filePath = String(input.path ?? "").trim();
		requireAbsolute(filePath);
		const encoding = input.encoding === "base64" ? "base64" : "utf-8";
		const createDirs = Boolean(input.create_dirs);
		if (createDirs) {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
		}
		const buf =
			encoding === "base64"
				? Buffer.from(String(input.content ?? ""), "base64")
				: Buffer.from(String(input.content ?? ""), "utf-8");
		await fs.writeFile(filePath, buf);
		return { success: true };
	};

	const list_files_safe = async (
		_event: IpcMainInvokeEvent,
		input: ListFilesInput,
	): Promise<ListFilesOutput> => {
		const dirPath = String(input.path ?? "").trim();
		requireAbsolute(dirPath);
		const recursive = Boolean(input.recursive);
		const st = await fs.stat(dirPath);
		if (!st.isDirectory()) throw new Error("路径不是目录");
		return recursive ? listDirRecursive(dirPath) : listDirOnce(dirPath);
	};

	return { read_file_safe, write_file_safe, list_files_safe };
}
