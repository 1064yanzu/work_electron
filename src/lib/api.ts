import { safeInvoke } from "./tauriBridge";

// ==================== 临时文件管理 ====================

export interface SaveTempFilePayload {
	content: string;
	extension?: string; // 文件扩展名，如 "txt", "md", "json"
	prefix?: string; // 文件名前缀
	encoding?: "utf-8" | "base64";
}

export interface TempFileResult {
	path: string;
	size: number;
}

export async function saveTempFile(
	payload: SaveTempFilePayload,
): Promise<TempFileResult> {
	return safeInvoke<TempFileResult>("save_temp_file", { payload });
}

export async function getAgentSandboxDir(
	taskId: string,
): Promise<{ path: string }> {
	return safeInvoke<{ path: string }>("agent_get_sandbox_dir", { taskId });
}

import type {
	ApiKeyCheckResult,
	AppendWorkflowLogPayload,
	Card,
	CreateFolderPayload,
	CreateNotePayload,
	CreateOutputPayload,
	CreateSourcePayload,
	CreateWorkflowPayload,
	DashboardStats,
	FetchUrlPayload,
	Folder,
	ImportLocalFilesPayload,
	InvokeLlmPayload,
	ListWorkflowLogsPayload,
	LlmResponse,
	MoveSourcesToFolderPayload,
	Note,
	NoteChunkSearchHit,
	OutputAsset,
	Project,
	Provider,
	SearchSourcePayload,
	Source,
	SourceDetail,
	UpdateFolderPayload,
	UpdateNotePayload,
	UpdateOutputPayload,
	UpdateSourcePayload,
	UpdateWorkflowPayload,
	UploadFilePayload,
	UpsertProviderPayload,
	Uuid,
	WebSearchResult,
	WorkflowNode,
	WorkflowRunLog,
} from "../types";

// Projects
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
	return await safeInvoke("record_project_visit", { projectId });
}

// Folders
export async function listFolders(projectId?: Uuid | null): Promise<Folder[]> {
	return await safeInvoke("list_folders", { projectId: projectId ?? null });
}

export async function createFolder(
	payload: CreateFolderPayload,
): Promise<Folder> {
	return await safeInvoke("create_folder", { payload });
}

export async function updateFolder(
	payload: UpdateFolderPayload,
): Promise<Folder> {
	return await safeInvoke("update_folder", { payload });
}

export async function deleteFolder(id: Uuid): Promise<void> {
	return await safeInvoke("delete_folder", { id });
}

export async function moveSourcesToFolder(
	payload: MoveSourcesToFolderPayload,
): Promise<number> {
	return await safeInvoke("move_sources_to_folder", { payload });
}

// Sources
export async function createSource(
	payload: CreateSourcePayload,
): Promise<Source> {
	return await safeInvoke("create_source", { payload });
}

export async function listSources(): Promise<Source[]> {
	return await safeInvoke("list_sources");
}

export async function searchSources(
	payload?: SearchSourcePayload,
): Promise<Source[]> {
	return await safeInvoke("search_sources", { payload });
}

export async function getSource(id: Uuid): Promise<Source> {
	return await safeInvoke("get_source", { id });
}

export async function getSourceDetail(id: Uuid): Promise<SourceDetail> {
	return await safeInvoke("get_source_detail", { id });
}

export async function updateSource(
	payload: UpdateSourcePayload,
): Promise<Source> {
	return await safeInvoke("update_source", { payload });
}

export async function deleteSource(id: Uuid): Promise<void> {
	return await safeInvoke("delete_source", { id });
}

// Notes
export async function createNote(payload: CreateNotePayload): Promise<Note> {
	return await safeInvoke("create_note", { payload });
}

export async function listNotes(): Promise<Note[]> {
	return await safeInvoke("list_notes");
}

export async function updateNote(payload: UpdateNotePayload): Promise<Note> {
	return await safeInvoke("update_note", { payload });
}

export async function deleteNote(id: Uuid): Promise<void> {
	return await safeInvoke("delete_note", { id });
}

// Workflows
export async function createWorkflowNode(
	payload: CreateWorkflowPayload,
): Promise<WorkflowNode> {
	return await safeInvoke("create_workflow_node", { payload });
}

export async function listWorkflowNodes(): Promise<WorkflowNode[]> {
	return await safeInvoke("list_workflow_nodes");
}

export async function updateWorkflowNode(
	payload: UpdateWorkflowPayload,
): Promise<WorkflowNode> {
	return await safeInvoke("update_workflow_node", { payload });
}

export async function deleteWorkflowNode(id: Uuid): Promise<void> {
	return await safeInvoke("delete_workflow_node", { id });
}

export async function appendWorkflowLog(
	payload: AppendWorkflowLogPayload,
): Promise<WorkflowRunLog> {
	return await safeInvoke("append_workflow_log", { payload });
}

export async function listWorkflowLogs(
	payload?: ListWorkflowLogsPayload,
): Promise<WorkflowRunLog[]> {
	return await safeInvoke("list_workflow_logs", { payload });
}

// Outputs
export async function createOutputAsset(
	payload: CreateOutputPayload,
): Promise<OutputAsset> {
	return await safeInvoke("create_output_asset", { payload });
}

export async function listOutputAssets(): Promise<OutputAsset[]> {
	return await safeInvoke("list_output_assets");
}

export async function updateOutputAsset(
	payload: UpdateOutputPayload,
): Promise<OutputAsset> {
	return await safeInvoke("update_output_asset", { payload });
}

export async function deleteOutputAsset(id: Uuid): Promise<void> {
	return await safeInvoke("delete_output_asset", { id });
}

// Stats
export async function getDashboardStats(): Promise<DashboardStats> {
	return await safeInvoke("dashboard_stats");
}

// Providers
export async function listProviders(): Promise<Provider[]> {
	return await safeInvoke("list_providers");
}

export async function upsertProvider(
	payload: UpsertProviderPayload,
): Promise<Provider> {
	return await safeInvoke("upsert_provider", { payload });
}

export async function deleteProvider(providerId: string): Promise<void> {
	return await safeInvoke("delete_provider", { providerId });
}

export async function setActiveModel(model: string): Promise<void> {
	return await safeInvoke("set_active_model", { model });
}

export async function getActiveModel(): Promise<string | null> {
	return await safeInvoke("get_active_model");
}

// LLM
export async function invokeLlm(
	payload: InvokeLlmPayload,
): Promise<LlmResponse> {
	return await safeInvoke("invoke_llm", { payload });
}

// Content Fetching
export async function fetchUrlContent(
	payload: FetchUrlPayload,
): Promise<Source> {
	return await safeInvoke("fetch_url_content", { payload });
}

export async function uploadFileContent(
	payload: UploadFilePayload,
): Promise<Source> {
	return await safeInvoke("upload_file_content", { payload });
}

export async function importLocalFiles(
	payload: ImportLocalFilesPayload,
): Promise<SourceDetail[]> {
	return await safeInvoke("import_local_files", { payload });
}

export interface ParseHtmlPayload {
	url: string;
	html: string;
	title?: string;
	tags?: string[];
	project_id?: Uuid;
}

export async function parseHtmlContent(
	payload: ParseHtmlPayload,
): Promise<Source> {
	return await safeInvoke("parse_html_content", { payload });
}

export async function checkProviderApiKey(
	providerId: string,
): Promise<ApiKeyCheckResult> {
	return await safeInvoke("check_provider_api_key", { providerId });
}

// 数据库管理
export async function getDatabasePath(): Promise<string> {
	return await safeInvoke("get_database_path");
}

export async function setDatabasePath(newPath: string): Promise<void> {
	return await safeInvoke("set_database_path", { newPath });
}

export async function importDataFromJson(jsonData: string): Promise<void> {
	return await safeInvoke("import_data_from_json", { jsonData });
}

// Web 搜索
export async function webSearch(payload: {
	query: string;
	engine?: string;
}): Promise<WebSearchResult[]> {
	return await safeInvoke("web_search", { payload });
}

export interface KbSearchChunksPayload {
	query: string;
	limit?: number;
	source_id?: Uuid;
}

export async function kbSearchChunks(
	payload: KbSearchChunksPayload,
): Promise<NoteChunkSearchHit[]> {
	return await safeInvoke("kb_search_chunks", { payload });
}

export interface KbEmbeddingStats {
	embedding_model: string | null;
	total_chunks: number;
	embedded_chunks: number;
	missing_chunks: number;
}

export async function kbGetEmbeddingStats(): Promise<KbEmbeddingStats> {
	return await safeInvoke("kb_get_embedding_stats");
}

export interface KbEmbeddingsRebuildPayload {
	embedding_model: string;
	note_id?: Uuid;
	force?: boolean;
	batch_size?: number;
}

export async function kbEmbeddingsRebuild(
	payload: KbEmbeddingsRebuildPayload,
): Promise<number> {
	return await safeInvoke("kb_embeddings_rebuild", { payload });
}

// Data Management
export async function clearAllData(): Promise<void> {
	return await safeInvoke("clear_all_data");
}

export async function resetCoreProviders(): Promise<void> {
	return await safeInvoke("reset_core_providers");
}

export async function exportAllData(): Promise<string> {
	return await safeInvoke("export_all_data");
}

export interface DailyActivity {
	date: string;
	count: number;
}

export async function getDailyActivity(days: number): Promise<DailyActivity[]> {
	return await safeInvoke("get_daily_activity", { days });
}

// ==================== 分享卡片 ====================

export async function listCards(): Promise<Card[]> {
	return await safeInvoke("list_cards");
}

export async function getCard(id: Uuid): Promise<Card> {
	return await safeInvoke("get_card", { id });
}

export async function deleteCard(id: Uuid): Promise<void> {
	return await safeInvoke("delete_card", { id });
}

// 获取卡片图片的完整路径（用于前端展示）
export async function getCardImagePath(imagePath: string): Promise<string> {
	return await safeInvoke("get_card_image_path", { imagePath });
}

// ==================== 同步与备份 ====================

export interface SyncConfig {
	id: string;
	data_path: string | null;
	webdav_enabled: boolean;
	webdav_url: string | null;
	webdav_username: string | null;
	webdav_password: string | null;
	webdav_path: string;
	// WebDAV 高级配置
	webdav_auto_sync: boolean;
	webdav_sync_interval: number;
	webdav_max_backups: number;
	webdav_skip_backup_file: boolean;
	webdav_disable_stream: boolean;
	webdav_last_sync_at: number | null;
	webdav_last_sync_error: string | null;
	// 通用备份配置
	auto_backup_enabled: boolean;
	auto_backup_interval: number;
	max_backup_count: number;
	sync_on_startup: boolean;
	sync_on_change: boolean;
	compact_backup: boolean;
	last_backup_at: string | null;
	last_sync_at: string | null;
	last_sync_status: string | null;
	last_sync_error: string | null;
	// 本地备份目录配置
	local_backup_dir: string | null;
	local_backup_auto_sync: boolean;
	local_backup_interval: number;
	local_backup_max_count: number;
	local_backup_last_sync_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface WebDAVTestResult {
	success: boolean;
	message: string;
	server_info: string | null;
}

export interface DataStats {
	sources_count: number;
	notes_count: number;
	workflows_count: number;
	outputs_count: number;
	cards_count: number;
	providers_count: number;
	database_size: number;
	media_size: number;
	cache_size: number;
}

export interface BackupHistory {
	id: string;
	backup_type: string;
	backup_path: string | null;
	file_size: number | null;
	data_version: string | null;
	is_compact: boolean;
	status: string;
	error_message: string | null;
	created_at: string;
}

export async function getSyncConfig(): Promise<SyncConfig> {
	return await safeInvoke("get_sync_config");
}

export async function updateSyncConfig(config: SyncConfig): Promise<void> {
	return await safeInvoke("update_sync_config", { config });
}

export interface WebDavConfig {
	webdavHost: string;
	webdavUser?: string;
	webdavPass?: string;
	webdavPath?: string;
	fileName?: string;
	skipBackupFile?: boolean;
	disableStream?: boolean;
	encryptionPassword?: string; // 加密密码（可选）
}

export interface WebdavBackupFile {
	fileName: string;
	modifiedTime: string;
	size: number;
}

export async function testWebdavConnection(
	config: WebDavConfig,
): Promise<boolean> {
	return await safeInvoke("test_webdav_connection", { config });
}

export async function backupToWebdav(
	data: string,
	config: WebDavConfig,
): Promise<any> {
	return await safeInvoke("backup_to_webdav", { data, config });
}

export async function restoreFromWebdav(
	config: WebDavConfig,
): Promise<string> {
	return await safeInvoke("restore_from_webdav", { config });
}

export async function listWebdavBackups(
	config: WebDavConfig,
): Promise<WebdavBackupFile[]> {
	return await safeInvoke("list_webdav_backups", { config });
}

export async function getDataStats(): Promise<DataStats> {
	return await safeInvoke("get_data_stats");
}

// ==================== 本地备份目录 ====================

export interface LocalBackupFileInfo {
	fileName: string;
	modifiedTime: string;
	size: number;
}

/** 列出本地备份文件 */
export async function listLocalBackupFiles(
	dir: string,
): Promise<LocalBackupFileInfo[]> {
	return await safeInvoke("list_local_backup_files", { dir });
}

/** 删除本地备份文件 */
export async function deleteLocalBackupFile(
	dir: string,
	fileName: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("delete_local_backup_file", { dir, fileName });
}

/** 备份到本地目录 */
export async function backupToLocalDir(
	dir: string,
	fileName?: string,
): Promise<{ path: string; size: number }> {
	return await safeInvoke("backup_to_local_dir", { dir, fileName });
}

/** 从本地备份恢复 */
export async function restoreFromLocalFile(
	dir: string,
	fileName: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("restore_from_local_file", { dir, fileName });
}

/** 选择本地备份目录 */
export async function selectBackupDirectory(): Promise<{ path: string | null }> {
	return await safeInvoke("select_backup_directory");
}

export async function listBackupHistory(
	limit?: number,
): Promise<BackupHistory[]> {
	return await safeInvoke("list_backup_history", { limit });
}

export async function clearCache(): Promise<number> {
	return await safeInvoke("clear_cache");
}

export async function getDataDirectory(): Promise<string> {
	return await safeInvoke("get_data_directory");
}

export async function backupToLocal(targetPath?: string): Promise<string> {
	return await safeInvoke("backup_to_local", { targetPath });
}

export async function restoreFromLocal(filePath: string): Promise<void> {
	return await safeInvoke("restore_from_local", { filePath });
}

export async function deleteWebdavBackup(
	fileName: string,
	config: WebDavConfig,
): Promise<any> {
	return await safeInvoke("delete_webdav_backup", { fileName, config });
}

// ==================== 产物管理 ====================

export interface ArtifactMetadata {
	id: string;
	session_id: string;
	file_name: string;
	file_path: string;
	file_type: string;
	file_size: number;
	mime_type: string;
	tool_call_id?: string;
	description?: string;
	created_at: number;
	expires_at?: number;
}

export interface ArtifactSettings {
	storage_path: string;
	auto_cleanup: boolean;
	retention_days: number;
	max_per_session: number;
	max_total_size: number;
}

export interface ArtifactCleanupResult {
	deleted_count: number;
	freed_bytes: number;
	errors: string[];
}

export interface SaveArtifactPayload {
	session_id: string;
	file_name: string;
	content: string;
	encoding?: "utf-8" | "base64";
	tool_call_id?: string;
	description?: string;
}

export async function saveArtifact(
	payload: SaveArtifactPayload,
): Promise<ArtifactMetadata> {
	return await safeInvoke("artifact_save", { ...payload });
}

export async function listArtifacts(
	sessionId?: string,
	limit?: number,
): Promise<ArtifactMetadata[]> {
	return await safeInvoke("artifact_list", { session_id: sessionId, limit });
}

export async function getArtifact(id: string): Promise<ArtifactMetadata | null> {
	return await safeInvoke("artifact_get", { id });
}

export async function deleteArtifact(id: string): Promise<{ success: boolean }> {
	return await safeInvoke("artifact_delete", { id });
}

export async function revealArtifact(id: string): Promise<{ success: boolean }> {
	return await safeInvoke("artifact_reveal", { id });
}

export async function downloadArtifact(
	id: string,
	destPath?: string,
): Promise<{ path: string }> {
	return await safeInvoke("artifact_download", { id, dest_path: destPath });
}

export async function importArtifactToLibrary(
	id: string,
	folderId?: string,
): Promise<Source> {
	return await safeInvoke("artifact_import_to_library", {
		id,
		folder_id: folderId,
	});
}

export async function cleanupArtifacts(
	force?: boolean,
): Promise<ArtifactCleanupResult> {
	return await safeInvoke("artifact_cleanup", { force });
}

export async function getArtifactSettings(): Promise<ArtifactSettings> {
	return await safeInvoke("artifact_get_settings");
}

export async function updateArtifactSettings(
	settings: Partial<ArtifactSettings>,
): Promise<ArtifactSettings> {
	return await safeInvoke("artifact_update_settings", settings);
}

