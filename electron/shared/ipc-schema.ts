/**
 * IPC Schema - 类型安全的 IPC 契约定义
 * 定义所有前后端通信的命令及其输入输出类型
 */

import type {
	AgentCheckpoint,
	AgentMessage,
	AgentSession,
	AppConfig,
	ArtifactCleanupResult,
	ArtifactMetadata,
	ArtifactSettings,
	CreateFolderPayload,
	CreateNotePayload,
	CreateOutputPayload,
	CreateProjectPayload,
	CreateSourcePayload,
	DashboardStats,
	FileRecord,
	Folder,
	InvokeLlmPayload,
	InvokeLlmResult,
	Note,
	OutputAsset,
	Project,
	Provider,
	SaveCheckpointPayload,
	Source,
	StorageSettings,
	Theme,
	UpdateFolderPayload,
	UpdateNotePayload,
	UpdateOutputPayload,
	UpdateProjectPayload,
	UpdateSourcePayload,
	UpsertProviderPayload,
} from "./types";
import type {
	BackendCapabilityMatrix,
	CodingWorkspaceProfile,
	RuntimeControlAction,
	WorkspaceMemoryReadResult,
	WorkspaceMemoryWriteInput,
	WorkspaceProfileUpdateInput,
} from "./coding-workspace";
import type {
	CliHistoryListParams,
	CliHistoryReadParams,
	CliHistoryReadResult,
	ExternalThreadMeta,
} from "./external-history-types";
import type { RemoteGatewayScope } from "./remote-control-schema";

type RemoteChannelId =
	| "feishu"
	| "telegram"
	| "slack"
	| "discord"
	| "generic_webhook";
type RemotePairingStatus = "pending" | "approved" | "rejected" | "revoked";
type RemotePairingRecordStatus = "approved" | "revoked";
type RemoteSessionState =
	| "running"
	| "waiting_interaction"
	| "completed"
	| "aborted"
	| "error";
type CloudNodeRoutingMode = "cloud_only" | "prefer_desktop" | "auto";

/** CLI 二进制检测结果（跨平台） */
type CliDetectionSource = "user_configured" | "system_detected" | "sdk_bundled" | "not_found";
export interface CliDetectionResult {
	backend: "claude-code" | "codex";
	path: string | null;
	source: CliDetectionSource;
	version: string | null;
	detectedAt: number;
	error?: string;
}

export type IPCSchema = {
	// ==================
	// 系统命令
	// ==================
	app_get_version: {
		input: Record<string, never>;
		output: {
			appVersion: string;
			electron: string;
			chrome: string;
			node: string;
		};
	};
	health_ping: {
		input: { ts: number };
		output: { ts: number };
	};
	http_get_status: {
		input: Record<string, never>;
		output: {
			clip: { port: number; baseUrl: string };
			anthropicProxy: { port: number; baseUrl: string };
		};
	};
	open_browser_window: {
		input: { url: string };
		output: { success: boolean };
	};
	fetch_page_content: {
		input: { url: string };
		output: {
			url: string;
			title: string;
			content: string;
			description?: string;
			favicon?: string;
		};
	};
	browser_search: {
		input: {
			request: {
				query: string;
				engine: string;
				use_playwright: boolean;
				limit?: number;
			};
		};
		output: Array<{
			title: string;
			snippet: string;
			url: string;
			screenshot?: string;
		}>;
	};
	exa_mcp_search: {
		input: { query: string; limit?: number };
		output: Array<{
			title: string;
			snippet: string;
			url: string;
			screenshot?: string;
		}>;
	};

	// ==================
	// Content Ingest (抓取 / 导入)
	// ==================
	fetch_url_content: {
		input: {
			url: string;
			title?: string;
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
			category?: Source["category"];
		};
		output: Source;
	};
	upload_file_content: {
		input: {
			title: string;
			content: string;
			file_type: string;
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
			category?: Source["category"];
		};
		output: Source;
	};
	import_local_files: {
		input: {
			paths: string[];
			tags?: string[];
			project_id?: string;
			folder_id?: string;
			source_type?: Source["source_type"];
		};
		output: Array<{ source: Source; note: Note }>;
	};

	// ==================
	// FS Safe / Temp File
	// ==================
	read_file_safe: {
		input: { path: string; encoding?: "utf-8" | "base64" };
		output: { content: string; encoding: string; size: number };
	};
	write_file_safe: {
		input: {
			path: string;
			content: string;
			encoding?: "utf-8" | "base64";
			create_dirs?: boolean;
		};
		output: { success: boolean };
	};
	list_files_safe: {
		input: { path: string; recursive?: boolean };
		output: Array<{
			path: string;
			name: string;
			is_file: boolean;
			is_dir: boolean;
			size?: number;
		}>;
	};
	mkdir_safe: {
		input: { path: string; recursive?: boolean };
		output: { success: boolean };
	};
	copy_file_safe: {
		input: { src: string; dest: string; create_dirs?: boolean };
		output: { success: boolean };
	};
	move_file_safe: {
		input: { src: string; dest: string; create_dirs?: boolean };
		output: { success: boolean };
	};
	delete_file_safe: {
		input: { path: string };
		output: { success: boolean };
	};
	reveal_file_safe: {
		input: { path: string };
		output: { success: boolean };
	};
	save_temp_file: {
		input: {
			content: string;
			extension?: string;
			prefix?: string;
			encoding?: "utf-8" | "base64";
		};
		output: { path: string; size: number };
	};
	agent_get_sandbox_dir: {
		input: { taskId: string };
		output: { path: string };
	};

	// ==================
	// Documents
	// ==================
	convert_docx_to_html: {
		input: { path: string };
		output: { html: string };
	};

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
	// Folders 命令
	// ==================
	list_folders: {
		input: { project_id?: string };
		output: Folder[];
	};
	create_folder: {
		input: CreateFolderPayload;
		output: Folder;
	};
	update_folder: {
		input: UpdateFolderPayload;
		output: Folder;
	};
	delete_folder: {
		input: { id: string };
		output: { success: boolean };
	};
	move_sources_to_folder: {
		input: { source_ids: string[]; folder_id: string | null };
		output: { success: boolean; count: number };
	};

	// ==================
	// Sources 命令
	// ==================
	list_sources: {
		input: { project_id?: string; folder_id?: string; limit?: number };
		output: Source[];
	};
	get_source: {
		input: { id: string };
		output: Source | null;
	};
	get_source_detail: {
		input: { id: string };
		output: { source: Source; note: Note | null } | null;
	};
	create_source: {
		input: CreateSourcePayload;
		output: Source;
	};
	update_source: {
		input: UpdateSourcePayload;
		output: Source;
	};
	delete_source: {
		input: { id: string };
		output: { success: boolean };
	};
	search_sources: {
		input: { query: string; project_id?: string; limit?: number };
		output: Source[];
	};

	// ==================
	// Notes 命令
	// ==================
	list_notes: {
		input: { source_id?: string };
		output: Note[];
	};
	create_note: {
		input: CreateNotePayload;
		output: Note;
	};
	update_note: {
		input: UpdateNotePayload;
		output: Note;
	};
	delete_note: {
		input: { id: string };
		output: { success: boolean };
	};

	// ==================
	// Knowledge Base 命令
	// ==================
	kb_search_chunks: {
		input: { query: string; limit?: number; source_id?: string };
		output: Array<{
			chunk_id: string;
			content: string;
			score: number;
			snippet: string;
		}>;
	};
	kb_chunk_rebuild: {
		input: { note_id: string };
		output: { success: boolean; chunk_count: number };
	};
	kb_get_embedding_stats: {
		input: Record<string, never>;
		output: {
			embedding_model: string | null;
			total_chunks: number;
			embedded_chunks: number;
			missing_chunks: number;
		};
	};
	kb_embeddings_rebuild: {
		input: {
			embedding_model: string;
			note_id?: string;
			force?: boolean;
			batch_size?: number;
		};
		output: number;
	};

	// ==================
	// Agent Skills
	// ==================
	list_skills: {
		input: Record<string, never>;
		output: Array<{
			name: string;
			description: string;
			location: string;
			enabled: boolean;
		}>;
	};
	import_skill: {
		input: { sourcePath: string };
		output: {
			name: string;
			description: string;
			location: string;
			enabled: boolean;
		};
	};
	delete_skill: {
		input: { skillName: string };
		output: { success: boolean };
	};
	set_skill_enabled: {
		input: { skillName: string; enabled: boolean };
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
	// Cards（分享卡片）
	// ==================
	list_cards: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			title: string;
			text: string;
			image_path: string;
			source_url?: string;
			theme_id?: string;
			font_id?: string;
			aspect_ratio?: string;
			created_at: number;
			updated_at: number;
		}>;
	};
	get_card: {
		input: { id: string };
		output: {
			id: string;
			title: string;
			text: string;
			image_path: string;
			source_url?: string;
			theme_id?: string;
			font_id?: string;
			aspect_ratio?: string;
			created_at: number;
			updated_at: number;
		};
	};
	delete_card: {
		input: { id: string };
		output: { success: boolean };
	};
	get_card_image_path: {
		input: { image_path: string };
		output: { path: string };
	};

	// ==================
	// MCP Servers
	// ==================
	list_mcp_servers: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		}>;
	};
	get_mcp_server: {
		input: { id: string };
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		} | null;
	};
	create_mcp_server: {
		input: {
			name: string;
			command: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		};
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		};
	};
	update_mcp_server: {
		input: {
			id: string;
			name?: string;
			command?: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		};
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		};
	};
	delete_mcp_server: {
		input: { id: string };
		output: { success: boolean };
	};
	toggle_mcp_server: {
		input: { id: string; enabled: boolean };
		output: { success: boolean };
	};
	mcp_check_env: {
		input: Record<string, never>;
		output: {
			node_version: string | null;
			npx_version: string | null;
			path: string;
			shell: string | null;
			valid: boolean;
		};
	};
	mcp_list_tools: {
		input: { server_id: string; force_refresh?: boolean };
		output: Array<{
			name: string;
			description?: string | null;
			inputSchema?: unknown;
		}>;
	};
	mcp_call_tool: {
		input: {
			server_id: string;
			tool_name: string;
			arguments?: Record<string, unknown>;
		};
		output: {
			content: Array<{
				type: string;
				text?: string | null;
				data?: string | null;
				mimeType?: string | null;
			}>;
			isError?: boolean | null;
		};
	};
	mcp_stop_server: {
		input: { server_id: string };
		output: { success: boolean };
	};

	// ==================
	// Providers 命令
	list_providers: {
		input: Record<string, never>;
		output: Provider[];
	};
	upsert_provider: {
		input: UpsertProviderPayload;
		output: Provider;
	};
	delete_provider: {
		input: { id: string };
		output: { success: boolean };
	};
	check_provider_api_key: {
		input: { provider_id: string };
		output: { valid: boolean; error?: string };
	};
	reset_core_providers: {
		input: Record<string, never>;
		output: { success: boolean; count: number };
	};
	provider_fetch_models: {
		input: {
			providerType?: string;
			provider_type?: string;
			apiBase?: string;
			api_base?: string;
			apiKey?: string;
			api_key?: string;
			templateId?: string;
			template_id?: string;
			metadata?: Record<string, unknown>;
		};
		output: {
			models: Array<{
				id: string;
				object?: string;
				created?: number;
				owned_by?: string;
			}>;
			error?: string;
		};
	};

	// ==================
	// System / Shell
	// ==================
	open_external_url: {
		input: { url: string };
		output: { success: boolean; error?: string };
	};

	// ==================
	// Config 命令
	// ==================
	get_config: {
		input: { key: string };
		output: string | null;
	};
	set_config: {
		input: { key: string; value: string };
		output: { success: boolean };
	};
	get_remote_control_config: {
		input: Record<string, never>;
		output: {
			enabled: boolean;
			channels: {
				feishu: {
					enabled: boolean;
					appId?: string;
					appSecret?: string;
					domain: "feishu" | "lark";
					connectionMode: "websocket" | "webhook";
					webhookPath: string;
					webhookPort?: number;
					dmPolicy: "pairing" | "allowlist" | "open";
					allowFrom: string[];
					groupPolicy: "disabled" | "allowlist" | "open";
					groupAllowFrom: string[];
					requireMention: boolean;
					enableAttachmentMerge: boolean;
					attachmentMergeWindowSec: number;
					enableDocLinkPrefetch: boolean;
					enableDocxMcp: boolean;
					enableDocWriteOps: boolean;
					enableDocFileDelete: boolean;
					enableLegacyDocsRead: boolean;
					enableDocCommandFallback: boolean;
					textChunkLimit: number;
					rateLimitPerMinute: number;
				};
				telegram: {
					enabled: boolean;
					botToken?: string;
					dmPolicy: "pairing" | "allowlist" | "open";
					allowFrom: string[];
					groupPolicy: "disabled" | "allowlist" | "open";
					groupAllowFrom: string[];
					requireMention: boolean;
					textChunkLimit: number;
					rateLimitPerMinute: number;
				};
				slack: {
					enabled: boolean;
					botToken?: string;
					appToken?: string;
					signingSecret?: string;
					dmPolicy: "pairing" | "allowlist" | "open";
					allowFrom: string[];
					groupPolicy: "disabled" | "allowlist" | "open";
					groupAllowFrom: string[];
					requireMention: boolean;
					textChunkLimit: number;
					rateLimitPerMinute: number;
				};
				discord: {
					enabled: boolean;
					botToken?: string;
					applicationId?: string;
					dmPolicy: "pairing" | "allowlist" | "open";
					allowFrom: string[];
					groupPolicy: "disabled" | "allowlist" | "open";
					groupAllowFrom: string[];
					requireMention: boolean;
					textChunkLimit: number;
					rateLimitPerMinute: number;
				};
				generic_webhook: { enabled: boolean; note?: string };
			};
			security: {
				interactionTimeoutSec: number;
				defaultScopes: RemoteGatewayScope[];
			};
			mobileGateway: {
				enabled: boolean;
				port: number;
				host: string;
				requirePairing: boolean;
			};
		};
	};
	set_remote_control_config: {
		input: {
			config: {
				enabled: boolean;
				channels: {
					feishu: {
						enabled: boolean;
						appId?: string;
						appSecret?: string;
						domain: "feishu" | "lark";
						connectionMode: "websocket" | "webhook";
						webhookPath: string;
						webhookPort?: number;
						dmPolicy: "pairing" | "allowlist" | "open";
						allowFrom: string[];
						groupPolicy: "disabled" | "allowlist" | "open";
						groupAllowFrom: string[];
						requireMention: boolean;
						enableAttachmentMerge: boolean;
						attachmentMergeWindowSec: number;
						enableDocLinkPrefetch: boolean;
						enableDocxMcp: boolean;
						enableDocWriteOps: boolean;
						enableDocFileDelete: boolean;
						enableLegacyDocsRead: boolean;
						enableDocCommandFallback: boolean;
						textChunkLimit: number;
						rateLimitPerMinute: number;
					};
					telegram: {
						enabled: boolean;
						botToken?: string;
						dmPolicy: "pairing" | "allowlist" | "open";
						allowFrom: string[];
						groupPolicy: "disabled" | "allowlist" | "open";
						groupAllowFrom: string[];
						requireMention: boolean;
						textChunkLimit: number;
						rateLimitPerMinute: number;
					};
					slack: {
						enabled: boolean;
						botToken?: string;
						appToken?: string;
						signingSecret?: string;
						dmPolicy: "pairing" | "allowlist" | "open";
						allowFrom: string[];
						groupPolicy: "disabled" | "allowlist" | "open";
						groupAllowFrom: string[];
						requireMention: boolean;
						textChunkLimit: number;
						rateLimitPerMinute: number;
					};
					discord: {
						enabled: boolean;
						botToken?: string;
						applicationId?: string;
						dmPolicy: "pairing" | "allowlist" | "open";
						allowFrom: string[];
						groupPolicy: "disabled" | "allowlist" | "open";
						groupAllowFrom: string[];
						requireMention: boolean;
						textChunkLimit: number;
						rateLimitPerMinute: number;
					};
					generic_webhook: { enabled: boolean; note?: string };
				};
				security: {
					interactionTimeoutSec: number;
					defaultScopes: RemoteGatewayScope[];
				};
				mobileGateway: {
					enabled: boolean;
					port: number;
					host: string;
					requirePairing: boolean;
				};
			};
		};
		output: { success: boolean };
	};
	get_remote_control_runtime_status: {
		input: Record<string, never>;
		output: {
			enabled: boolean;
			started_at?: number;
			channels: Array<{
				channel_id: RemoteChannelId;
				enabled: boolean;
				running: boolean;
				connected: boolean;
				mode?: string;
				last_inbound_at?: number;
				last_outbound_at?: number;
				last_error?: string;
			}>;
			active_runs: number;
			pending_pairings: number;
		};
	};
	list_remote_channels: {
		input: Record<string, never>;
		output: Array<{
			channel_id: RemoteChannelId;
			enabled: boolean;
			running: boolean;
			connected: boolean;
			mode?: string;
			last_inbound_at?: number;
			last_outbound_at?: number;
			last_error?: string;
		}>;
	};
	list_remote_pairings: {
		input: Record<string, never>;
		output: {
			pending_requests: Array<{
				request_id: string;
				channel_id: RemoteChannelId;
				peer_id: string;
				peer_name?: string;
				code: string;
				requested_at: number;
				expires_at: number;
				status: RemotePairingStatus;
				reason?: string;
			}>;
			records: Array<{
				pairing_id: string;
				channel_id: RemoteChannelId;
				peer_id: string;
				peer_name?: string;
				approved_at: number;
				approved_by: string;
				status: RemotePairingRecordStatus;
				revoked_at?: number;
				revoked_reason?: string;
			}>;
		};
	};
	approve_remote_pairing: {
		input: { request_id: string; approved_by?: string };
		output: { success: boolean };
	};
	reject_remote_pairing: {
		input: { request_id: string; reason?: string };
		output: { success: boolean };
	};
	revoke_remote_pairing: {
		input: { channel_id: RemoteChannelId; peer_id: string; reason?: string };
		output: { success: boolean };
	};
	list_remote_sessions: {
		input: { limit?: number };
		output: Array<{
			session_id: string;
			channel_id: RemoteChannelId;
			peer_id: string;
			peer_name?: string;
			target_id: string;
			run_id?: string;
			prompt_preview: string;
			state: RemoteSessionState;
			last_message_at: number;
			created_at: number;
			updated_at: number;
			last_error?: string;
		}>;
	};
	terminate_remote_session: {
		input: { run_id: string };
		output: { success: boolean };
	};
	test_remote_channel: {
		input: { channel_id: RemoteChannelId };
		output: { ok: boolean; message: string };
	};
	list_remote_event_logs: {
		input: { limit?: number };
		output: Array<{
			timestamp: number;
			level: "info" | "warn" | "error";
			source: string;
			message: string;
		}>;
	};
	cloud_node_get_status: {
		input: Record<string, never>;
		output: {
			config: {
				enabled: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeToken?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
			};
			status: {
				enabled: boolean;
				configured: boolean;
				connected: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
				pendingRuns: number;
				lastConnectedAt?: number;
				lastHeartbeatAt?: number;
				lastError?: string;
			};
		};
	};
	cloud_node_set_config: {
		input: {
			config: {
				enabled: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeToken?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
			};
		};
		output: { success: boolean };
	};
	cloud_node_bind: {
		input: {
			relay_url: string;
			email: string;
			password: string;
			node_name?: string;
		};
		output: { success: boolean; node_id: string };
	};
	cloud_node_unbind: {
		input: Record<string, never>;
		output: { success: boolean };
	};
	get_all_configs: {
		input: Record<string, never>;
		output: AppConfig[];
	};
	get_active_model: {
		input: Record<string, never>;
		output: string;
	};
	set_active_model: {
		input: { model: string };
		output: { success: boolean };
	};

	// ==================
	// Agent Runtime（会话/消息等）
	// ==================
	agent_create_session: {
		input: { title?: string; config_json?: unknown };
		output: AgentSession;
	};
	agent_get_session: {
		input: { id: string };
		output: AgentSession | null;
	};
	agent_list_sessions: {
		input: { status?: string; limit?: number };
		output: AgentSession[];
	};
	agent_update_session: {
		input: {
			id: string;
			title?: string;
			status?: string;
			config_json?: unknown;
		};
		output: AgentSession;
	};
	agent_delete_session: {
		input: { id: string };
		output: { success: boolean };
	};
	agent_create_message: {
		input: {
			session_id: string;
			task_id?: string;
			role: string;
			content_json: unknown;
			agent_session_id?: string;
		};
		output: AgentMessage;
	};
	agent_list_messages: {
		input: { session_id: string; task_id?: string; limit?: number };
		output: AgentMessage[];
	};

	// ==================
	// Claude Agent SDK Runner
	// ==================
	agent_sdk_start: {
		input: {
			prompt: string;
			model: string;
			cwd?: string;
			/** Claude Agent SDK session id to resume (enables SDK context management/compaction across turns) */
			resume_session_id?: string;
			/** Whether to persist SDK sessions to disk (defaults to true in SDK) */
			persist_session?: boolean;
			/** MCP server configs passed through to SDK `mcpServers` */
			mcp_servers?: Record<
				string,
				{ command: string; args?: string[]; env?: Record<string, string> }
			>;
			permission_mode?: string;
			allowed_tools?: string[];
			system_prompt?: string;
			skills?: string[]; // 可用技能名称列表
			/** Additional absolute directories exposed to SDK file tools */
			additional_directories?: string[];
			/** Local Claude plugins to load for this run */
			plugins?: Array<{ type: "local"; path: string }>;
			/** Optional sandbox settings passed through to SDK */
			sandbox?: Record<string, unknown>;
			/** Enable interactive approval broker in canUseTool (default: true) */
			interactive_approval?: boolean;
			/** Fork resumed session into a new branch */
			fork_session?: boolean;
			/** Resume only up to a specific assistant message uuid */
			resume_session_at?: string;
			/** Max conversation turns */
			max_turns?: number;
			/** Max thinking tokens */
			max_thinking_tokens?: number;
			/** Max budget in USD */
			max_budget_usd?: number;
			/** SDK settingSources passthrough */
			setting_sources?: Array<"user" | "project" | "local">;
			/** SDK beta features */
			betas?: string[];
			/** Runtime context strategy */
			context_policy?: "balanced" | "strict" | "aggressive";
			/** Subagent context inheritance policy */
			subagent_context_mode?: "capsule" | "inherit";
			/** Context budget controls */
			context_budget?: {
				max_context_chars: number;
				max_files: number;
				max_file_chars: number;
			};
			/** MCP tool search mode */
			enable_tool_search?: "auto" | "auto:5" | "true" | "false";
			/** Enable experimental multi-agent collaboration runtime */
			experimental_multi_agent?: boolean;
			/** Collaboration mode preference */
			multi_agent_mode?: "subagent_only" | "hybrid" | "teammate_preferred";
			/** Maximum number of teammates a leader may delegate concurrently */
			max_teammates?: number;
			/** Preferred teammate spawning mode */
			teammate_mode?: "auto" | "tmux" | "in-process";
			/** Default teammate execution budget */
			teammate_budget?: {
				max_turns?: number;
				max_thinking_tokens?: number;
				max_budget_usd?: number;
			};
			/** Optional leader-only summary model hint */
			leader_summary_model?: string;
			/** Optional teammate execution model hint */
			teammate_execution_model?: string;
		};
		output: string;
	};
	agent_sdk_abort: {
		input: { runId: string };
		output: { success: boolean };
	};
	agent_sdk_resolve_interaction: {
		input: {
			runId: string;
			requestId: string;
			decision: {
				behavior: "allow" | "deny";
				message?: string;
				updatedInput?: Record<string, unknown>;
				updatedPermissions?: unknown[];
				interrupt?: boolean;
			};
		};
		output: { success: boolean };
	};
	agent_sdk_control: {
		input: {
			runId: string;
			action:
				| "set_permission_mode"
				| "set_model"
				| "interrupt"
				| "mcp_status"
				| "mcp_reconnect"
				| "mcp_toggle"
				| "mcp_set_servers";
			mode?: string;
			model?: string;
			serverName?: string;
			enabled?: boolean;
			servers?: Record<string, unknown>;
		};
		output: { success: boolean; data?: unknown; error?: string };
	};

	// ==================
	// Agent 检查点命令（断点续传）
	// ==================
	agent_checkpoint_save: {
		input: SaveCheckpointPayload;
		output: AgentCheckpoint;
	};
	agent_checkpoint_get: {
		input: { task_id: string };
		output: AgentCheckpoint | null;
	};
	agent_checkpoint_delete: {
		input: { task_id: string };
		output: { success: boolean };
	};
	agent_checkpoint_cleanup: {
		input: { days?: number }; // 默认清理 7 天前的检查点
		output: { deleted_count: number };
	};

	// ==================
	// LLM 命令
	// ==================
	invoke_llm: {
		input: InvokeLlmPayload;
		output: InvokeLlmResult;
	};
	invoke_llm_stream: {
		input: InvokeLlmPayload;
		output: { started: boolean };
	};
	invoke_image_generation: {
		input: {
			model: string;
			prompt: string;
			n?: number;
			size?: string;
			quality?: string;
			style?: string;
			// 高级参数
			negativePrompt?: string;
			seed?: number;
			numInferenceSteps?: number;
			guidanceScale?: number;
			promptEnhancement?: boolean;
		};
		output: {
			images: Array<{
				url?: string;
				base64?: string;
				revised_prompt?: string;
			}>;
			model: string;
		};
	};

	// ==================
	// 生图配置管理
	// ==================
	get_image_gen_config: {
		input: {};
		output: {
			providerId: string;
			model: string;
			defaultSize: string;
			promptTemplate: string;
			negativePrompt?: string;
			quality?: string;
			style?: string;
		};
	};
	set_image_gen_config: {
		input: {
			providerId?: string;
			model?: string;
			defaultSize?: string;
			promptTemplate?: string;
			negativePrompt?: string;
			quality?: string;
			style?: string;
		};
		output: { success: boolean };
	};
	generate_image_for_text: {
		input: {
			text: string;
			overrides?: {
				providerId?: string;
				model?: string;
				defaultSize?: string;
				promptTemplate?: string;
				negativePrompt?: string;
			};
		};
		output: {
			images: Array<{
				imageUrl: string;
				revisedPrompt?: string;
			}>;
			model: string;
		};
	};

	// ==================
	// Output Assets 命令
	// ==================
	list_output_assets: {
		input: { project_id?: string };
		output: OutputAsset[];
	};
	create_output_asset: {
		input: CreateOutputPayload;
		output: OutputAsset;
	};
	update_output_asset: {
		input: UpdateOutputPayload;
		output: OutputAsset;
	};
	delete_output_asset: {
		input: { id: string };
		output: { success: boolean };
	};

	// ==================
	// Dashboard 命令
	// ==================
	dashboard_stats: {
		input: Record<string, never>;
		output: DashboardStats;
	};

	// ==================
	// Storage / Vault
	// ==================
	storage_get_settings: {
		input: Record<string, never>;
		output: StorageSettings;
	};
	storage_update_settings: {
		input: {
			settings: Partial<StorageSettings>;
			migrate_existing?: boolean;
		};
		output: {
			settings: StorageSettings;
			migration?: { backup_path: string; sources: number; outputs: number };
		};
	};
	storage_pick_directory: {
		input: Record<string, never>;
		output: { path: string | null };
	};
	storage_reveal_vault_root: {
		input: Record<string, never>;
		output: { success: boolean; error?: string };
	};
	project_reveal_directory: {
		input: { project_id: string };
		output: { success: boolean; path: string; error?: string };
	};
	file_list: {
		input: {
			project_id?: string;
			scope?: "global" | "project";
			themes?: string[];
			tags?: string[];
			include_deleted?: boolean;
			entity_type?: "source" | "output" | "all";
		};
		output: FileRecord[];
	};
	file_move: {
		input: {
			id: string;
			entity_type?: "source" | "output";
			destination:
				| "project_docs"
				| "global_shared"
				| "global_webclips"
				| "theme";
			project_id?: string;
			theme_id?: string;
		};
		output: FileRecord;
	};
	file_delete: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean };
	};
	file_restore: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean };
	};
	file_reveal_in_finder: {
		input: { id: string; entity_type?: "source" | "output" };
		output: { success: boolean; path: string };
	};
	file_set_scope: {
		input: {
			id: string;
			entity_type?: "source" | "output";
			scope: "global" | "project";
			project_id?: string;
		};
		output: FileRecord;
	};
	file_set_tags: {
		input: { id: string; entity_type?: "source" | "output"; tags: string[] };
		output: FileRecord;
	};
	theme_list: {
		input: Record<string, never>;
		output: Theme[];
	};
	theme_create: {
		input: { name: string };
		output: Theme;
	};
	theme_rename: {
		input: { id: string; name: string };
		output: Theme;
	};
	theme_delete: {
		input: { id: string };
		output: { success: boolean };
	};

	// ==================
	// Agent 产物命令
	// ==================
	artifact_save: {
		input: {
			session_id: string;
			file_name: string;
			content: string;
			encoding?: "utf-8" | "base64";
			tool_call_id?: string;
			description?: string;
		};
		output: ArtifactMetadata;
	};
	artifact_list: {
		input: { session_id?: string; limit?: number };
		output: ArtifactMetadata[];
	};
	artifact_get: {
		input: { id: string };
		output: ArtifactMetadata | null;
	};
	artifact_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	artifact_reveal: {
		input: { id: string };
		output: { success: boolean };
	};
	artifact_download: {
		input: { id: string; dest_path?: string };
		output: { path: string };
	};
	artifact_import_to_library: {
		input: { id: string; folder_id?: string };
		output: Source;
	};
	artifact_cleanup: {
		input: { force?: boolean };
		output: ArtifactCleanupResult;
	};
	artifact_get_settings: {
		input: Record<string, never>;
		output: ArtifactSettings;
	};
	artifact_update_settings: {
		input: Partial<ArtifactSettings>;
		output: ArtifactSettings;
	};

	// ==================
	// 同步与备份
	// ==================
	get_sync_config: {
		input: Record<string, never>;
		output: Record<string, unknown>;
	};
	update_sync_config: {
		input: Record<string, unknown>;
		output: Record<string, unknown>;
	};
	list_backup_history: {
		input: { limit?: number };
		output: Array<Record<string, unknown>>;
	};
	create_backup_record: {
		input: Record<string, unknown>;
		output: { success: boolean };
	};
	clean_old_backups: {
		input: { keep_days?: number };
		output: { deleted_count: number };
	};
	backup_to_webdav: {
		input: { data: string; config: Record<string, unknown> };
		output: Record<string, unknown>;
	};
	restore_from_webdav: {
		input: { config: Record<string, unknown> };
		output: string;
	};
	list_webdav_backups: {
		input: { config: Record<string, unknown> };
		output: Array<Record<string, unknown>>;
	};
	delete_webdav_backup: {
		input: { fileName: string; config: Record<string, unknown> };
		output: Record<string, unknown>;
	};
	test_webdav_connection: {
		input: { config: Record<string, unknown> };
		output: boolean;
	};
	get_data_stats: {
		input: Record<string, never>;
		output: Record<string, number>;
	};
	get_data_directory: {
		input: Record<string, never>;
		output: string;
	};
	get_database_path: {
		input: Record<string, never>;
		output: string;
	};
	clear_cache: {
		input: Record<string, never>;
		output: number;
	};
	clear_all_data: {
		input: Record<string, never>;
		output: void;
	};

	// ==================
	// 本地备份命令
	// ==================
	/** 列出指定目录下的备份文件 */
	list_local_backup_files: {
		input: { dir: string };
		output: Array<{
			fileName: string;
			modifiedTime: string;
			size: number;
		}>;
	};
	/** 删除指定备份文件 */
	delete_local_backup_file: {
		input: { dir: string; fileName: string };
		output: { success: boolean };
	};
	/** 备份到指定本地目录 */
	backup_to_local_dir: {
		input: { dir: string; fileName?: string };
		output: { path: string; size: number };
	};
	/** 从本地备份文件恢复 */
	restore_from_local_file: {
		input: { dir: string; fileName: string };
		output: { success: boolean };
	};
	/** 选择本地备份目录 */
	select_backup_directory: {
		input: Record<string, never>;
		output: { path: string | null };
	};

	// ==================
	// 终端（Terminal / PTY）
	// ==================
	/** 创建终端实例 */
	terminal_create: {
		input: {
			id: string;
			cwd?: string;
			shell?: string;
			env?: Record<string, string>;
			cols?: number;
			rows?: number;
		};
		output: {
			id: string;
			name: string;
			cwd: string;
			shell: string;
			pid: number;
			createdAt: number;
		};
	};
	/** 向终端写入数据 */
	terminal_write: {
		input: { id: string; data: string };
		output: { success: boolean };
	};
	/** 调整终端大小 */
	terminal_resize: {
		input: { id: string; cols: number; rows: number };
		output: { success: boolean };
	};
	/** 销毁终端 */
	terminal_destroy: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 列出活跃终端 */
	terminal_list: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			name: string;
			cwd: string;
			shell: string;
			pid: number;
			createdAt: number;
		}>;
	};

	// ==================
	// Coding Workspace（AI 编程工作区）
	// ==================
	/** 选择项目目录（弹出系统文件夹选择器） */
		coding_select_directory: {
			input: Record<string, never>;
			output: { path: string | null };
		};
		/** 选择上下文文件（弹出系统文件选择器） */
		coding_select_files: {
			input: { project_path?: string };
			output: { paths: string[] };
		};
		/** 递归读取文件树 */
		coding_read_file_tree: {
		input: { path: string; maxDepth?: number };
		output: {
			tree: Array<{
				name: string;
				path: string;
				type: "file" | "directory";
				children?: unknown[];
				size?: number;
			}>;
			isGitRepo: boolean;
		};
	};
	/** 获取 Git 状态 */
	coding_git_status: {
		input: { path: string };
		output: {
			isGitRepo: boolean;
			status: {
				branch: string;
				ahead: number;
				behind: number;
				files: Array<{
					path: string;
					absolutePath?: string;
					status:
						| "modified"
						| "added"
						| "deleted"
						| "renamed"
						| "untracked"
						| "copied"
						| "conflicted";
					staged: boolean;
					indexStatus?:
						| "modified"
						| "added"
						| "deleted"
						| "renamed"
						| "untracked"
						| "copied"
						| "conflicted";
					workingTreeStatus?:
						| "modified"
						| "added"
						| "deleted"
						| "renamed"
						| "untracked"
						| "copied"
						| "conflicted";
					originalPath?: string;
					originalAbsolutePath?: string;
				}>;
			} | null;
		};
	};
	/** 获取 Git 分支列表 */
	coding_git_branches: {
		input: { path: string };
		output: {
			isGitRepo: boolean;
			branches: Array<{
				name: string;
				current: boolean;
				remote?: string;
				lastCommit?: string;
			}>;
		};
	};
	/** 获取 Git 最近提交历史 */
	coding_git_history: {
		input: { path: string; limit?: number };
		output: {
			isGitRepo: boolean;
			commits: Array<{
				hash: string;
				shortHash: string;
				subject: string;
				authorName: string;
				timestamp: number;
			}>;
		};
	};
	/** 读取单个文件内容 */
	coding_read_file: {
		input: { path: string; maxSize?: number };
		output: { content: string; truncated: boolean };
	};
	coding_workspace_profile_get: {
		input: { project_path: string };
		output: CodingWorkspaceProfile;
	};
	coding_workspace_profile_update: {
		input: WorkspaceProfileUpdateInput;
		output: CodingWorkspaceProfile;
	};
	coding_workspace_memory_read: {
		input: { project_path: string };
		output: WorkspaceMemoryReadResult;
	};
	coding_workspace_memory_write: {
		input: WorkspaceMemoryWriteInput;
		output: WorkspaceMemoryReadResult;
	};
	coding_backend_capabilities_get: {
		input: { backend?: "claude-code" | "codex" };
		output:
			| BackendCapabilityMatrix
			| Record<"claude-code" | "codex", BackendCapabilityMatrix>;
	};
	/** 将 diff newContent 写入磁盘 */
	coding_write_file: {
		input: { path: string; content: string; createDirs?: boolean };
		output: { success: boolean; error?: string };
	};
	/** 将 diff oldContent 还原到磁盘 */
	coding_revert_file: {
		input: { path: string; content: string };
		output: { success: boolean; error?: string };
	};
	/** 开始监听项目文件变更 */
	coding_watch_start: {
		input: { path: string; ignored?: string[] };
		output: { success: boolean; error?: string };
	};
	/** 停止监听项目文件变更 */
	coding_watch_stop: {
		input: { path: string };
		output: { success: boolean; error?: string };
	};

	// ==================
	// Codex Session（AI 编程工作区 - Codex 后端）
	// ==================
	/** 检查 Codex CLI 是否可用 */
	codex_check_available: {
		input: Record<string, never>;
		output: { available: boolean; path: string | null };
	};
	/** 启动 Codex 会话 */
	codex_session_start: {
		input: {
			prompt: string;
			cwd: string;
			model?: string;
			approvalMode?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
			resumeSessionId?: string;
			workspaceContext?: string;
		};
		output: string; // runId
	};
	/** 中止 Codex 会话 */
	codex_session_abort: {
		input: { runId: string };
		output: { success: boolean };
	};
	codex_get_capabilities: {
		input: Record<string, never>;
		output: BackendCapabilityMatrix;
	};
	codex_runtime_control: {
		input: { runId: string; action: RuntimeControlAction };
		output: { success: boolean; error?: string };
	};

	// ==================
	// CLI Binary Detection（CLI 二进制检测）
	// ==================
	/** 检测指定后端的 CLI 二进制路径和版本 */
	cli_detect_binary: {
		input: { backend: "claude-code" | "codex"; userConfiguredPath?: string };
		output: CliDetectionResult;
	};
	/** 清除 CLI 检测缓存（保存设置后调用） */
	cli_invalidate_cache: {
		input: { backend?: "claude-code" | "codex" };
		output: { success: boolean };
	};

	// ==================
	// CLI History Sync（CLI 历史同步）
	// ==================
	/** 列出 Codex CLI 历史线程 */
	cli_history_codex_list: {
		input: CliHistoryListParams;
		output: {
			available: boolean;
			threads: ExternalThreadMeta[];
		};
	};
	/** 读取 Codex CLI 完整会话 */
	cli_history_codex_read: {
		input: CliHistoryReadParams;
		output: CliHistoryReadResult | null;
	};
	/** 列出 Claude Code CLI 历史会话 */
	cli_history_claude_code_list: {
		input: CliHistoryListParams;
		output: {
			available: boolean;
			threads: ExternalThreadMeta[];
		};
	};
	/** 读取 Claude Code CLI 完整会话 */
	cli_history_claude_code_read: {
		input: CliHistoryReadParams;
		output: CliHistoryReadResult | null;
	};
	/** 检查 CLI 历史可用性 */
	cli_history_check_available: {
		input: Record<string, never>;
		output: { codex: boolean; claudeCode: boolean };
	};
};

export type IPCChannel = keyof IPCSchema;
