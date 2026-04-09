/**
 * IPC 注册器
 * 整合所有 handlers 并注册到 ipcMain
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app, ipcMain, shell } from "electron";
import type { IPCSchema } from "../../shared/ipc-schema";
import type { DbContext } from "../db/client";
import type { HttpStatus } from "../http/start";
import { searchChunks } from "../kb/searchChunks";
import {
	invokeLlm,
	invokeLlmStream,
	invokeImageGeneration,
} from "../llm/invoke";
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
import { createExaMcpHandlers } from "./handlers/exaMcp";
import { createCardHandlers } from "./handlers/cards";
import { createFolderHandlers } from "./handlers/folders";
import { createImportExportHandlers } from "./handlers/import-export";
import { createAgentSdkHandlers } from "./handlers/agentSdk";
import { createAgentSandboxHandlers } from "./handlers/agentSandbox";
import { createDocumentHandlers } from "./handlers/documents";
import { createContentIngestHandlers } from "./handlers/contentIngest";
import { createModelDiscoveryHandlers } from "./handlers/modelDiscovery";
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
import { createArtifactHandlers } from "./handlers/artifacts";
import { createAgentCheckpointHandlers } from "./handlers/agentCheckpoint";
import { createLocalBackupHandlers } from "./handlers/localBackup";
import { createImageGenHandlers } from "./handlers/imageGen";
import { createStorageHandlers } from "./handlers/storage";
import { createFileHandlers } from "./handlers/files";
import { createRemoteControlHandlers } from "./handlers/remoteControl";
import { getRemoteControlOrchestrator } from "../remote-control/core/service";
import { createCloudNodeHandlers } from "./handlers/cloudNode";
import { getCloudNodeClient } from "../cloud-node/service";
import { createTerminalHandlers } from "./handlers/terminal";
import { createWorktreeHandlers } from "./handlers/worktree";

import { setFileWatcherMainWindow } from "../services/fileWatcherService";

type IpcHandler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// 主窗口引用，用于流式输出
let mainWindowRef: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow) {
	mainWindowRef = window;
	// 同步传递给远程控制编排器，让远程消息可以注入到前端 UI
	try {
		getRemoteControlOrchestrator().setMainWindow(window);
	} catch {
		// orchestrator 可能尚未初始化，忽略
	}
	try {
		getCloudNodeClient();
	} catch {
		// cloud node client 可能尚未初始化，忽略
	}
	// 同步传递给文件监听服务
	setFileWatcherMainWindow(window);
}

export function registerIpcHandlers({
	logger,
	getHttpStatus,
	db,
}: {
	logger: Logger;
	getHttpStatus: () => Promise<HttpStatus>;
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
	const exaMcpHandlers = createExaMcpHandlers();
	const webContentHandlers = createWebContentHandlers();
	const skillsHandlers = createSkillsHandlers(db);
	const kbEmbeddingHandlers = createKbEmbeddingHandlers(db);
	const dataStatsHandlers = createDataStatsHandlers(db);
	const storageHandlers = createStorageHandlers(db);
	const fileHandlers = createFileHandlers(db);
	const fsSafeHandlers = createFsSafeHandlers();
	const tempFileHandlers = createTempFileHandlers();
	const documentHandlers = createDocumentHandlers();
	const contentIngestHandlers = createContentIngestHandlers(db);
	const modelDiscoveryHandlers = createModelDiscoveryHandlers();
	const agentSandboxHandlers = createAgentSandboxHandlers();
	const agentSdkHandlers = createAgentSdkHandlers({
		getMainWindow: () => mainWindowRef,
		getAnthropicBaseUrl: async () => {
			const httpStatus = await getHttpStatus();
			return httpStatus.anthropicProxy.baseUrl || "http://127.0.0.1:8765";
		},
		logger,
		db,
	});
	const remoteControlHandlers = createRemoteControlHandlers();
	const cloudNodeHandlers = createCloudNodeHandlers();
	getRemoteControlOrchestrator().bindAgentSdkHandlers(agentSdkHandlers);
	getCloudNodeClient().bindAgentSdkHandlers(agentSdkHandlers);

	// Agent Runtime handlers
	const agentSessionHandlers = createAgentSessionHandlers(db);
	const agentTaskHandlers = createAgentTaskHandlers(db);
	const agentNodeHandlers = createAgentNodeHandlers(db);
	const agentToolCallHandlers = createAgentToolCallHandlers(db);
	const agentMessageHandlers = createAgentMessageHandlers(db);
	const agentMemoryHandlers = createAgentMemoryHandlers(db);

	// Artifact handlers
	const artifactHandlers = createArtifactHandlers(db);

	// Checkpoint handlers (断点续传)
	const checkpointHandlers = createAgentCheckpointHandlers({
		db: () => db,
		logger,
	});

	// Local Backup handlers (本地备份)
	const localBackupHandlers = createLocalBackupHandlers(db);

	// Image Generation handlers (生图配置)
	const imageGenHandlers = createImageGenHandlers(db);

	// Terminal handlers (终端)
	const terminalHandlers = createTerminalHandlers({
		getMainWindow: () => mainWindowRef,
	});

	// Worktree handlers (Git Worktree 沙盒隔离)
	const worktreeHandlers = createWorktreeHandlers({ logger });


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

	ipcMain.handle("open_external_url", (async (_event, input) => {
		try {
			const raw = String(input?.url || "").trim();
			if (!raw) return { success: false, error: "EMPTY_URL" };
			const u = new URL(raw);
			const allowed = new Set(["http:", "https:", "mailto:"]);
			if (!allowed.has(u.protocol)) {
				return { success: false, error: `UNSUPPORTED_PROTOCOL:${u.protocol}` };
			}
			await shell.openExternal(u.toString());
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}) satisfies IpcHandler<"open_external_url">);

	ipcMain.handle("http_get_status", (async () => {
		return getHttpStatus();
	}) satisfies IpcHandler<"http_get_status">);

	ipcMain.handle("open_browser_window", webContentHandlers.open_browser_window);
	ipcMain.handle("fetch_page_content", webContentHandlers.fetch_page_content);
	ipcMain.handle("browser_search", browserSearchHandlers.browser_search);
	ipcMain.handle("exa_mcp_search", exaMcpHandlers.exa_mcp_search);
	ipcMain.handle("fetch_url_content", contentIngestHandlers.fetch_url_content);
	ipcMain.handle(
		"upload_file_content",
		contentIngestHandlers.upload_file_content,
	);
	ipcMain.handle(
		"import_local_files",
		contentIngestHandlers.import_local_files,
	);
	ipcMain.handle("read_file_safe", fsSafeHandlers.read_file_safe);
	ipcMain.handle("write_file_safe", fsSafeHandlers.write_file_safe);
	ipcMain.handle("list_files_safe", fsSafeHandlers.list_files_safe);
	ipcMain.handle("mkdir_safe", fsSafeHandlers.mkdir_safe);
	ipcMain.handle("copy_file_safe", fsSafeHandlers.copy_file_safe);
	ipcMain.handle("move_file_safe", fsSafeHandlers.move_file_safe);
	ipcMain.handle("delete_file_safe", fsSafeHandlers.delete_file_safe);
	ipcMain.handle("reveal_file_safe", fsSafeHandlers.reveal_file_safe);
	ipcMain.handle("read_file_utf8", fsSafeHandlers.read_file_utf8);
	ipcMain.handle("save_base64_image", fsSafeHandlers.save_base64_image);
	ipcMain.handle("save_temp_file", tempFileHandlers.save_temp_file);
	ipcMain.handle(
		"agent_get_sandbox_dir",
		agentSandboxHandlers.agent_get_sandbox_dir,
	);
	ipcMain.handle("convert_docx_to_html", documentHandlers.convert_docx_to_html);
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
	ipcMain.handle(
		"provider_fetch_models",
		modelDiscoveryHandlers.provider_fetch_models,
	);

	// ==================
	// Config
	// ==================
	ipcMain.handle("get_config", configHandlers.get_config);
	ipcMain.handle("set_config", configHandlers.set_config);
	ipcMain.handle(
		"get_remote_control_config",
		remoteControlHandlers.get_remote_control_config,
	);
	ipcMain.handle(
		"set_remote_control_config",
		remoteControlHandlers.set_remote_control_config,
	);
	ipcMain.handle(
		"get_remote_control_runtime_status",
		remoteControlHandlers.get_remote_control_runtime_status,
	);
	ipcMain.handle(
		"list_remote_channels",
		remoteControlHandlers.list_remote_channels,
	);
	ipcMain.handle(
		"list_remote_pairings",
		remoteControlHandlers.list_remote_pairings,
	);
	ipcMain.handle(
		"approve_remote_pairing",
		remoteControlHandlers.approve_remote_pairing,
	);
	ipcMain.handle(
		"reject_remote_pairing",
		remoteControlHandlers.reject_remote_pairing,
	);
	ipcMain.handle(
		"revoke_remote_pairing",
		remoteControlHandlers.revoke_remote_pairing,
	);
	ipcMain.handle(
		"list_remote_sessions",
		remoteControlHandlers.list_remote_sessions,
	);
	ipcMain.handle(
		"terminate_remote_session",
		remoteControlHandlers.terminate_remote_session,
	);
	ipcMain.handle(
		"test_remote_channel",
		remoteControlHandlers.test_remote_channel,
	);
	ipcMain.handle(
		"list_remote_event_logs",
		remoteControlHandlers.list_remote_event_logs,
	);
	ipcMain.handle(
		"cloud_node_get_status",
		cloudNodeHandlers.cloud_node_get_status,
	);
	ipcMain.handle(
		"cloud_node_set_config",
		cloudNodeHandlers.cloud_node_set_config,
	);
	ipcMain.handle("cloud_node_bind", cloudNodeHandlers.cloud_node_bind);
	ipcMain.handle("cloud_node_unbind", cloudNodeHandlers.cloud_node_unbind);
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

	ipcMain.handle("invoke_image_generation", (async (_event, input) => {
		logger.info({ msg: "invoke_image_generation called", model: input.model });
		return invokeImageGeneration(db, input);
	}) satisfies IpcHandler<"invoke_image_generation">);

	// ==================
	// 生图配置
	// ==================
	ipcMain.handle("get_image_gen_config", imageGenHandlers.get_image_gen_config);
	ipcMain.handle("set_image_gen_config", imageGenHandlers.set_image_gen_config);
	ipcMain.handle(
		"generate_image_for_text",
		imageGenHandlers.generate_image_for_text,
	);

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
	ipcMain.handle("mcp_list_tools", mcpHandlers.mcp_list_tools);
	ipcMain.handle("mcp_call_tool", mcpHandlers.mcp_call_tool);
	ipcMain.handle("mcp_stop_server", mcpHandlers.mcp_stop_server);

	// ==================
	// Data Stats & Management
	// ==================
	ipcMain.handle("get_data_stats", dataStatsHandlers.get_data_stats);
	ipcMain.handle("get_data_directory", dataStatsHandlers.get_data_directory);
	ipcMain.handle("get_database_path", dataStatsHandlers.get_database_path);
	ipcMain.handle("clear_cache", dataStatsHandlers.clear_cache);
	ipcMain.handle("clear_all_data", dataStatsHandlers.clear_all_data);

	// ==================
	// Storage / Vault
	// ==================
	ipcMain.handle("storage_get_settings", storageHandlers.storage_get_settings);
	ipcMain.handle(
		"storage_update_settings",
		storageHandlers.storage_update_settings,
	);
	ipcMain.handle(
		"storage_pick_directory",
		storageHandlers.storage_pick_directory,
	);
	ipcMain.handle(
		"storage_reveal_vault_root",
		storageHandlers.storage_reveal_vault_root,
	);
	ipcMain.handle(
		"project_reveal_directory",
		storageHandlers.project_reveal_directory,
	);
	ipcMain.handle("file_list", fileHandlers.file_list);
	ipcMain.handle("file_move", fileHandlers.file_move);
	ipcMain.handle("file_delete", fileHandlers.file_delete);
	ipcMain.handle("file_restore", fileHandlers.file_restore);
	ipcMain.handle("file_reveal_in_finder", fileHandlers.file_reveal_in_finder);
	ipcMain.handle("file_set_scope", fileHandlers.file_set_scope);
	ipcMain.handle("file_set_tags", fileHandlers.file_set_tags);
	ipcMain.handle("theme_list", fileHandlers.theme_list);
	ipcMain.handle("theme_create", fileHandlers.theme_create);
	ipcMain.handle("theme_rename", fileHandlers.theme_rename);
	ipcMain.handle("theme_delete", fileHandlers.theme_delete);

	// ==================
	// Sync & Backup
	// ==================
	ipcMain.handle("get_sync_config", syncHandlers.get_sync_config);
	ipcMain.handle("update_sync_config", syncHandlers.update_sync_config);
	ipcMain.handle("list_backup_history", syncHandlers.list_backup_history);
	ipcMain.handle("create_backup_record", syncHandlers.create_backup_record);
	ipcMain.handle("clean_old_backups", syncHandlers.clean_old_backups);
	// WebDAV 操作
	ipcMain.handle("backup_to_webdav", syncHandlers.backup_to_webdav);
	ipcMain.handle("restore_from_webdav", syncHandlers.restore_from_webdav);
	ipcMain.handle("list_webdav_backups", syncHandlers.list_webdav_backups);
	ipcMain.handle("delete_webdav_backup", syncHandlers.delete_webdav_backup);
	ipcMain.handle("test_webdav_connection", syncHandlers.test_webdav_connection);

	// ==================
	// Import / Export
	// ==================
	ipcMain.handle("export_all_data", importExportHandlers.export_all_data);
	ipcMain.handle("export_project", importExportHandlers.export_project);
	ipcMain.handle("import_data", importExportHandlers.import_data);
	ipcMain.handle(
		"import_data_from_json",
		importExportHandlers.import_data_from_json,
	);

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
	ipcMain.handle(
		"agent_sdk_resolve_interaction",
		agentSdkHandlers.agent_sdk_resolve_interaction,
	);
	ipcMain.handle("agent_sdk_control", agentSdkHandlers.agent_sdk_control);

	// ==================
	// Agent Checkpoints (断点续传)
	// ==================
	ipcMain.handle(
		"agent_checkpoint_save",
		checkpointHandlers.agent_checkpoint_save,
	);
	ipcMain.handle(
		"agent_checkpoint_get",
		checkpointHandlers.agent_checkpoint_get,
	);
	ipcMain.handle(
		"agent_checkpoint_delete",
		checkpointHandlers.agent_checkpoint_delete,
	);
	ipcMain.handle(
		"agent_checkpoint_cleanup",
		checkpointHandlers.agent_checkpoint_cleanup,
	);

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

	// ==================
	// Artifacts (产物管理)
	// ==================
	ipcMain.handle("artifact_save", artifactHandlers.artifact_save);
	ipcMain.handle("artifact_list", artifactHandlers.artifact_list);
	ipcMain.handle("artifact_get", artifactHandlers.artifact_get);
	ipcMain.handle("artifact_delete", artifactHandlers.artifact_delete);
	ipcMain.handle("artifact_reveal", artifactHandlers.artifact_reveal);
	ipcMain.handle("artifact_download", artifactHandlers.artifact_download);
	ipcMain.handle(
		"artifact_import_to_library",
		artifactHandlers.artifact_import_to_library,
	);
	ipcMain.handle("artifact_cleanup", artifactHandlers.artifact_cleanup);
	ipcMain.handle(
		"artifact_get_settings",
		artifactHandlers.artifact_get_settings,
	);
	ipcMain.handle(
		"artifact_update_settings",
		artifactHandlers.artifact_update_settings,
	);

	// ==================
	// Local Backup (本地备份)
	// ==================
	ipcMain.handle(
		"list_local_backup_files",
		localBackupHandlers.list_local_backup_files,
	);
	ipcMain.handle(
		"delete_local_backup_file",
		localBackupHandlers.delete_local_backup_file,
	);
	ipcMain.handle(
		"backup_to_local_dir",
		localBackupHandlers.backup_to_local_dir,
	);
	ipcMain.handle(
		"restore_from_local_file",
		localBackupHandlers.restore_from_local_file,
	);
	ipcMain.handle(
		"select_backup_directory",
		localBackupHandlers.select_backup_directory,
	);

	// ==================
	// Terminal (终端)
	// ==================
	ipcMain.handle("terminal_create", terminalHandlers.terminal_create);
	ipcMain.handle("terminal_write", terminalHandlers.terminal_write);
	ipcMain.handle("terminal_resize", terminalHandlers.terminal_resize);
	ipcMain.handle("terminal_destroy", terminalHandlers.terminal_destroy);
	ipcMain.handle("terminal_list", terminalHandlers.terminal_list);

	// ==================
	// Git Worktree (沙盒隔离)
	// ==================
	ipcMain.handle("worktree_create", worktreeHandlers.worktree_create);
	ipcMain.handle("worktree_list", worktreeHandlers.worktree_list);
	ipcMain.handle("worktree_merge", worktreeHandlers.worktree_merge);
	ipcMain.handle("worktree_remove", worktreeHandlers.worktree_remove);
	ipcMain.handle("worktree_diff", worktreeHandlers.worktree_diff);

	logger.info({ msg: "IPC handlers registered", count: 100 });
}
