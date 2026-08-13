// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：wiki（共 18 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface WikiIpcSchema {
	// ==================
	// Wiki 知识页面
	// ==================
	/** 列出线程工作目录对应的 Wiki 页面 */
	wiki_list_pages: {
		input: { scope_path: string; limit?: number; offset?: number };
		output: Array<{
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			reference_count: number;
			last_updated_by: string;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		}>;
	};
	/** 获取单个 Wiki 页面 */
	wiki_get_page: {
		input: { scope_path: string; page_id: string };
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			reference_count: number;
			last_updated_by: string;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		} | null;
	};
	/** 创建 Wiki 页面 */
	wiki_create_page: {
		input: {
			scope_path: string;
			title: string;
			content: string;
			summary?: string;
			tags?: string[];
			related_page_ids?: string[];
			page_type?: string;
			confidence?: number;
			sources?: string[];
			status?: "active" | "stub" | "needs-update" | "deprecated";
			aliases?: string[];
		};
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		};
	};
	/** 更新 Wiki 页面 */
	wiki_update_page: {
		input: {
			scope_path: string;
			page_id: string;
			title?: string;
			content?: string;
			summary?: string;
			tags?: string[];
			related_page_ids?: string[];
			page_type?: string;
			confidence?: number;
			sources?: string[];
			status?: "active" | "stub" | "needs-update" | "deprecated";
			aliases?: string[];
		};
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		} | null;
	};
	/** 删除 Wiki 页面 */
	wiki_delete_page: {
		input: { scope_path: string; page_id: string };
		output: { success: boolean };
	};
	/** 搜索 Wiki 页面 */
	wiki_search_pages: {
		input: { scope_path: string; query: string; limit?: number };
		output: Array<{
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			confidence: number;
			updated_at: number;
		}>;
	};
	/** 统计 Wiki 页面数量 */
	wiki_count_pages: {
		input: { scope_path: string };
		output: { count: number };
	};
	/** 检查当前线程工作目录的 Wiki 是否启用 */
	wiki_is_enabled: {
		input: { scope_path: string };
		output: { enabled: boolean };
	};
	/** 启用/初始化当前线程工作目录的 Wiki */
	wiki_enable: {
		input: { scope_path: string };
		output: { success: boolean };
	};
	/** 禁用当前线程工作目录的 Wiki */
	wiki_disable: {
		input: { scope_path: string };
		output: { success: boolean };
	};
	/** 重建当前线程工作目录的 Wiki 目录与默认地图 */
	wiki_rebuild: {
		input: { scope_path: string };
		output: { success: boolean; created_map: boolean };
	};
	/** 获取 Wiki 页面对应的物理文件绝对路径（供文档编辑器打开真实 .md 文件） */
	wiki_get_page_file_path: {
		input: { scope_path: string; page_id: string };
		output: { path: string | null };
	};
	/** AI 生成 Wiki 页面（从知识库源文件提取知识） */
	wiki_generate: {
		input: { scope_path: string; model?: string };
		output: { success: boolean; generated_pages: number };
	};
	/** 查询 Wiki 生成状态 */
	wiki_generation_status: {
		input: Record<string, never>;
		output: {
			is_generating: boolean;
			scope_path: string | null;
			/** 生成管线阶段：preflight/scanning/filtering/extracting/llm/linking/finalizing/idle */
			phase:
				| "idle"
				| "preflight"
				| "scanning"
				| "filtering"
				| "extracting"
				| "llm"
				| "linking"
				| "finalizing";
			total_sources: number;
			processed_sources: number;
			generated_pages: number;
			current_source_title: string | null;
			error: string | null;
			warnings?: string[];
			/** 本轮中被跳过的文件数（内容无法提取 / 提取失败 / LLM 返回空） */
			skipped_count?: number;
			/** schema 累计跳过的文件数（跨轮次，用于 UI 决定是否展示「重试跳过的文件」按钮） */
			total_skipped_in_schema?: number;
		};
	};
	/** 查询 Wiki schema 的统计信息（处理/跳过/实际页面数） */
	wiki_schema_stats: {
		input: { scope_path: string };
		output: {
			processed_count: number;
			skipped_count: number;
			real_page_count: number;
			has_knowledge_map: boolean;
			skipped_files: Array<{
				path: string;
				name: string;
				reason: string;
				reason_detail?: string;
				skipped_at: number;
			}>;
		};
	};
	/** 清空 skipped_sources：让下次生成时重新尝试这些文件 */
	wiki_reset_skipped_sources: {
		input: { scope_path: string };
		output: { cleared: number };
	};
	/** 清空 processed_sources：让下次生成时重新处理所有文件（不影响已生成的页面） */
	wiki_reset_processed_sources: {
		input: { scope_path: string };
		output: { cleared: number };
	};
	/** Wiki 健康检查（Karpathy lint pattern）：孤儿 / stub / 断链 / frontmatter 缺失 / 未摄入源 */
	wiki_lint: {
		input: { scope_path: string };
		output: {
			scope_path: string;
			total_pages: number;
			issues: Array<{
				kind:
					| "orphan"
					| "stub"
					| "broken-link"
					| "frontmatter-missing"
					| "source-no-sources";
				page_slug: string;
				page_title: string;
				detail: string;
			}>;
			counts: {
				orphan: number;
				stub: number;
				"broken-link": number;
				"frontmatter-missing": number;
				"source-no-sources": number;
			};
			un_ingested_sources: Array<{
				path: string;
				name: string;
				size: number;
			}>;
			suggestions: string[];
			ran_at: number;
		};
	};
}
