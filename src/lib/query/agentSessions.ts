import { useQuery } from "@tanstack/react-query";
import { listAgentSessions, type AgentSession } from "../agent/api";
import { queryKeys } from "./keys";

export function useAgentSessionsQuery(
	status: "active" | "archived" | undefined = "active",
	projectId?: string | null,
) {
	return useQuery<AgentSession[]>({
		queryKey: queryKeys.agentSessions(status, projectId),
		queryFn: () => listAgentSessions(status, projectId),
	});
}
