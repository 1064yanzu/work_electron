// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：reader（共 37 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	ReaderBook,
	ReaderBookmark,
	ReaderCardStatus,
	ReaderChapter,
	ReaderFormat,
	ReaderHighlight,
	ReaderHighlightColor,
	ReaderKnowledgeCard,
	ReaderProgress,
	ReaderSearchHit,
	ReaderSession,
} from "./common";

export interface ReaderIpcSchema {
	// ==================
	// Reader（阅读器）
	// ==================
	/** 导入电子书：解析元数据 + 抽取目录 + 生成封面 + 全文索引 */
	reader_import_files: {
		input: {
			paths: string[];
			project_id?: string | null;
			folder_id?: string | null;
			/**
			 * 静默导入：仅写 reader_books（阅读器自身需要），跳过 sources / notes / note_chunks
			 * 全文索引写入。用于"在阅读器中打开本地文件但不放进资料库"的场景。
			 */
			silent?: boolean;
		};
		output: ReaderBook[];
	};
	/** 列出书架（按 last_opened_at / added_at 排序） */
	reader_list_books: {
		input: {
			format?: ReaderFormat;
			project_id?: string | null;
			limit?: number;
			sort?: "recent" | "added" | "title";
		};
		output: ReaderBook[];
	};
	/** 单本元数据 + TOC */
	reader_get_book: {
		input: { id: string };
		output: ReaderBook | null;
	};
	/** 打开（更新 last_opened_at） */
	reader_open_book: {
		input: { id: string };
		output: { book: ReaderBook; progress: ReaderProgress | null };
	};
	/** 通过资料库 source_id 打开阅读器：先查关联，未关联时尝试用 source 原文件路径补建并关联 */
	reader_open_from_source: {
		input: { source_id: string };
		output: { book: ReaderBook | null };
	};
	/** 删除一本书（不删除底层文件，仅清理书架记录） */
	reader_delete_book: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 取章节内容（HTML / 文本 / 图片序列） */
	reader_get_chapter: {
		input: { book_id: string; chapter_id: string };
		output: ReaderChapter;
	};
	/** 保存阅读位置 */
	reader_save_progress: {
		input: {
			book_id: string;
			locator: string;
			percent: number;
			chapter_id?: string | null;
		};
		output: ReaderProgress;
	};
	/** 书内全文搜索（FTS5） */
	reader_search_in_book: {
		input: { book_id: string; query: string; limit?: number };
		output: ReaderSearchHit[];
	};
	/** 跨书全文搜索（书架范围） */
	reader_search_global: {
		input: { query: string; limit?: number };
		output: ReaderSearchHit[];
	};
	/** 列出某书的高亮 */
	reader_list_highlights: {
		input: { book_id: string };
		output: ReaderHighlight[];
	};
	/** 创建高亮（含可选笔记） */
	reader_create_highlight: {
		input: {
			book_id: string;
			locator_start: string;
			locator_end: string;
			text: string;
			color?: ReaderHighlightColor;
			note?: string | null;
		};
		output: ReaderHighlight;
	};
	/** 更新高亮（颜色 / 笔记） */
	reader_update_highlight: {
		input: {
			id: string;
			color?: ReaderHighlightColor;
			note?: string | null;
		};
		output: ReaderHighlight;
	};
	/** 删除高亮 */
	reader_delete_highlight: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 列出某书的书签 */
	reader_list_bookmarks: {
		input: { book_id: string };
		output: ReaderBookmark[];
	};
	/** 创建书签 */
	reader_create_bookmark: {
		input: { book_id: string; locator: string; label?: string | null };
		output: ReaderBookmark;
	};
	/** 删除书签 */
	reader_delete_bookmark: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 阅读会话开始（用于阅读统计） */
	reader_session_start: {
		input: { book_id: string };
		output: ReaderSession;
	};
	/** 阅读会话结束（写入 duration / pages_read） */
	reader_session_end: {
		input: { session_id: string; pages_read?: number };
		output: ReaderSession;
	};
	/** 列出阅读会话（用于热力图） */
	reader_list_sessions: {
		input: { book_id?: string; days?: number; limit?: number };
		output: ReaderSession[];
	};
	/** 导出某书的高亮与笔记为 Markdown */
	reader_export_highlights: {
		input: { book_id: string; format?: "markdown" };
		output: { content: string; suggested_filename: string };
	};
	/** 获取阅读器全局设置（落 app_config） */
	reader_get_settings: {
		input: Record<string, never>;
		output: {
			theme: string;
			font_family: string;
			font_size: number;
			line_height: number;
			letter_spacing: number;
			column_count: 1 | 2;
			max_width_ch: number;
			page_transition: "slide" | "fade" | "instant";
			auto_hide_chrome_ms: number;
			default_selection_action: "explain" | "translate" | "highlight" | "ask";
			tts_provider: "system" | "openai" | "azure" | "volcano";
			tts_rate: number;
			ai_context_scope: "chapter" | "book";
			disable_notifications_while_reading: boolean;
			/** 卡片生成模型；空字符串表示使用全局活跃模型 */
			card_gen_model: string;
			card_default_count_selection: number;
			card_default_count_chapter: number;
			card_srs_enabled: boolean;
			card_daily_new_limit: number;
		};
	};
	/** 更新阅读器设置 */
	reader_update_settings: {
		input: Partial<{
			theme: string;
			font_family: string;
			font_size: number;
			line_height: number;
			letter_spacing: number;
			column_count: 1 | 2;
			max_width_ch: number;
			page_transition: "slide" | "fade" | "instant";
			auto_hide_chrome_ms: number;
			default_selection_action: "explain" | "translate" | "highlight" | "ask";
			tts_provider: "system" | "openai" | "azure" | "volcano";
			tts_rate: number;
			ai_context_scope: "chapter" | "book";
			disable_notifications_while_reading: boolean;
			/** 卡片生成模型；空字符串表示使用全局活跃模型 */
			card_gen_model: string;
			card_default_count_selection: number;
			card_default_count_chapter: number;
			card_srs_enabled: boolean;
			card_daily_new_limit: number;
		}>;
		output: { success: boolean };
	};
	/** 列出某书的知识卡片 */
	reader_list_cards: {
		input: { book_id: string; chapter_id?: string };
		output: ReaderKnowledgeCard[];
	};
	/** 跨书查询卡片（支持 status / due / tag / 搜索） */
	reader_list_all_cards: {
		input: {
			book_id?: string | null;
			status?: ReaderCardStatus | null;
			due_only?: boolean | null;
			tag?: string | null;
			search?: string | null;
			limit?: number | null;
		};
		output: ReaderKnowledgeCard[];
	};
	/** 列出当前到期需要复习的卡片 */
	reader_list_due_cards: {
		input: { book_id?: string | null; limit?: number | null };
		output: ReaderKnowledgeCard[];
	};
	/** 列出所有已用过的标签（按使用频率降序） */
	reader_list_card_tags: {
		input: { book_id?: string | null };
		output: string[];
	};
	/** 创建知识卡片 */
	reader_create_card: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			question: string;
			answer: string;
			source_text?: string | null;
			locator?: string | null;
			tags?: string[] | null;
			status?: ReaderCardStatus | null;
		};
		output: ReaderKnowledgeCard;
	};
	/** 批量创建草稿卡片（一次划词/章节生成共享 generation_session_id） */
	reader_create_draft_cards: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			locator?: string | null;
			source_text?: string | null;
			generation_session_id: string;
			items: Array<{ question: string; answer: string }>;
		};
		output: ReaderKnowledgeCard[];
	};
	/** 接受草稿卡片（status: draft → active） */
	reader_accept_draft_cards: {
		input: { ids: string[] };
		output: { accepted: number };
	};
	/** 拒绝草稿卡片（删除） */
	reader_reject_draft_cards: {
		input: { ids: string[] };
		output: { rejected: number };
	};
	/** 更新知识卡片（问题 / 答案 / 标签 / 状态） */
	reader_update_card: {
		input: {
			id: string;
			question?: string;
			answer?: string;
			tags?: string[];
			status?: ReaderCardStatus;
		};
		output: ReaderKnowledgeCard;
	};
	/** 单独更新卡片标签 */
	reader_update_card_tags: {
		input: { id: string; tags: string[] };
		output: ReaderKnowledgeCard;
	};
	/** 上报复习结果（SM-2） */
	reader_review_card: {
		input: { id: string; quality: 0 | 1 | 2 };
		output: ReaderKnowledgeCard;
	};
	/** 删除知识卡片 */
	reader_delete_card: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 批量删除知识卡片 */
	reader_delete_cards_bulk: {
		input: { ids: string[] };
		output: { success: boolean; deleted: number };
	};
	/** AI 生成知识卡片（启动 LLM 流，结果通过事件推送） */
	reader_generate_cards: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			text: string;
			count?: number;
		};
		output: { started: boolean };
	};
}
