import type { Project, Uuid } from "../../types";
import { safeInvoke } from "../tauriBridge";

export interface CreateProjectPayload {
	name: string;
	description?: string;
	color?: string;
	icon?: string;
}

export interface UpdateProjectPayload {
	id: Uuid;
	name?: string;
	description?: string;
	color?: string;
	icon?: string;
	is_archived?: boolean;
}

export async function listProjects(): Promise<Project[]> {
	return await safeInvoke("list_projects");
}

export async function getProject(id: Uuid): Promise<Project> {
	return await safeInvoke("get_project", { id });
}

export async function createProject(
	payload: CreateProjectPayload,
): Promise<Project> {
	return await safeInvoke("create_project", { payload });
}

export async function updateProject(
	payload: UpdateProjectPayload,
): Promise<Project> {
	return await safeInvoke("update_project", { payload });
}

export async function deleteProject(id: Uuid): Promise<void> {
	return await safeInvoke("delete_project", { id });
}

export async function getRecentProjects(limit?: number): Promise<Project[]> {
	return await safeInvoke("get_recent_projects", { limit });
}

export async function recordProjectVisit(projectId: Uuid): Promise<void> {
	return await safeInvoke("record_project_visit", { project_id: projectId });
}

export async function revealProjectDirectory(projectId: string): Promise<{
	success: boolean;
	path: string;
	error?: string;
}> {
	return await safeInvoke("project_reveal_directory", {
		project_id: projectId,
	});
}
