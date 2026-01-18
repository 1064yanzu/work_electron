import { useQuery } from "@tanstack/react-query";
import {
	getActiveModel,
	getAllConfigs,
	getSourceDetail,
	listAgentMessages,
	listAgentSessions,
	listFolders,
	listOutputAssets,
	listProjects,
	listProviders,
	listSources,
} from "./ipc-api";

export function useProjectsQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["projects"],
		queryFn: listProjects,
		enabled,
	});
}

export function useFoldersQuery(input: {
	enabled: boolean;
	projectId: string | null;
}) {
	return useQuery({
		queryKey: ["folders", input.projectId],
		queryFn: () => listFolders(input.projectId),
		enabled: input.enabled,
	});
}

export function useSourcesQuery(input: {
	enabled: boolean;
	projectId: string | null;
	folderId: string | null;
	limit?: number;
}) {
	return useQuery({
		queryKey: ["sources", input.projectId, input.folderId, input.limit ?? null],
		queryFn: () => listSources(input),
		enabled: input.enabled && !!input.projectId,
	});
}

export function useSourceDetailQuery(input: {
	enabled: boolean;
	sourceId: string | null;
}) {
	return useQuery({
		queryKey: ["source_detail", input.sourceId],
		queryFn: () => getSourceDetail(input.sourceId as string),
		enabled: input.enabled && !!input.sourceId,
	});
}

export function useProvidersQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["providers"],
		queryFn: listProviders,
		enabled,
	});
}

export function useActiveModelQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["active_model"],
		queryFn: getActiveModel,
		enabled,
	});
}

export function useOutputAssetsQuery(input: {
	enabled: boolean;
	projectId: string | null;
}) {
	return useQuery({
		queryKey: ["output_assets", input.projectId],
		queryFn: () => listOutputAssets(input.projectId),
		enabled: input.enabled && !!input.projectId,
	});
}

export function useAgentSessionsQuery(input: {
	enabled: boolean;
	status?: "active" | "archived";
	limit?: number;
}) {
	return useQuery({
		queryKey: ["agent_sessions", input.status ?? null, input.limit ?? null],
		queryFn: () =>
			listAgentSessions({ status: input.status, limit: input.limit }),
		enabled: input.enabled,
	});
}

export function useAgentMessagesQuery(input: {
	enabled: boolean;
	sessionId: string | null;
	limit?: number;
}) {
	return useQuery({
		queryKey: ["agent_messages", input.sessionId, input.limit ?? null],
		queryFn: () =>
			listAgentMessages({
				session_id: input.sessionId as string,
				limit: input.limit,
			}),
		enabled: input.enabled && !!input.sessionId,
	});
}

export function useAllConfigsQuery(enabled: boolean) {
	return useQuery({
		queryKey: ["configs"],
		queryFn: getAllConfigs,
		enabled,
	});
}
