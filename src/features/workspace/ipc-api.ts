import { ipcInvoke } from "@/lib/ipc";
import type {
	AgentMessage,
	AgentSession,
	CreateOutputPayload,
	Folder,
	InvokeLlmResult,
	OutputAsset,
	Project,
	Provider,
	Source,
	StreamChunk,
	UpdateOutputPayload,
	UpsertProviderPayload,
} from "../../../electron/shared/types";

export async function listProjects(): Promise<Project[]> {
	return ipcInvoke("list_projects", {});
}

export async function listFolders(projectId: string | null): Promise<Folder[]> {
	return ipcInvoke("list_folders", projectId ? { project_id: projectId } : {});
}

export async function listSources(input: {
	projectId: string | null;
	folderId: string | null;
	limit?: number;
}): Promise<Source[]> {
	const { projectId, folderId, limit } = input;
	return ipcInvoke("list_sources", {
		project_id: projectId ?? undefined,
		folder_id: folderId ?? undefined,
		limit,
	});
}

export async function getSourceDetail(sourceId: string) {
	return ipcInvoke("get_source_detail", { id: sourceId });
}

export async function listProviders(): Promise<Provider[]> {
	return ipcInvoke("list_providers", {});
}

export async function upsertProvider(
	input: UpsertProviderPayload,
): Promise<Provider> {
	return ipcInvoke("upsert_provider", input);
}

export async function deleteProvider(id: string) {
	return ipcInvoke("delete_provider", { id });
}

export async function resetCoreProviders() {
	return ipcInvoke("reset_core_providers", {});
}

export async function kbSearchChunks(input: {
	query: string;
	limit?: number;
	source_id?: string;
}): Promise<
	Array<{ chunk_id: string; content: string; score: number; snippet: string }>
> {
	return ipcInvoke("kb_search_chunks", input);
}

export async function getConfig(key: string): Promise<string | null> {
	return ipcInvoke("get_config", { key });
}

export async function setConfig(key: string, value: string) {
	return ipcInvoke("set_config", { key, value });
}

export async function getAllConfigs(): Promise<
	Array<{ key: string; value: string }>
> {
	return ipcInvoke("get_all_configs", {});
}

export async function getActiveModel(): Promise<string> {
	return ipcInvoke("get_active_model", {});
}

export async function setActiveModel(model: string) {
	return ipcInvoke("set_active_model", { model });
}

export async function invokeLlm(input: {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}): Promise<InvokeLlmResult> {
	return ipcInvoke("invoke_llm", input);
}

export async function invokeLlmStream(input: {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}) {
	return ipcInvoke("invoke_llm_stream", input);
}

export async function listOutputAssets(
	projectId: string | null,
): Promise<OutputAsset[]> {
	return ipcInvoke("list_output_assets", {
		project_id: projectId ?? undefined,
	});
}

export async function createOutputAsset(
	input: CreateOutputPayload,
): Promise<OutputAsset> {
	return ipcInvoke("create_output_asset", input);
}

export async function updateOutputAsset(
	input: UpdateOutputPayload,
): Promise<OutputAsset> {
	return ipcInvoke("update_output_asset", input);
}

export async function deleteOutputAsset(id: string) {
	return ipcInvoke("delete_output_asset", { id });
}

export async function listAgentSessions(input?: {
	status?: "active" | "archived";
	limit?: number;
}): Promise<AgentSession[]> {
	return ipcInvoke("agent_list_sessions", input ?? {});
}

export async function createAgentSession(input?: {
	title?: string;
	config_json?: unknown;
}): Promise<AgentSession> {
	return ipcInvoke("agent_create_session", input ?? {});
}

export async function updateAgentSession(input: {
	id: string;
	title?: string;
	status?: "active" | "archived";
	config_json?: unknown;
}): Promise<AgentSession> {
	return ipcInvoke("agent_update_session", input);
}

export async function deleteAgentSession(id: string) {
	return ipcInvoke("agent_delete_session", { id });
}

export async function listAgentMessages(input: {
	session_id: string;
	task_id?: string;
	limit?: number;
}): Promise<AgentMessage[]> {
	return ipcInvoke("agent_list_messages", input);
}

export async function createAgentMessage(input: {
	session_id: string;
	task_id?: string;
	role: string;
	content_json: unknown;
	agent_session_id?: string;
}): Promise<AgentMessage> {
	return ipcInvoke("agent_create_message", input);
}

export type { StreamChunk };
