export const queryKeys = {
	sources: () => ["sources"] as const,
	folders: (projectId?: string | null) =>
		["folders", { projectId: projectId ?? null }] as const,
	cards: () => ["cards"] as const,
	outputAssets: () => ["output_assets"] as const,
	agentSessions: (
		status: "active" | "archived" | undefined,
		projectId?: string | null,
	) =>
		[
			"agent_sessions",
			{ status: status ?? "all", projectId: projectId ?? null },
		] as const,
};
