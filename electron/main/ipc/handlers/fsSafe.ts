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

type MkdirInput = { path: string; recursive?: boolean };
type MkdirOutput = { success: boolean };

type CopyFileInput = { src: string; dest: string; create_dirs?: boolean };
type CopyFileOutput = { success: boolean };

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
			} catch { }
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
		console.log(`[write_file_safe] Written ${buf.length} bytes to: ${filePath}`);
		return { success: true };
	};

	const list_files_safe = async (
		_event: IpcMainInvokeEvent,
		input: ListFilesInput,
	): Promise<ListFilesOutput> => {
		const targetPath = String(input.path ?? "").trim();
		requireAbsolute(targetPath);
		const recursive = Boolean(input.recursive);
		const st = await fs.stat(targetPath);

		if (!st.isDirectory()) {
			const name = path.basename(targetPath);
			return [
				{
					path: targetPath,
					name,
					is_file: st.isFile(),
					is_dir: st.isDirectory(),
					size: st.isFile() ? st.size : undefined,
				},
			];
		}

		return recursive ? listDirRecursive(targetPath) : listDirOnce(targetPath);
	};

	const mkdir_safe = async (
		_event: IpcMainInvokeEvent,
		input: MkdirInput,
	): Promise<MkdirOutput> => {
		const dirPath = String(input.path ?? "").trim();
		requireAbsolute(dirPath);
		const recursive = input.recursive !== false;
		await fs.mkdir(dirPath, { recursive });
		return { success: true };
	};

	const copy_file_safe = async (
		_event: IpcMainInvokeEvent,
		input: CopyFileInput,
	): Promise<CopyFileOutput> => {
		const src = String(input.src ?? "").trim();
		const dest = String(input.dest ?? "").trim();
		requireAbsolute(src);
		requireAbsolute(dest);
		const createDirs = Boolean(input.create_dirs);
		if (createDirs) {
			await fs.mkdir(path.dirname(dest), { recursive: true });
		}
		await fs.copyFile(src, dest);
		return { success: true };
	};

	return {
		read_file_safe,
		write_file_safe,
		list_files_safe,
		mkdir_safe,
		copy_file_safe,
	};
}
