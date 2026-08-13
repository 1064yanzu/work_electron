// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：webContent（共 5 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { Source } from "./common";

export interface WebContentIpcSchema {
	open_browser_window: {
		input: { url: string };
		output: { success: boolean };
	};
	fetch_page_content: {
		input: { url: string };
		output: {
			url: string;
			title: string;
			content: string;
			description?: string;
			favicon?: string;
		};
	};
	browser_search: {
		input: {
			request: {
				query: string;
				engine: string;
				use_playwright: boolean;
				limit?: number;
			};
		};
		output: Array<{
			title: string;
			snippet: string;
			url: string;
			screenshot?: string;
		}>;
	};
	exa_mcp_search: {
		input: { query: string; limit?: number };
		output: Array<{
			title: string;
			snippet: string;
			url: string;
			screenshot?: string;
		}>;
	};

	// ==================
	// Content Ingest (抓取 / 导入)
	// ==================
	fetch_url_content: {
		input: {
			url: string;
			title?: string;
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
			category?: Source["category"];
		};
		output: Source;
	};
}
