import { useQuery } from "@tanstack/react-query";
import { listCards } from "../api/cards";
import { listOutputAssets } from "../api/output";
import { listSources } from "../api/sources";
import type { OutputAsset, Source } from "../../types";
import type { Card } from "../../types";
import { queryKeys } from "./keys";

interface SourcesQueryOptions {
	refetchInterval?: number | false;
	enabled?: boolean;
}

interface QueryEnabledOptions {
	enabled?: boolean;
}

export function filterSourcesByProject(
	sources: Source[],
	projectId?: string | null,
): Source[] {
	if (!projectId) return sources;
	return sources.filter(
		(source) => source.project_id === projectId || source.project_id == null,
	);
}

export function filterSourcesByProjectAndFolder(
	sources: Source[],
	projectId?: string | null,
	folderId?: string | null,
): Source[] {
	const byProject = filterSourcesByProject(sources, projectId);
	if (!folderId) return byProject;
	return byProject.filter((source) => source.folder_id === folderId);
}

export function useSourcesQuery(
	projectId?: string | null,
	options?: SourcesQueryOptions,
) {
	return useQuery({
		queryKey: queryKeys.sources(),
		queryFn: listSources,
		select: (sources) => filterSourcesByProject(sources, projectId),
		refetchInterval: options?.refetchInterval,
		enabled: options?.enabled,
	});
}

export function useCardsQuery(options?: QueryEnabledOptions) {
	return useQuery<Card[]>({
		queryKey: queryKeys.cards(),
		queryFn: listCards,
		enabled: options?.enabled,
	});
}

export function useOutputAssetsQuery(options?: QueryEnabledOptions) {
	return useQuery<OutputAsset[]>({
		queryKey: queryKeys.outputAssets(),
		queryFn: listOutputAssets,
		enabled: options?.enabled,
	});
}
