import { BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

const openWindows = new Set<BrowserWindow>();

function normalizeUrl(input: string): string {
	const url = String(input || "").trim();
	if (!url) return url;
	if (/^(https?:\/\/|file:\/\/)/i.test(url)) return url;
	return `https://${url}`;
}

function createViewerWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 900,
		show: true,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	win.webContents.setUserAgent(
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	);
	win.webContents.setWindowOpenHandler(({ url }) => {
		void win.loadURL(url);
		return { action: "deny" };
	});
	openWindows.add(win);
	win.on("closed", () => openWindows.delete(win));
	return win;
}

async function waitForLoad(win: BrowserWindow, timeoutMs: number) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("load timeout"));
		}, timeoutMs);

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
}

async function extractPageContent(
	url: string,
): Promise<IPCSchema["fetch_page_content"]["output"]> {
	const targetUrl = normalizeUrl(url);
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

	try {
		void win.loadURL(targetUrl);
		await waitForLoad(win, 30_000);
		await new Promise((r) => setTimeout(r, 500));

		const script = `
      (() => {
        const pick = (sel) => document.querySelector(sel);
        const title = (document.title || '').trim();
        const description =
          (pick('meta[name="description"]')?.getAttribute('content') || '').trim() ||
          (pick('meta[property="og:description"]')?.getAttribute('content') || '').trim();
        const favicon =
          pick('link[rel="icon"]')?.href ||
          pick('link[rel="shortcut icon"]')?.href ||
          pick('link[rel~="icon"]')?.href ||
          '';

        const mainEl =
          pick('article') ||
          pick('main') ||
          pick('#content') ||
          pick('[role="main"]') ||
          document.body;

        const raw = (mainEl?.innerText || '').replace(/\\u00A0/g, ' ');
        const content = raw.split('\\n').map((l) => l.trim()).filter(Boolean).join('\\n\\n');
        return { title, description, content, favicon };
      })();
    `;

		const extracted = (await win.webContents.executeJavaScript(script)) as {
			title: string;
			description?: string;
			content: string;
			favicon?: string;
		};

		const finalUrl = win.webContents.getURL() || targetUrl;
		return {
			url: finalUrl,
			title: extracted.title || finalUrl,
			content: extracted.content || "",
			description: extracted.description || undefined,
			favicon: extracted.favicon || undefined,
		};
	} finally {
		win.destroy();
	}
}

export function createWebContentHandlers() {
	return {
		open_browser_window: (async (_event, input) => {
			const url = normalizeUrl(input.url);
			if (!url) return { success: false };
			const win = createViewerWindow();
			await win.loadURL(url);
			return { success: true };
		}) satisfies Handler<"open_browser_window">,

		fetch_page_content: (async (_event, input) => {
			if (!input.url) {
				return {
					url: "",
					title: "",
					content: "",
				};
			}
			return extractPageContent(input.url);
		}) satisfies Handler<"fetch_page_content">,
	};
}
