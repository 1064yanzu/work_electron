/**
 * parser worker（Electron utilityProcess 入口）。
 *
 * 承接主进程移出来的重 CPU 解析：EPUB 解析/翻章（JSDOM）、
 * Readability 正文抽取。通过 process.parentPort 与主进程收发消息，
 * 协议见 workers/parserHost.ts：
 *   请求  { id, method, params }
 *   响应  { id, ok: true, result } | { id, ok: false, error }
 *
 * 注意：此文件运行在独立 Node 进程中，禁止使用 electron 运行时 API
 * （类型引用除外），也不要 import 会传递引入 electron 的模块。
 */

import { extractArticleFromHtml } from "../kb/extractArticleFromHtml";
import { getEpubChapter, parseEpub } from "../reader/formats/epubParser";
import type { ReaderTocItem } from "../../shared/ipc-schema";

type WorkerRequest = {
	id: number;
	method: string;
	params: Record<string, unknown>;
};

async function handle(
	method: string,
	params: Record<string, unknown>,
): Promise<unknown> {
	switch (method) {
		case "epub_parse":
			return parseEpub(String(params.filePath));
		case "epub_get_chapter":
			return getEpubChapter(
				String(params.filePath),
				String(params.chapterId ?? ""),
				(params.toc as ReaderTocItem[] | undefined) ?? [],
			);
		case "extract_article":
			return extractArticleFromHtml({
				html: String(params.html ?? ""),
				url: String(params.url ?? "about:blank"),
				titleHint:
					typeof params.titleHint === "string" ? params.titleHint : undefined,
			});
		case "ping":
			return "pong";
		default:
			throw new Error(`UNKNOWN_PARSER_METHOD:${method}`);
	}
}

process.parentPort.on("message", (event) => {
	const msg = event.data as WorkerRequest | undefined;
	if (!msg || typeof msg.id !== "number" || typeof msg.method !== "string") {
		return;
	}

	void (async () => {
		try {
			const result = await handle(msg.method, msg.params ?? {});
			process.parentPort.postMessage({ id: msg.id, ok: true, result });
		} catch (err) {
			process.parentPort.postMessage({
				id: msg.id,
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	})();
});
