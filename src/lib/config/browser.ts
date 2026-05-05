import { invoke } from "../tauriCompat";

export interface BrowserSearchRequest {
	query: string;
	engine: string;
	use_playwright: boolean;
	limit?: number;
}

export interface BrowserSearchResult {
	title: string;
	snippet: string;
	url: string;
	screenshot?: string;
}

export async function browserSearch(
	request: BrowserSearchRequest,
): Promise<BrowserSearchResult[]> {
	return invoke("browser_search", { request });
}

export interface PageContent {
	url: string;
	title: string;
	content: string;
	description?: string;
	favicon?: string;
	html?: string;
}

/** 获取页面内容（阅读模式） */
export async function fetchPageContent(url: string): Promise<PageContent> {
	return invoke("fetch_page_content", { url });
}

/** 打开内置浏览器窗口 */
export async function openBrowserWindow(url: string): Promise<void> {
	return invoke("open_browser_window", { url });
}
