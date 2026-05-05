import type { WebSearchResult } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function webSearch(payload: {
	query: string;
	engine?: string;
}): Promise<WebSearchResult[]> {
	return await safeInvoke("web_search", { payload });
}
