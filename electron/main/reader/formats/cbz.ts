import path from "node:path";

import StreamZip from "node-stream-zip";

import type { ReaderTocItem } from "../../../shared/ipc-schema";
import type { ChapterContent, FormatHandler, ParsedBook } from "./types";
import { extToMime } from "../coverCache";

const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);

async function openZip(p: string): Promise<StreamZip.StreamZipAsync> {
	return new StreamZip.async({ file: p, storeEntries: true });
}

async function listImages(zip: StreamZip.StreamZipAsync): Promise<string[]> {
	const entries = await zip.entries();
	return Object.values(entries)
		.filter((e) => !e.isDirectory)
		.map((e) => e.name)
		.filter((name) => IMG_EXTS.has(path.extname(name).toLowerCase()))
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

const PAGES_PER_CHUNK = 12;

export const cbzFormatHandler: FormatHandler = {
	format: "cbz",

	async parse(absolutePath): Promise<ParsedBook> {
		const zip = await openZip(absolutePath);
		try {
			const images = await listImages(zip);
			const total = images.length;
			const baseName = path.basename(absolutePath, path.extname(absolutePath));

			const toc: ReaderTocItem[] = [];
			const chunkCount = Math.max(1, Math.ceil(total / PAGES_PER_CHUNK));
			for (let i = 0; i < chunkCount; i++) {
				const startPage = i * PAGES_PER_CHUNK + 1;
				const endPage = Math.min((i + 1) * PAGES_PER_CHUNK, total);
				toc.push({
					id: `chunk-${i}`,
					label: `第 ${startPage}-${endPage} 页`,
					href: `chunk-${i}`,
					level: 1,
				});
			}

			// 封面：第 1 张图
			let cover: ParsedBook["cover"] = null;
			if (images.length > 0) {
				const buf = await zip.entryData(images[0]);
				const ext = path.extname(images[0]).toLowerCase();
				cover = { bytes: new Uint8Array(buf), mime: extToMime(ext) };
			}

			return {
				title: baseName,
				authors: [],
				language: null,
				format: "cbz",
				page_count: total,
				word_count: 0,
				toc,
				metadata: { _images: total },
				full_text: "",
				cover,
			};
		} finally {
			await zip.close();
		}
	},

	async getChapter(absolutePath, chapterId): Promise<ChapterContent> {
		const zip = await openZip(absolutePath);
		try {
			const images = await listImages(zip);
			const total = images.length;
			const m = chapterId.match(/^chunk-(\d+)$/);
			const idx = m ? Number(m[1]) : 0;
			const start = idx * PAGES_PER_CHUNK;
			const end = Math.min(start + PAGES_PER_CHUNK, total);
			const subset = images.slice(start, end);

			const imageItems: NonNullable<ChapterContent["images"]> = [];
			for (const name of subset) {
				const buf = await zip.entryData(name);
				const ext = path.extname(name).toLowerCase();
				const mime = extToMime(ext);
				imageItems.push({
					name,
					data_url: `data:${mime};base64,${buf.toString("base64")}`,
					mime,
				});
			}

			const html = imageItems
				.map(
					(img, i) =>
						`<figure class="cbz-page" data-page="${start + i + 1}"><img src="${img.data_url}" alt="${path.basename(
							img.name,
						)}" /></figure>`,
				)
				.join("\n");

			const chunkCount = Math.max(1, Math.ceil(total / PAGES_PER_CHUNK));
			return {
				id: chapterId,
				title: `第 ${start + 1}-${end} 页`,
				html,
				text: "",
				images: imageItems,
				prev_id: idx > 0 ? `chunk-${idx - 1}` : null,
				next_id: idx < chunkCount - 1 ? `chunk-${idx + 1}` : null,
				word_count: 0,
			};
		} finally {
			await zip.close();
		}
	},
};
