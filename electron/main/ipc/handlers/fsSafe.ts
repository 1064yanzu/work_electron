import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IpcMainInvokeEvent } from "electron";
import { shell } from "electron";
import { getCacheDir } from "../../storage/cacheRoots";

type ReadFileInput = { path: string; encoding?: "utf-8" | "base64" };
type ReadFileOutput = {
	content: string;
	encoding: string;
	size: number;
	mtime_ms: number;
	path: string;
};

type WriteFileInput = {
	path: string;
	content: string;
	encoding?: "utf-8" | "base64";
	create_dirs?: boolean;
	allow_empty?: boolean;
	expected_mtime_ms?: number;
	expected_size?: number;
};
type WriteFileOutput = {
	success: boolean;
	bytes_written: number;
	size: number;
	mtime_ms: number;
	path: string;
};

type ListFilesInput = { path: string; recursive?: boolean };
type ListFilesOutput = Array<{
	path: string;
	name: string;
	is_file: boolean;
	is_dir: boolean;
	size?: number;
	mtime_ms?: number;
}>;

type MkdirInput = { path: string; recursive?: boolean };
type MkdirOutput = { success: boolean };

type CopyFileInput = { src: string; dest: string; create_dirs?: boolean };
type CopyFileOutput = { success: boolean };
type MoveFileInput = { src: string; dest: string; create_dirs?: boolean };
type MoveFileOutput = { success: boolean };
type DeleteFileInput = { path: string };
type DeleteFileOutput = { success: boolean };
type RevealFileInput = { path: string };
type RevealFileOutput = { success: boolean };

function unwrapPayload<T extends object>(input: T | { payload?: T }): T {
	if (
		input &&
		typeof input === "object" &&
		"payload" in input &&
		input.payload &&
		typeof input.payload === "object"
	) {
		return input.payload as T;
	}
	return input as T;
}

function normalizePathInput(p: string): string {
	const raw = String(p ?? "").trim();
	if (!raw) return "";
	if (raw.includes("\0")) throw new Error("路径非法");

	// 拒绝 http/https URL（不能当作本地文件路径处理）
	if (raw.startsWith("http://") || raw.startsWith("https://")) {
		throw new Error(`不支持远程 URL 路径: ${raw.substring(0, 100)}...`);
	}

	// Support "file://..." (common when UI passes file URLs).
	if (raw.startsWith("file://")) {
		try {
			return fileURLToPath(raw);
		} catch {
			// Fall through to other normalizations.
		}
	}

	// Support "asset://..." (legacy Tauri-like scheme; treat as local file path).
	if (raw.startsWith("asset://")) {
		try {
			const u = new URL(raw);
			let p = decodeURIComponent(u.pathname);
			// `asset:///C:/a.png` -> `/C:/a.png` (trim the leading slash)
			if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
			return p;
		} catch {
			// Fall through to other normalizations.
		}
	}

	// Support "~" and "~/" (common in CLI contexts).
	if (raw === "~") return os.homedir();
	if (raw.startsWith("~/") || raw.startsWith("~\\")) {
		return path.join(os.homedir(), raw.slice(2));
	}

	// Resolve relative paths to absolute
	if (!path.isAbsolute(raw)) {
		return path.resolve(raw);
	}

	return raw;
}

function requireAbsolute(p: string) {
	const normalized = normalizePathInput(p);
	if (!path.isAbsolute(normalized)) {
		throw new Error(`路径必须是绝对路径: ${p} -> ${normalized}`);
	}
}

async function listDirOnce(dirPath: string): Promise<ListFilesOutput> {
	const ents = await fs.readdir(dirPath, { withFileTypes: true });
	const out: ListFilesOutput = [];
	for (const ent of ents) {
		const full = path.join(dirPath, ent.name);
		const is_dir = ent.isDirectory();
		const is_file = ent.isFile();
		let size: number | undefined;
		let mtime_ms: number | undefined;
		try {
			const st = await fs.stat(full);
			if (is_file) size = st.size;
			mtime_ms = st.mtimeMs;
		} catch {}
		out.push({ path: full, name: ent.name, is_file, is_dir, size, mtime_ms });
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
		rawInput: ReadFileInput | { payload?: ReadFileInput },
	): Promise<ReadFileOutput> => {
		const input = unwrapPayload(rawInput);
		const filePath = normalizePathInput(input.path);
		requireAbsolute(filePath);
		const encoding = input.encoding === "base64" ? "base64" : "utf-8";
		const buf = await fs.readFile(filePath);
		const st = await fs.stat(filePath);
		const content =
			encoding === "base64" ? buf.toString("base64") : buf.toString("utf-8");
		return {
			content,
			encoding,
			size: buf.byteLength,
			mtime_ms: st.mtimeMs,
			path: filePath,
		};
	};

	const write_file_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: WriteFileInput | { payload?: WriteFileInput },
	): Promise<WriteFileOutput> => {
		const input = unwrapPayload(rawInput);
		const filePath = normalizePathInput(input.path);
		requireAbsolute(filePath);
		const encoding = input.encoding === "base64" ? "base64" : "utf-8";
		const createDirs = Boolean(input.create_dirs);
		if (createDirs) {
			await fs.mkdir(path.dirname(filePath), { recursive: true });
		}
		let existingStat: Awaited<ReturnType<typeof fs.stat>> | null = null;
		try {
			existingStat = await fs.stat(filePath);
			if (existingStat.isDirectory()) {
				throw new Error(`目标路径是文件夹，不能写入文件: ${filePath}`);
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException)?.code;
			if (code !== "ENOENT") throw error;
		}
		const buf =
			encoding === "base64"
				? Buffer.from(String(input.content ?? ""), "base64")
				: Buffer.from(String(input.content ?? ""), "utf-8");

		if (buf.length === 0 && existingStat && existingStat.size > 0) {
			if (!input.allow_empty) {
				throw new Error(
					`拒绝用 0 字节内容覆盖已有文件: ${filePath}。如果这是用户显式清空文件，请传入 allow_empty=true。`,
				);
			}
		}

		if (
			typeof input.expected_size === "number" &&
			existingStat &&
			existingStat.size !== input.expected_size
		) {
			throw new Error(
				`文件已在外部变化，已取消写入: ${filePath}（读取时 ${input.expected_size} bytes，当前 ${existingStat.size} bytes）`,
			);
		}

		if (
			typeof input.expected_mtime_ms === "number" &&
			existingStat &&
			Math.abs(existingStat.mtimeMs - input.expected_mtime_ms) > 2
		) {
			throw new Error(
				`文件已在外部变化，已取消写入: ${filePath}（mtime 不匹配）`,
			);
		}

		const dir = path.dirname(filePath);
		const tmpPath = path.join(
			dir,
			`.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
		);
		try {
			await fs.writeFile(tmpPath, buf);
			if (existingStat) {
				await fs.chmod(tmpPath, existingStat.mode);
			}
			await fs.rename(tmpPath, filePath);
		} catch (error) {
			try {
				await fs.rm(tmpPath, { force: true });
			} catch {}
			throw error;
		}
		const nextStat = await fs.stat(filePath);
		console.log(
			`[write_file_safe] Written ${buf.length} bytes to: ${filePath}`,
		);
		return {
			success: true,
			bytes_written: buf.length,
			size: nextStat.size,
			mtime_ms: nextStat.mtimeMs,
			path: filePath,
		};
	};

	const list_files_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: ListFilesInput | { payload?: ListFilesInput },
	): Promise<ListFilesOutput> => {
		const input = unwrapPayload(rawInput);
		const targetPath = normalizePathInput(input.path);
		requireAbsolute(targetPath);
		const recursive = Boolean(input.recursive);

		let st: Awaited<ReturnType<typeof fs.stat>>;
		try {
			st = await fs.stat(targetPath);
		} catch (err) {
			// 目录不存在（已被清理/尚未创建）→ 返回空数组，不抛错
			if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
				return [];
			}
			throw err;
		}

		if (!st.isDirectory()) {
			const name = path.basename(targetPath);
			return [
				{
					path: targetPath,
					name,
					is_file: st.isFile(),
					is_dir: st.isDirectory(),
					size: st.isFile() ? st.size : undefined,
					mtime_ms: st.mtimeMs,
				},
			];
		}

		return recursive ? listDirRecursive(targetPath) : listDirOnce(targetPath);
	};

	const mkdir_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: MkdirInput | { payload?: MkdirInput },
	): Promise<MkdirOutput> => {
		const input = unwrapPayload(rawInput);
		const dirPath = normalizePathInput(input.path);
		requireAbsolute(dirPath);
		const recursive = input.recursive !== false;
		await fs.mkdir(dirPath, { recursive });
		return { success: true };
	};

	const copy_file_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: CopyFileInput | { payload?: CopyFileInput },
	): Promise<CopyFileOutput> => {
		const input = unwrapPayload(rawInput);
		const src = normalizePathInput(input.src);
		const dest = normalizePathInput(input.dest);
		requireAbsolute(src);
		requireAbsolute(dest);
		const createDirs = Boolean(input.create_dirs);
		if (createDirs) {
			await fs.mkdir(path.dirname(dest), { recursive: true });
		}
		await fs.copyFile(src, dest);
		return { success: true };
	};

	const move_file_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: MoveFileInput | { payload?: MoveFileInput },
	): Promise<MoveFileOutput> => {
		const input = unwrapPayload(rawInput);
		const src = normalizePathInput(input.src);
		const dest = normalizePathInput(input.dest);
		requireAbsolute(src);
		requireAbsolute(dest);
		if (input.create_dirs) {
			await fs.mkdir(path.dirname(dest), { recursive: true });
		}
		try {
			await fs.rename(src, dest);
		} catch {
			await fs.copyFile(src, dest);
			await fs.unlink(src);
		}
		return { success: true };
	};

	const delete_file_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: DeleteFileInput | { payload?: DeleteFileInput },
	): Promise<DeleteFileOutput> => {
		const input = unwrapPayload(rawInput);
		const filePath = normalizePathInput(input.path);
		requireAbsolute(filePath);
		await fs.rm(filePath, { force: true, recursive: true });
		return { success: true };
	};

	const reveal_file_safe = async (
		_event: IpcMainInvokeEvent,
		rawInput: RevealFileInput | { payload?: RevealFileInput },
	): Promise<RevealFileOutput> => {
		const input = unwrapPayload(rawInput);
		const filePath = normalizePathInput(input.path);
		requireAbsolute(filePath);
		shell.showItemInFolder(filePath);
		return { success: true };
	};

	// 简化版读取 UTF-8 文件内容
	const read_file_utf8 = async (
		_event: IpcMainInvokeEvent,
		input: { path: string },
	): Promise<string> => {
		const filePath = normalizePathInput(input.path);
		requireAbsolute(filePath);
		const content = await fs.readFile(filePath, "utf-8");
		return content;
	};

	// 保存 base64 图片到文件
	const save_base64_image = async (
		_event: IpcMainInvokeEvent,
		input: { base64Data: string; fileName?: string },
	): Promise<string | null> => {
		try {
			const base64Data = String(input.base64Data || "");
			if (!base64Data) return null;

			// 解析 data URL
			const match = base64Data.match(/^data:image\/([a-z]+);base64,(.+)$/i);
			if (!match) return null;

			const ext = match[1] || "jpg";
			const rawBase64 = match[2];

			// 生成保存路径
			const fileName = input.fileName || `image-${Date.now()}.${ext}`;
			const saveDir = getCacheDir("generated-images");
			await fs.mkdir(saveDir, { recursive: true });
			const savePath = path.join(saveDir, fileName);

			// 保存文件
			const buffer = Buffer.from(rawBase64, "base64");
			await fs.writeFile(savePath, buffer);
			console.log(
				`[save_base64_image] Saved ${buffer.length} bytes to: ${savePath}`,
			);

			return savePath;
		} catch (err) {
			console.error("[save_base64_image] Error:", err);
			return null;
		}
	};

	return {
		read_file_safe,
		write_file_safe,
		list_files_safe,
		mkdir_safe,
		copy_file_safe,
		move_file_safe,
		delete_file_safe,
		reveal_file_safe,
		read_file_utf8,
		save_base64_image,
	};
}
