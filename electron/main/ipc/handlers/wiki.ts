/**
 * Wiki 知识页面 IPC Handlers（文件系统驱动版）
 * 不再依赖 DbContext，所有操作通过文件系统完成
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	createWikiPage,
	updateWikiPage,
	getWikiPage,
	deleteWikiPage,
	listWikiPages,
	countWikiPages,
	searchWikiPages,
	isWikiEnabled,
	enableWiki,
	disableWiki,
	rebuildWikiWorkspace,
	getWikiSchemaStats,
	resetWikiSkippedSources,
	resetWikiProcessedSources,
} from "../../kb/wikiService";
import { resolvePageFilePath } from "../../kb/wiki/wikiFs";
import { runWikiLint } from "../../kb/wiki/lintService";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createWikiHandlers() {
	const wiki_list_pages: Handler<"wiki_list_pages"> = async (_event, input) => {
		const pages = await listWikiPages(input.scope_path, {
			limit: input.limit,
			offset: input.offset,
		});
		return pages.map((p) => ({
			id: p.id,
			scope_path: p.scope_path,
			title: p.title,
			slug: p.slug,
			content: p.content,
			summary: p.summary,
			tags: p.tags,
			related_page_ids: p.related_page_ids,
			page_type: p.page_type,
			confidence: p.confidence,
			reference_count: p.reference_count,
			last_updated_by: p.last_updated_by,
			created_at: p.created_at,
			updated_at: p.updated_at,
			sources: p.sources,
			status: p.status,
			aliases: p.aliases,
		}));
	};

	const wiki_get_page: Handler<"wiki_get_page"> = async (_event, input) => {
		const page = await getWikiPage(input.scope_path, input.page_id);
		if (!page) return null;
		return {
			id: page.id,
			scope_path: page.scope_path,
			title: page.title,
			slug: page.slug,
			content: page.content,
			summary: page.summary,
			tags: page.tags,
			related_page_ids: page.related_page_ids,
			page_type: page.page_type,
			confidence: page.confidence,
			reference_count: page.reference_count,
			last_updated_by: page.last_updated_by,
			created_at: page.created_at,
			updated_at: page.updated_at,
			sources: page.sources,
			status: page.status,
			aliases: page.aliases,
		};
	};

	const wiki_create_page: Handler<"wiki_create_page"> = async (
		_event,
		input,
	) => {
		const page = await createWikiPage(
			input.scope_path,
			{
				title: input.title,
				content: input.content,
				summary: input.summary,
				tags: input.tags,
				related_page_ids: input.related_page_ids,
				page_type: input.page_type,
				confidence: input.confidence,
				sources: input.sources,
				status: input.status,
				aliases: input.aliases,
			},
			"user",
		);
		return {
			id: page.id,
			scope_path: page.scope_path,
			title: page.title,
			slug: page.slug,
			content: page.content,
			summary: page.summary,
			tags: page.tags,
			related_page_ids: page.related_page_ids,
			page_type: page.page_type,
			confidence: page.confidence,
			created_at: page.created_at,
			updated_at: page.updated_at,
			sources: page.sources,
			status: page.status,
			aliases: page.aliases,
		};
	};

	const wiki_update_page: Handler<"wiki_update_page"> = async (
		_event,
		input,
	) => {
		const page = await updateWikiPage(
			input.scope_path,
			input.page_id,
			{
				title: input.title,
				content: input.content,
				summary: input.summary,
				tags: input.tags,
				related_page_ids: input.related_page_ids,
				page_type: input.page_type,
				confidence: input.confidence,
				sources: input.sources,
				status: input.status,
				aliases: input.aliases,
			},
			"user",
		);
		if (!page) return null;
		return {
			id: page.id,
			scope_path: page.scope_path,
			title: page.title,
			slug: page.slug,
			content: page.content,
			summary: page.summary,
			tags: page.tags,
			related_page_ids: page.related_page_ids,
			page_type: page.page_type,
			confidence: page.confidence,
			created_at: page.created_at,
			updated_at: page.updated_at,
			sources: page.sources,
			status: page.status,
			aliases: page.aliases,
		};
	};

	const wiki_delete_page: Handler<"wiki_delete_page"> = async (
		_event,
		input,
	) => {
		await deleteWikiPage(input.scope_path, input.page_id);
		return { success: true };
	};

	const wiki_search_pages: Handler<"wiki_search_pages"> = async (
		_event,
		input,
	) => {
		const pages = await searchWikiPages(input.scope_path, input.query, {
			limit: input.limit,
		});
		return pages.map((p) => ({
			id: p.id,
			scope_path: p.scope_path,
			title: p.title,
			slug: p.slug,
			content: p.content,
			summary: p.summary,
			tags: p.tags,
			confidence: p.confidence,
			updated_at: p.updated_at,
		}));
	};

	const wiki_count_pages: Handler<"wiki_count_pages"> = async (
		_event,
		input,
	) => {
		const count = await countWikiPages(input.scope_path);
		return { count };
	};

	const wiki_is_enabled: Handler<"wiki_is_enabled"> = async (_event, input) => {
		const enabled = await isWikiEnabled(input.scope_path);
		return { enabled };
	};

	const wiki_enable: Handler<"wiki_enable"> = async (_event, input) => {
		await enableWiki(input.scope_path);
		return { success: true };
	};

	const wiki_disable: Handler<"wiki_disable"> = async (_event, input) => {
		await disableWiki(input.scope_path);
		return { success: true };
	};

	const wiki_rebuild: Handler<"wiki_rebuild"> = async (_event, input) => {
		const result = await rebuildWikiWorkspace(input.scope_path);
		return { success: true, created_map: result.created_map };
	};

	const wiki_get_page_file_path: Handler<"wiki_get_page_file_path"> = async (
		_event,
		input,
	) => {
		const absPath = await resolvePageFilePath(input.scope_path, input.page_id);
		return { path: absPath };
	};

	const wiki_schema_stats: Handler<"wiki_schema_stats"> = async (
		_event,
		input,
	) => {
		return getWikiSchemaStats(input.scope_path);
	};

	const wiki_reset_skipped_sources: Handler<
		"wiki_reset_skipped_sources"
	> = async (_event, input) => {
		const cleared = await resetWikiSkippedSources(input.scope_path);
		return { cleared };
	};

	const wiki_reset_processed_sources: Handler<
		"wiki_reset_processed_sources"
	> = async (_event, input) => {
		const cleared = await resetWikiProcessedSources(input.scope_path);
		return { cleared };
	};

	const wiki_lint: Handler<"wiki_lint"> = async (_event, input) => {
		return runWikiLint(input.scope_path);
	};

	return {
		wiki_list_pages,
		wiki_get_page,
		wiki_create_page,
		wiki_update_page,
		wiki_delete_page,
		wiki_search_pages,
		wiki_count_pages,
		wiki_is_enabled,
		wiki_enable,
		wiki_disable,
		wiki_rebuild,
		wiki_get_page_file_path,
		wiki_schema_stats,
		wiki_reset_skipped_sources,
		wiki_reset_processed_sources,
		wiki_lint,
	};
}
