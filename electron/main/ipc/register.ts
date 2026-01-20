/**
 * IPC 注册器
 * 整合所有 handlers 并注册到 ipcMain
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain } from "electron";
import type { IPCSchema } from "../../shared/ipc-schema";
import type { DbContext } from "../db/client";
import type { HttpStatus } from "../http/start";
import { searchChunks } from "../kb/searchChunks";
import { invokeLlm, invokeLlmStream } from "../llm/invoke";
import type { Logger } from "../logging/types";
import {
	createAgentMemoryHandlers,
	createAgentMessageHandlers,
	createAgentNodeHandlers,
	createAgentSessionHandlers,
	createAgentTaskHandlers,
	createAgentToolCallHandlers,
} from "./handlers/agent";
import { createConfigHandlers } from "./handlers/config";
import { createActivityHandlers } from "./handlers/activity";
import { createBrowserSearchHandlers } from "./handlers/browserSearch";
import { createCardHandlers } from "./handlers/cards";
import { createFolderHandlers } from "./handlers/folders";
import { createImportExportHandlers } from "./handlers/import-export";
import { createAgentSdkHandlers } from "./handlers/agentSdk";
import { createAgentSandboxHandlers } from "./handlers/agentSandbox";
import { createFsSafeHandlers } from "./handlers/fsSafe";
import { createTempFileHandlers } from "./handlers/tempFiles";
import { createKbEmbeddingHandlers } from "./handlers/kbEmbeddings";
import { createDataStatsHandlers } from "./handlers/dataStats";
import { createMcpHandlers } from "./handlers/mcp";
import { createNoteHandlers } from "./handlers/notes";
import { createOutputHandlers } from "./handlers/outputs";
import { createProjectHandlers } from "./handlers/projects";
import { createProviderHandlers } from "./handlers/providers";
import { createSkillsHandlers } from "./handlers/skills";
import { createSourceHandlers } from "./handlers/sources";
import { createSyncHandlers } from "./handlers/sync";
import { createWebContentHandlers } from "./handlers/webContent";

type IpcHandler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// 主窗口引用，用于流式输出
let mainWindowRef: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow) {
	mainWindowRef = window;
}

export function registerIpcHandlers({
	logger,
	httpStatus,
	db,
}: {
	logger: Logger;
	httpStatus: HttpStatus;
	db: DbContext;
}) {
	// ==================
	// 创建各模块 handlers
	// ==================
	const projectHandlers = createProjectHandlers(db);
	const folderHandlers = createFolderHandlers(db);
	const sourceHandlers = createSourceHandlers(db);
	const noteHandlers = createNoteHandlers(db);
	const providerHandlers = createProviderHandlers(db);
	const configHandlers = createConfigHandlers(db);
	const outputHandlers = createOutputHandlers(db);
	const mcpHandlers = createMcpHandlers(db);
	const syncHandlers = createSyncHandlers(db);
	const importExportHandlers = createImportExportHandlers(db, logger);
	const cardHandlers = createCardHandlers(db);
	const activityHandlers = createActivityHandlers(db);
	const browserSearchHandlers = createBrowserSearchHandlers();
	const webContentHandlers = createWebContentHandlers();
	const skillsHandlers = createSkillsHandlers(db);
	const kbEmbeddingHandlers = createKbEmbeddingHandlers(db);
	const dataStatsHandlers = createDataStatsHandlers(db);
	const fsSafeHandlers = createFsSafeHandlers();
	const tempFileHandlers = createTempFileHandlers();
	const agentSandboxHandlers = createAgentSandboxHandlers();
	const agentSdkHandlers = createAgentSdkHandlers({
		getMainWindow: () => mainWindowRef,
		anthropicBaseUrl: httpStatus.anthropicProxy.baseUrl,
		logger,
	});

	// Agent Runtime handlers
	const agentSessionHandlers = createAgentSessionHandlers(db);
	const agentTaskHandlers = createAgentTaskHandlers(db);
	const agentNodeHandlers = createAgentNodeHandlers(db);
	const agentToolCallHandlers = createAgentToolCallHandlers(db);
	const agentMessageHandlers = createAgentMessageHandlers(db);
	const agentMemoryHandlers = createAgentMemoryHandlers(db);

	// ==================
	// 系统命令
	// ==================
	ipcMain.handle("app_get_version", (async () => {
		return {
			appVersion: app.getVersion(),
			electron: process.versions.electron,
			chrome: process.versions.chrome,
			node: process.versions.node,
		};
	}) satisfies IpcHandler<"app_get_version">);

	ipcMain.handle("health_ping", (async (_event, input) => {
		return { ts: input.ts };
	}) satisfies IpcHandler<"health_ping">);

	ipcMain.handle("http_get_status", (async () => {
		return httpStatus;
	}) satisfies IpcHandler<"http_get_status">);

	ipcMain.handle("open_browser_window", webContentHandlers.open_browser_window);
	ipcMain.handle("fetch_page_content", webContentHandlers.fetch_page_content);
	ipcMain.handle("browser_search", browserSearchHandlers.browser_search);
	ipcMain.handle("read_file_safe", fsSafeHandlers.read_file_safe);
	ipcMain.handle("write_file_safe", fsSafeHandlers.write_file_safe);
	ipcMain.handle("list_files_safe", fsSafeHandlers.list_files_safe);
	ipcMain.handle("mkdir_safe", fsSafeHandlers.mkdir_safe);
	ipcMain.handle("copy_file_safe", fsSafeHandlers.copy_file_safe);
	ipcMain.handle("save_temp_file", tempFileHandlers.save_temp_file);
	ipcMain.handle(
		"agent_get_sandbox_dir",
		agentSandboxHandlers.agent_get_sandbox_dir,
	);
	// ==================
	// Projects
	// ==================
	ipcMain.handle("list_projects", projectHandlers.list_projects);
	ipcMain.handle("get_project", projectHandlers.get_project);
	ipcMain.handle("create_project", projectHandlers.create_project);
	ipcMain.handle("update_project", projectHandlers.update_project);
	ipcMain.handle("delete_project", projectHandlers.delete_project);
	ipcMain.handle("get_recent_projects", projectHandlers.get_recent_projects);
	ipcMain.handle("record_project_visit", projectHandlers.record_project_visit);

	// ==================
	// Folders
	// ==================
	ipcMain.handle("list_folders", folderHandlers.list_folders);
	ipcMain.handle("create_folder", folderHandlers.create_folder);
	ipcMain.handle("update_folder", folderHandlers.update_folder);
	ipcMain.handle("delete_folder", folderHandlers.delete_folder);
	ipcMain.handle(
		"move_sources_to_folder",
		folderHandlers.move_sources_to_folder,
	);

	// ==================
	// Sources
	// ==================
	ipcMain.handle("list_sources", sourceHandlers.list_sources);
	ipcMain.handle("get_source", sourceHandlers.get_source);
	ipcMain.handle("get_source_detail", sourceHandlers.get_source_detail);
	ipcMain.handle("create_source", sourceHandlers.create_source);
	ipcMain.handle("update_source", sourceHandlers.update_source);
	ipcMain.handle("delete_source", sourceHandlers.delete_source);
	ipcMain.handle("search_sources", sourceHandlers.search_sources);

	// ==================
	// Notes
	// ==================
	ipcMain.handle("list_notes", noteHandlers.list_notes);
	ipcMain.handle("create_note", noteHandlers.create_note);
	ipcMain.handle("update_note", noteHandlers.update_note);
	ipcMain.handle("delete_note", noteHandlers.delete_note);

	// ==================
	// Knowledge Base
	// ==================
	ipcMain.handle("kb_search_chunks", (async (_event, input) => {
		logger.info({ msg: "kb_search_chunks called", query: input.query });
		return searchChunks(db, input);
	}) satisfies IpcHandler<"kb_search_chunks">);

	ipcMain.handle("kb_chunk_rebuild", noteHandlers.kb_chunk_rebuild);
	ipcMain.handle(
		"kb_get_embedding_stats",
		kbEmbeddingHandlers.kb_get_embedding_stats,
	);
	ipcMain.handle(
		"kb_embeddings_rebuild",
		kbEmbeddingHandlers.kb_embeddings_rebuild,
	);

	// ==================
	// Agent Skills
	// ==================
	ipcMain.handle("list_skills", skillsHandlers.list_skills);
	ipcMain.handle("import_skill", skillsHandlers.import_skill);
	ipcMain.handle("delete_skill", skillsHandlers.delete_skill);
	ipcMain.handle("set_skill_enabled", skillsHandlers.set_skill_enabled);

	// ==================
	// Providers
	// ==================
	ipcMain.handle("list_providers", providerHandlers.list_providers);
	ipcMain.handle("upsert_provider", providerHandlers.upsert_provider);
	ipcMain.handle("delete_provider", providerHandlers.delete_provider);
	ipcMain.handle(
		"check_provider_api_key",
		providerHandlers.check_provider_api_key,
	);
	ipcMain.handle("reset_core_providers", providerHandlers.reset_core_providers);

	// ==================
	// Config
	// ==================
	ipcMain.handle("get_config", configHandlers.get_config);
	ipcMain.handle("set_config", configHandlers.set_config);
	ipcMain.handle("get_all_configs", configHandlers.get_all_configs);
	ipcMain.handle("get_active_model", configHandlers.get_active_model);
	ipcMain.handle("set_active_model", configHandlers.set_active_model);

	// ==================
	// LLM
	// ==================
	ipcMain.handle("invoke_llm", (async (_event, input) => {
		logger.info({ msg: "invoke_llm called", model: input.model });
		return invokeLlm(db, input);
	}) satisfies IpcHandler<"invoke_llm">);

	ipcMain.handle("invoke_llm_stream", (async (_event, input) => {
		logger.info({ msg: "invoke_llm_stream called", model: input.model });
		return invokeLlmStream(db, mainWindowRef, input);
	}) satisfies IpcHandler<"invoke_llm_stream">);

	// ==================
	// Output Assets
	// ==================
	ipcMain.handle("list_output_assets", outputHandlers.list_output_assets);
	ipcMain.handle("create_output_asset", outputHandlers.create_output_asset);
	ipcMain.handle("update_output_asset", outputHandlers.update_output_asset);
	ipcMain.handle("delete_output_asset", outputHandlers.delete_output_asset);

	// ==================
	// Dashboard
	// ==================
	ipcMain.handle("dashboard_stats", outputHandlers.dashboard_stats);
	ipcMain.handle("get_daily_activity", activityHandlers.get_daily_activity);

	// ==================
	// Cards
	// ==================
	ipcMain.handle("list_cards", cardHandlers.list_cards);
	ipcMain.handle("get_card", cardHandlers.get_card);
	ipcMain.handle("delete_card", cardHandlers.delete_card);
	ipcMain.handle("get_card_image_path", cardHandlers.get_card_image_path);

	// ==================
	// MCP Servers
	// ==================
	ipcMain.handle("list_mcp_servers", mcpHandlers.list_mcp_servers);
	ipcMain.handle("get_mcp_server", mcpHandlers.get_mcp_server);
	ipcMain.handle("create_mcp_server", mcpHandlers.create_mcp_server);
	ipcMain.handle("update_mcp_server", mcpHandlers.update_mcp_server);
	ipcMain.handle("delete_mcp_server", mcpHandlers.delete_mcp_server);
	ipcMain.handle("toggle_mcp_server", mcpHandlers.toggle_mcp_server);
	ipcMain.handle("mcp_check_env", mcpHandlers.mcp_check_env);

	// ==================
	// Data Stats & Management
	// ==================
	ipcMain.handle("get_data_stats", dataStatsHandlers.get_data_stats);
	ipcMain.handle("get_data_directory", dataStatsHandlers.get_data_directory);
	ipcMain.handle("get_database_path", dataStatsHandlers.get_database_path);

	// ==================
	// Sync & Backup
	// ==================
	ipcMain.handle("get_sync_config", syncHandlers.get_sync_config);
	ipcMain.handle("update_sync_config", syncHandlers.update_sync_config);
	ipcMain.handle("list_backup_history", syncHandlers.list_backup_history);
	ipcMain.handle("create_backup_record", syncHandlers.create_backup_record);
	ipcMain.handle("clean_old_backups", syncHandlers.clean_old_backups);

	// ==================
	// Import / Export
	// ==================
	ipcMain.handle("export_all_data", importExportHandlers.export_all_data);
	ipcMain.handle("export_project", importExportHandlers.export_project);
	ipcMain.handle("import_data", importExportHandlers.import_data);

	// ==================
	// Agent Sessions
	// ==================
	ipcMain.handle(
		"agent_create_session",
		agentSessionHandlers.agent_create_session,
	);
	ipcMain.handle("agent_get_session", agentSessionHandlers.agent_get_session);
	ipcMain.handle(
		"agent_list_sessions",
		agentSessionHandlers.agent_list_sessions,
	);
	ipcMain.handle(
		"agent_update_session",
		agentSessionHandlers.agent_update_session,
	);
	ipcMain.handle(
		"agent_delete_session",
		agentSessionHandlers.agent_delete_session,
	);

	// ==================
	// Agent Tasks
	// ==================
	ipcMain.handle("agent_create_task", agentTaskHandlers.agent_create_task);
	ipcMain.handle("agent_get_task", agentTaskHandlers.agent_get_task);
	ipcMain.handle("agent_list_tasks", agentTaskHandlers.agent_list_tasks);
	ipcMain.handle("agent_update_task", agentTaskHandlers.agent_update_task);

	// ==================
	// Agent Nodes
	// ==================
	ipcMain.handle("agent_create_node", agentNodeHandlers.agent_create_node);
	ipcMain.handle("agent_list_nodes", agentNodeHandlers.agent_list_nodes);
	ipcMain.handle("agent_update_node", agentNodeHandlers.agent_update_node);

	// ==================
	// Agent Tool Calls
	// ==================
	ipcMain.handle(
		"agent_create_tool_call",
		agentToolCallHandlers.agent_create_tool_call,
	);
	ipcMain.handle(
		"agent_list_tool_calls",
		agentToolCallHandlers.agent_list_tool_calls,
	);
	ipcMain.handle(
		"agent_update_tool_call",
		agentToolCallHandlers.agent_update_tool_call,
	);

	// ==================
	// Claude Agent SDK Runner
	// ==================
	ipcMain.handle("agent_sdk_start", agentSdkHandlers.agent_sdk_start);
	ipcMain.handle("agent_sdk_abort", agentSdkHandlers.agent_sdk_abort);

	// ==================
	// Agent Messages & Artifacts & Audit
	// ==================
	ipcMain.handle(
		"agent_create_message",
		agentMessageHandlers.agent_create_message,
	);
	ipcMain.handle(
		"agent_list_messages",
		agentMessageHandlers.agent_list_messages,
	);
	ipcMain.handle(
		"agent_create_artifact",
		agentMessageHandlers.agent_create_artifact,
	);
	ipcMain.handle(
		"agent_list_artifacts",
		agentMessageHandlers.agent_list_artifacts,
	);
	ipcMain.handle(
		"agent_create_audit_log",
		agentMessageHandlers.agent_create_audit_log,
	);
	ipcMain.handle(
		"agent_list_audit_logs",
		agentMessageHandlers.agent_list_audit_logs,
	);

	// ==================
	// Agent Memory
	// ==================
	ipcMain.handle(
		"search_agent_memories",
		agentMemoryHandlers.search_agent_memories,
	);
	ipcMain.handle(
		"create_agent_memory",
		agentMemoryHandlers.create_agent_memory,
	);
	ipcMain.handle(
		"update_agent_memory",
		agentMemoryHandlers.update_agent_memory,
	);
	ipcMain.handle(
		"delete_agent_memory",
		agentMemoryHandlers.delete_agent_memory,
	);
	ipcMain.handle(
		"get_agent_memory_by_key",
		agentMemoryHandlers.get_agent_memory_by_key,
	);
	ipcMain.handle(
		"update_agent_memory_access_time",
		agentMemoryHandlers.update_agent_memory_access_time,
	);

	logger.info({ msg: "IPC handlers registered", count: 85 });
}
