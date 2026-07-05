// React Query 预取工具函数
// 在用户悬停、聚焦等交互时提前加载数据，减少感知加载时间

import { listAgentSessions } from "../agent/api";
import { listCards } from "../api/cards";
import { listFolders } from "../api/folders";
import { listOutputAssetsMeta } from "../api/output";
import { listSources } from "../api/sources";
import { appQueryClient, QUERY_STALE_TIME_MS } from "./client";
import { queryKeys } from "./keys";

/**
 * 预取资料库列表。
 * 适合在用户即将访问资料视图前调用（如悬停在"资料"标签页上时）。
 */
export function prefetchSources(): void {
	void appQueryClient.prefetchQuery({
		queryKey: queryKeys.sources(),
		queryFn: listSources,
		staleTime: QUERY_STALE_TIME_MS,
	});
}

/**
 * 预取指定项目下的文件夹列表。
 * 适合在用户悬停到项目卡片上时调用，提前加载该项目的文件夹结构。
 */
export function prefetchFolders(projectId: string | null): void {
	void appQueryClient.prefetchQuery({
		queryKey: queryKeys.folders(projectId),
		queryFn: () => listFolders(projectId),
		staleTime: QUERY_STALE_TIME_MS,
	});
}

/**
 * 预取 Agent 会话列表。
 * 适合在用户即将进入聊天/Agent 界面前调用。
 */
export function prefetchAgentSessions(
	status: "active" | "archived" | undefined,
	projectId?: string | null,
): void {
	void appQueryClient.prefetchQuery({
		queryKey: queryKeys.agentSessions(status, projectId),
		queryFn: () => listAgentSessions(status, projectId),
		staleTime: QUERY_STALE_TIME_MS,
	});
}

/**
 * 预取分享卡片列表。
 * 适合在用户悬停在"卡片"标签页上时调用。
 */
export function prefetchCards(): void {
	void appQueryClient.prefetchQuery({
		queryKey: queryKeys.cards(),
		queryFn: listCards,
		staleTime: QUERY_STALE_TIME_MS,
	});
}

/**
 * 预取输出产物列表。
 * 适合在用户聚焦聊天输入框时调用（斜杠命令可能引用这些产物）。
 */
export function prefetchOutputAssets(): void {
	void appQueryClient.prefetchQuery({
		queryKey: queryKeys.outputAssets(),
		// 与 useOutputAssetsQuery 同一 queryKey，必须同为 meta_only 模式，避免缓存串味
		queryFn: listOutputAssetsMeta,
		staleTime: QUERY_STALE_TIME_MS,
	});
}

/**
 * 批量预取某个项目的所有常用数据。
 * 适合在 Dashboard 上用户悬停到项目卡片时一次性预取。
 */
export function prefetchProjectData(projectId: string): void {
	prefetchSources();
	prefetchFolders(projectId);
	prefetchAgentSessions("active", projectId);
}

/**
 * 预取聊天输入框相关的上下文数据。
 * 在用户聚焦输入框时调用，提前加载斜杠命令所需的资料和产物。
 */
export function prefetchChatContext(): void {
	prefetchSources();
	prefetchCards();
	prefetchOutputAssets();
}
