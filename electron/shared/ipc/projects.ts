// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：projects（共 10 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	CreateProjectPayload,
	DashboardStats,
	Project,
	UpdateProjectPayload,
} from "./common";

export interface ProjectsIpcSchema {
	// ==================
	// Projects 命令
	// ==================
	list_projects: {
		input: Record<string, never>;
		output: Project[];
	};
	get_project: {
		input: { id: string };
		output: Project | null;
	};
	create_project: {
		input: CreateProjectPayload;
		output: Project;
	};
	update_project: {
		input: UpdateProjectPayload;
		output: Project;
	};
	delete_project: {
		input: { id: string };
		output: { success: boolean };
	};
	get_recent_projects: {
		input: { limit?: number };
		output: Project[];
	};
	record_project_visit: {
		input: { project_id: string };
		output: { success: boolean };
	};

	// ==================
	// Dashboard / Stats
	// ==================
	get_daily_activity: {
		input: { days: number };
		output: Array<{ date: string; count: number }>;
	};

	// ==================
	// Dashboard 命令
	// ==================
	dashboard_stats: {
		input: Record<string, never>;
		output: DashboardStats;
	};
	project_reveal_directory: {
		input: { project_id: string };
		output: { success: boolean; path: string; error?: string };
	};
}
