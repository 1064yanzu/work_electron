/**
 * Wiki 数据 Hook - 封装 Wiki 页面的增删改查
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "../../lib/tauriCompat";
import { listen } from "../../lib/tauriEventCompat";

export interface WikiPageItem {
	id: string;
	scope_path: string;
	title: string;
	slug: string;
	content: string;
	summary: string;
	tags: string[];
	confidence: number;
	reference_count: number;
	last_updated_by: string;
	created_at: number;
	updated_at: number;
	/** entity | concept | summary | workflow */
	page_type?: string;
	/** IDs of related pages, used for building graph edges */
	related_page_ids?: string[];
}

/** 后端推送的生成进度 */
export interface WikiGenerationProgress {
	is_generating: boolean;
	scope_path: string | null;
	total_sources: number;
	processed_sources: number;
	generated_pages: number;
	current_source_title: string | null;
	error: string | null;
	warnings?: string[];
}

function buildInitialWikiMapContent(scopePath: string) {
	const scopeName =
		scopePath.split(/[/\\]/).filter(Boolean).pop() || scopePath;
	return `# 知识地图

当前线程工作目录：\`${scopeName}\`

## 待整理主题
- 在这里补充当前目录下最核心的知识主题

## 核心概念
- 记录需要长期保留的概念解释、术语和定义

## 方法与流程
- 记录稳定的方法论、流程、规范和最佳实践

## 资料索引
- 为重要文件、文献、笔记补充指向关系和摘要
`;
}

export function useWiki(scopePath: string | null) {
	const [pages, setPages] = useState<WikiPageItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(false);
	const [generationProgress, setGenerationProgress] =
		useState<WikiGenerationProgress | null>(null);
	const unlistenRef = useRef<(() => void) | null>(null);
	const loadPagesRef = useRef<() => Promise<void>>(async () => {});

	// 监听后端推送的生成进度事件
	useEffect(() => {
		let cancelled = false;
		listen<WikiGenerationProgress>("wiki_generation_progress", (event) => {
			if (cancelled) return;
			const status = event.payload;
			setGenerationProgress(status);
			// 生成完成时自动刷新页面列表
			if (!status.is_generating && status.generated_pages > 0) {
				loadPagesRef.current();
			}
		}).then((unlisten) => {
			if (cancelled) {
				unlisten();
			} else {
				unlistenRef.current = unlisten;
			}
		}).catch(() => {});
		return () => {
			cancelled = true;
			unlistenRef.current?.();
			unlistenRef.current = null;
		};
	}, []);

	const ensureInitialMap = useCallback(async () => {
		if (!scopePath) return false;
		const existingPages = await invoke<WikiPageItem[]>("wiki_list_pages", {
			scope_path: scopePath,
			limit: 200,
		});
		if (existingPages.some((page) => page.title === "知识地图")) return false;
		await invoke<WikiPageItem>("wiki_create_page", {
			scope_path: scopePath,
			title: "知识地图",
			summary: "当前线程工作目录的 Wiki 入口与结构地图",
			content: buildInitialWikiMapContent(scopePath),
			tags: ["map", "index"],
		});
		return true;
	}, [scopePath]);

	// 检查 Wiki 是否启用
	const checkEnabled = useCallback(async () => {
		if (!scopePath) {
			setPages([]);
			setLoading(false);
			setError(null);
			setEnabled(null);
			return;
		}
		try {
			const result = await invoke<{ enabled: boolean }>("wiki_is_enabled", {
				scope_path: scopePath,
			});
			setEnabled(result.enabled);
		} catch {
			setEnabled(false);
		}
	}, [scopePath]);

	// 加载页面
	const loadPages = useCallback(async () => {
		if (!scopePath) return;
		setLoading(true);
		setError(null);
		try {
			const result = await invoke<WikiPageItem[]>("wiki_list_pages", {
				scope_path: scopePath,
				limit: 200,
			});
			setPages(result);
		} catch (e: any) {
			setError(e?.message || "加载失败");
		} finally {
			setLoading(false);
		}
	}, [scopePath]);

	// 保持 ref 与最新 loadPages 同步，供事件监听器使用
	loadPagesRef.current = loadPages;

	// 启用 Wiki
	const enable = useCallback(async () => {
		if (!scopePath) return;
		try {
			setLoading(true);
			setIsInitializing(true);
			setError(null);
			await invoke("wiki_enable", { scope_path: scopePath });
			await ensureInitialMap();
			setEnabled(true);
			await loadPages();
		} catch (e: any) {
			setError(e?.message || "启用失败");
		} finally {
			setIsInitializing(false);
			setLoading(false);
		}
	}, [ensureInitialMap, loadPages, scopePath]);

	// 禁用 Wiki
	const disable = useCallback(async () => {
		if (!scopePath) return;
		try {
			await invoke("wiki_disable", { scope_path: scopePath });
			setEnabled(false);
			setPages([]);
		} catch (e: any) {
			setError(e?.message || "禁用失败");
		}
	}, [scopePath]);

	const rebuild = useCallback(async () => {
		if (!scopePath) return { success: false, createdMap: false };
		try {
			setIsInitializing(true);
			setError(null);
			const result = await invoke<{ success: boolean; created_map: boolean }>(
				"wiki_rebuild",
				{ scope_path: scopePath },
			);
			await loadPages();
			return {
				success: result.success,
				createdMap: result.created_map,
			};
		} catch (e: any) {
			setError(e?.message || "重建失败");
			return { success: false, createdMap: false };
		} finally {
			setIsInitializing(false);
		}
	}, [loadPages, scopePath]);

	// 创建页面
	const createPage = useCallback(
		async (input: {
			title: string;
			content: string;
			summary?: string;
			tags?: string[];
			page_type?: string;
			related_page_ids?: string[];
		}) => {
			if (!scopePath) return null;
			try {
				const result = await invoke<WikiPageItem>("wiki_create_page", {
					scope_path: scopePath,
					...input,
				});
				await loadPages();
				return result;
			} catch (e: any) {
				setError(e?.message || "创建失败");
				return null;
			}
		},
		[scopePath, loadPages],
	);

	// 更新页面
	const updatePage = useCallback(
		async (
			pageId: string,
			input: {
				title?: string;
				content?: string;
				summary?: string;
				tags?: string[];
				page_type?: string;
				related_page_ids?: string[];
			},
		) => {
			if (!scopePath) return null;
			try {
				const result = await invoke<WikiPageItem | null>("wiki_update_page", {
					scope_path: scopePath,
					page_id: pageId,
					...input,
				});
				await loadPages();
				return result;
			} catch (e: any) {
				setError(e?.message || "更新失败");
				return null;
			}
		},
		[scopePath, loadPages],
	);

	// 删除页面
	const deletePage = useCallback(
		async (pageId: string) => {
			if (!scopePath) return;
			try {
				await invoke("wiki_delete_page", { scope_path: scopePath, page_id: pageId });
				await loadPages();
			} catch (e: any) {
				setError(e?.message || "删除失败");
			}
		},
		[scopePath, loadPages],
	);

	// 搜索
	const searchPages = useCallback(
		async (query: string) => {
			if (!scopePath) return [];
			try {
				const result = await invoke<WikiPageItem[]>("wiki_search_pages", {
					scope_path: scopePath,
					query,
					limit: 50,
				});
				return result;
			} catch {
				return [];
			}
		},
		[scopePath],
	);

	useEffect(() => {
		checkEnabled();
	}, [checkEnabled]);

	useEffect(() => {
		if (enabled) {
			loadPages();
		}
	}, [enabled, loadPages]);

	useEffect(() => {
		if (!enabled || !scopePath || loading || pages.length > 0) return;
		let cancelled = false;
		setIsInitializing(true);
		void (async () => {
			try {
				const created = await ensureInitialMap();
				if (!cancelled && created) {
					await loadPages();
				}
			} catch (e: any) {
				if (!cancelled) {
					setError(e?.message || "初始化知识地图失败");
				}
			} finally {
				if (!cancelled) {
					setIsInitializing(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [enabled, ensureInitialMap, loadPages, loading, pages.length, scopePath]);

	// AI 生成 Wiki 页面
	const generateWiki = useCallback(
		async (model?: string) => {
			if (!scopePath) return { success: false, generated_pages: 0 };
			try {
				setIsInitializing(true);
				setError(null);
				const result = await invoke<{
					success: boolean;
					generated_pages: number;
				}>("wiki_generate", { scope_path: scopePath, model });
				await loadPages();
				return result;
			} catch (e: any) {
				setError(e?.message || "AI 生成失败");
				return { success: false, generated_pages: 0 };
			} finally {
				setIsInitializing(false);
			}
		},
		[scopePath, loadPages],
	);

	// 查询生成状态
	const getGenerationStatus = useCallback(async () => {
		try {
			return await invoke<{
				is_generating: boolean;
				scope_path: string | null;
				total_sources: number;
				processed_sources: number;
				generated_pages: number;
				current_source_title: string | null;
				error: string | null;
			}>("wiki_generation_status", {});
		} catch {
			return null;
		}
	}, []);

	const clearGenerationProgress = useCallback(() => {
		setGenerationProgress(null);
	}, []);

	return {
		pages,
		loading,
		isInitializing,
		enabled,
		error,
		generationProgress,
		clearGenerationProgress,
		enable,
		disable,
		rebuild,
		createPage,
		updatePage,
		deletePage,
		searchPages,
		generateWiki,
		getGenerationStatus,
		refresh: loadPages,
	};
}
