import { BrowserWindow, net } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export type BrowserSearchRequest =
	IPCSchema["browser_search"]["input"]["request"];
export type BrowserSearchResult = IPCSchema["browser_search"]["output"][number];

function guessMarket() {
	const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
	if (locale.includes("zh"))
		return {
			bingMkt: "zh-CN",
			cc: "CN",
			lang: "zh-hans",
			googleHl: "zh-CN",
			googleGl: "CN",
		};
	if (locale.includes("ja"))
		return {
			bingMkt: "ja-JP",
			cc: "JP",
			lang: "ja",
			googleHl: "ja",
			googleGl: "JP",
		};
	if (locale.includes("ko"))
		return {
			bingMkt: "ko-KR",
			cc: "KR",
			lang: "ko",
			googleHl: "ko",
			googleGl: "KR",
		};
	return {
		bingMkt: "en-US",
		cc: "US",
		lang: "en",
		googleHl: "en",
		googleGl: "US",
	};
}

async function fetchHtml(url: string) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 20_000);
	try {
		const res = await net.fetch(url, {
			method: "GET",
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "text/html",
			},
			signal: controller.signal,
		});

		if (!res.ok) {
			throw new Error(`http ${res.status}`);
		}
		return await res.text();
	} finally {
		clearTimeout(timer);
	}
}

function postProcessResults(
	results: Array<{ title: string; url: string; snippet: string }>,
) {
	const seenUrl = new Set<string>();
	const hostCounts = new Map<string, number>();
	const capPerHost = 3;

	const normalized: Array<{ title: string; url: string; snippet: string }> = [];
	for (const r of results) {
		const url = r.url?.trim();
		if (!url) continue;
		if (seenUrl.has(url)) continue;

		let host = "";
		try {
			host = new URL(url).hostname;
		} catch {
			continue;
		}

		const count = hostCounts.get(host) ?? 0;
		if (count >= capPerHost) continue;
		hostCounts.set(host, count + 1);

		seenUrl.add(url);
		normalized.push(r);
	}

	return normalized;
}

async function chromiumDomSearch(options: {
	engine: string;
	query: string;
	limit: number;
	market: ReturnType<typeof guessMarket>;
}) {
	const { engine, query, limit, market } = options;

	const searchUrl = (() => {
		switch (engine) {
			case "google":
				return `https://www.google.com/search?hl=${encodeURIComponent(market.googleHl)}&gl=${encodeURIComponent(market.googleGl)}&num=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(query)}`;
			case "bing":
				return `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${encodeURIComponent(String(limit))}&mkt=${encodeURIComponent(market.bingMkt)}&setlang=${encodeURIComponent(market.lang)}&cc=${encodeURIComponent(market.cc)}`;
			case "baidu":
				return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
			case "duckduckgo":
			case "ddg":
			default:
				return `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kl=cn-zh`;
		}
	})();

	const win = new BrowserWindow({
		show: false,
		width: 1200,
		height: 900,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	win.webContents.setUserAgent(
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	);

	const waitForLoad = () =>
		new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error("browser_search timeout"));
			}, 25_000);

			const cleanup = () => {
				clearTimeout(timer);
				win.webContents.removeListener("did-fail-load", onFail);
				win.webContents.removeListener("did-finish-load", onFinish);
			};

			const onFail = (
				_event: unknown,
				errorCode: number,
				errorDescription: string,
			) => {
				cleanup();
				reject(new Error(`${errorCode}: ${errorDescription}`));
			};

			const onFinish = () => {
				cleanup();
				resolve();
			};

			win.webContents.once("did-fail-load", onFail);
			win.webContents.once("did-finish-load", onFinish);
		});

	try {
		void win.loadURL(searchUrl);
		await waitForLoad();

		const script = `
      (() => {
        const engine = ${JSON.stringify(engine)};
        const limit = ${JSON.stringify(limit)};

        const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();

        const take = (items) => items.filter((x) => x && x.title && x.url).slice(0, limit);

        if (engine === 'bing') {
          const items = Array.from(document.querySelectorAll('li.b_algo')).map((li) => {
            const a = li.querySelector('h2 a');
            const p = li.querySelector('p');
            const url = a?.href || '';
            const title = norm(a?.textContent || '');
            const snippet = norm(p?.textContent || '');
            return { title, url, snippet };
          });
          return take(items);
        }

        if (engine === 'google') {
          const anchors = Array.from(document.querySelectorAll('a')).filter((a) => a.querySelector('h3'));
          const items = anchors.map((a) => {
            const h3 = a.querySelector('h3');
            const title = norm(h3?.textContent || '');
            const url = a.href || '';
            let snippet = '';
            const container = a.closest('div')?.parentElement;
            if (container) {
              const snippetEl = container.querySelector('div.VwiC3b, span.aCOpRe');
              snippet = norm(snippetEl?.textContent || '');
            }
            return { title, url, snippet };
          }).filter((x) => {
            if (!x.url) return false;
            if (x.url.startsWith('https://www.google.com/search')) return false;
            if (x.url.includes('/preferences')) return false;
            return true;
          });
          return take(items);
        }

        if (engine === 'baidu') {
          const items = Array.from(document.querySelectorAll('#content_left .result')).map((el) => {
            const a = el.querySelector('h3 a');
            const abs = el.querySelector('.c-abstract');
            const url = a?.href || '';
            const title = norm(a?.textContent || '');
            const snippet = norm(abs?.textContent || '');
            return { title, url, snippet };
          });
          return take(items);
        }

        // duckduckgo / fallback
        const ddgLinks = Array.from(document.querySelectorAll('a[data-testid="result-title-a"], a.result__a'));
        const items = ddgLinks.map((a) => {
          const url = a.href || '';
          const title = norm(a.textContent || '');
          let snippet = '';
          const parent = a.closest('article, .result') || a.parentElement;
          if (parent) {
            const sn = parent.querySelector('[data-testid="result-snippet"], .result__snippet');
            snippet = norm(sn?.textContent || '');
          }
          return { title, url, snippet };
        });
        return take(items);
      })();
    `;

		const results = (await win.webContents.executeJavaScript(script)) as Array<{
			title: string;
			url: string;
			snippet: string;
		}>;
		return postProcessResults(results);
	} finally {
		win.destroy();
	}
}

function stripTags(html: string) {
	return html.replace(/<[^>]*>/g, " ");
}

function decodeEntities(text: string) {
	return text
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&nbsp;", " ");
}

function normalizeText(text: string) {
	return decodeEntities(stripTags(text)).replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string) {
	const trimmed = url.trim();
	if (!trimmed) return "";
	if (trimmed.startsWith("//")) return `https:${trimmed}`;
	return trimmed;
}

async function duckDuckGoSearch(query: string, limit: number) {
	const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
	const html = await fetchHtml(url);

	const results: Array<{ title: string; snippet: string; url: string }> = [];
	const linkRe =
		/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

	let match: RegExpExecArray | null = null;
	while ((match = linkRe.exec(html)) !== null) {
		if (results.length >= limit) break;

		const rawUrl = normalizeUrl(match[1] ?? "");
		const title = normalizeText(match[2] ?? "");
		if (!rawUrl || !title) continue;

		const probe = html.slice(linkRe.lastIndex, linkRe.lastIndex + 1500);
		const snippetMatch =
			probe.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) ??
			probe.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
		const snippet = normalizeText(snippetMatch?.[1] ?? "");

		results.push({ title, snippet, url: rawUrl });
	}

	return results;
}

async function bingSearch(query: string, limit: number) {
	const market = guessMarket();
	const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${encodeURIComponent(String(limit))}&mkt=${encodeURIComponent(market.bingMkt)}&setlang=${encodeURIComponent(market.lang)}&cc=${encodeURIComponent(market.cc)}`;
	const html = await fetchHtml(url);

	const results: Array<{ title: string; snippet: string; url: string }> = [];
	const itemRe =
		/<li[^>]+class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;

	let match: RegExpExecArray | null = null;
	while ((match = itemRe.exec(html)) !== null) {
		if (results.length >= limit) break;
		const rawUrl = normalizeUrl(match[1] ?? "");
		const title = normalizeText(match[2] ?? "");
		const snippet = normalizeText(match[3] ?? "");
		if (!rawUrl || !title) continue;
		results.push({ title, snippet, url: rawUrl });
	}

	return postProcessResults(results);
}

async function googleSearch(query: string, limit: number) {
	const market = guessMarket();
	const url = `https://www.google.com/search?hl=${encodeURIComponent(market.googleHl)}&gl=${encodeURIComponent(market.googleGl)}&num=${encodeURIComponent(String(limit))}&q=${encodeURIComponent(query)}`;
	const html = await fetchHtml(url);

	const results: Array<{ title: string; snippet: string; url: string }> = [];
	const itemRe =
		/<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;

	let match: RegExpExecArray | null = null;
	while ((match = itemRe.exec(html)) !== null) {
		if (results.length >= limit) break;

		const rawUrl = decodeURIComponent(match[1] ?? "");
		const title = normalizeText(match[2] ?? "");
		if (!rawUrl || !title) continue;

		const probe = html.slice(itemRe.lastIndex, itemRe.lastIndex + 2500);
		const snippetMatch =
			probe.match(/<div[^>]+class="VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>/) ??
			probe.match(/<span[^>]+class="aCOpRe"[^>]*>([\s\S]*?)<\/span>/);
		const snippet = normalizeText(snippetMatch?.[1] ?? "");

		results.push({ title, snippet, url: rawUrl });
	}

	return postProcessResults(results);
}

export async function runBrowserSearch(
	request: Partial<BrowserSearchRequest> | undefined,
): Promise<BrowserSearchResult[]> {
	const query = request?.query?.trim() ?? "";
	if (!query) return [];

	const engine = (request?.engine ?? "duckduckgo").toLowerCase();
	const limit =
		typeof request?.limit === "number" && request.limit > 0
			? Math.min(50, Math.floor(request.limit))
			: 10;
	const usePlaywright = Boolean(request?.use_playwright);
	const market = guessMarket();

	if (usePlaywright) {
		return chromiumDomSearch({ engine, query, limit, market });
	}

	try {
		if (engine === "duckduckgo" || engine === "ddg") {
			return duckDuckGoSearch(query, limit);
		}

		if (engine === "bing") {
			return bingSearch(query, limit);
		}

		if (engine === "google") {
			return googleSearch(query, limit);
		}

		if (engine === "baidu") {
			return chromiumDomSearch({ engine, query, limit, market });
		}

		return duckDuckGoSearch(query, limit);
	} catch {
		return chromiumDomSearch({ engine, query, limit, market });
	}
}

export function createBrowserSearchHandlers() {
	const browserSearch: Handler<"browser_search"> = async (_event, input) => {
		return runBrowserSearch(input.request);
	};

	return { browser_search: browserSearch };
}
