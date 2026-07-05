/**
 * Readability 正文抽取的异步分发入口。
 *
 * 纯实现在 ./extractArticleFromHtml.ts（JSDOM + Readability，主进程与
 * parser worker 共享）。这里经 workers/parserHost 优先派发到 utilityProcess，
 * 避免大页面解析冻结主进程主线程；worker 不可用时自动降级内联执行。
 */

import { dispatchParser } from "../workers/parserHost";
import {
	extractArticleFromHtml,
	type ExtractedArticle,
} from "./extractArticleFromHtml";

const EXTRACT_TIMEOUT_MS = 30_000;

export async function extractArticle(input: {
	html: string;
	url: string;
	titleHint?: string;
}): Promise<ExtractedArticle> {
	return dispatchParser<ExtractedArticle>(
		"extract_article",
		{ html: input.html, url: input.url, titleHint: input.titleHint },
		{
			timeoutMs: EXTRACT_TIMEOUT_MS,
			inline: () => extractArticleFromHtml(input),
		},
	);
}
