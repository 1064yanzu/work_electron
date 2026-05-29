import fs from "node:fs/promises";
import path from "node:path";

import { getCacheDir } from "../storage/cacheRoots";

export function getReaderRoot(): string {
	return getCacheDir("reader-library");
}

export function getBookDir(bookId: string): string {
	return path.join(getReaderRoot(), "books", bookId);
}

export function getCoverPath(bookId: string, ext = ".png"): string {
	return path.join(getReaderRoot(), "covers", `${bookId}${ext}`);
}

export async function ensureReaderDirs(bookId?: string): Promise<void> {
	const root = getReaderRoot();
	await fs.mkdir(path.join(root, "books"), { recursive: true });
	await fs.mkdir(path.join(root, "covers"), { recursive: true });
	if (bookId) {
		await fs.mkdir(getBookDir(bookId), { recursive: true });
	}
}

export async function copyToBookDir(
	bookId: string,
	srcAbsolutePath: string,
): Promise<string> {
	await ensureReaderDirs(bookId);
	const ext = path.extname(srcAbsolutePath) || "";
	const dest = path.join(getBookDir(bookId), `original${ext}`);
	await fs.copyFile(srcAbsolutePath, dest);
	return dest;
}

export async function removeBookDir(bookId: string): Promise<void> {
	const dir = getBookDir(bookId);
	await fs.rm(dir, { recursive: true, force: true });
}
