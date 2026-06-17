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
import type { RemoteGatewayScope } from "./remote-control-schema";

type RemoteChannelId =
	| "feishu"
	| "telegram"
	| "slack"
	| "discord"
	| "qqbot"
	| "wechat"
	| "generic_webhook";

/**
 * codex hatch-pet 兼容的 atlas 网格信息
 *
 * 来自 pet_request.json 的 atlas + rows，渲染层据此切帧。
 */
export interface CustomMascotAtlasInfo {
	columns: number;
	rows: number;
	cellWidth: number;
	cellHeight: number;
	width: number;
	height: number;
	rowMap?: Array<{ state: string; row: number; frames: number }>;
}

/**
 * 自定义桌宠 meta（与 src/lib/mascot/manifest.ts MascotMeta 保持兼容）
 *
 * 主进程持有权威源（custom-mascots/index.json），通过 IPC 传给渲染层。
 * 字段 isBuiltin 在 IPC payload 里固定为 false，仅为渲染层 union 兼容。
 */
export interface CustomMascotMeta {
	id: string;
	label: string;
	tagline: string;
	personality: string;
	accentColor: string;
	isBuiltin: false;
	version: number;
	createdAt?: string;
	/** 是否带 atlas.webp（自家 atlas，决定桌面悬浮窗能否播 spritesheet） */
	hasAtlas: boolean;
	/** 是否带 loading.mp4 */
	hasLoading: boolean;
	/** 是否带 codex 风格 spritesheet（webp 或 png） */
	hasSpritesheet?: boolean;
	/** spritesheet 的扩展名 */
	spritesheetExt?: "webp" | "png";
	/** 实际包含的 PNG slot 列表（运行时缺位会 fallback 到 hero） */
	slots: string[];
	/** atlas 网格信息（codex 包通常有；自家包可选） */
	atlas?: CustomMascotAtlasInfo;
}

/**
 * 渠道能力开关（SDK 阶段 1 起启用）。
 * - streaming.mode: off/edit/card（card 仅飞书）
 * - typing/interactive/dedupe.persistent/sequential_delivery：开关
 */
type RemoteChannelFeatureConfig = {
	streaming: { mode: "off" | "edit" | "card" };
	typing: { enabled: boolean };
	interactive: { enabled: boolean };
	dedupe: { persistent: boolean };
	sequential_delivery: boolean;
};

/** QQ Bot 渠道配置（阶段 5 启用） */
type RemoteQqbotIpc = {
	enabled: boolean;
	appId?: string;
	clientSecret?: string;
	environment: "prod" | "sandbox";
	enableGuild: boolean;
	enableGroup: boolean;
	enableC2c: boolean;
	dmPolicy: "pairing" | "allowlist" | "open";
	allowFrom: string[];
	groupPolicy: "disabled" | "allowlist" | "open";
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
	features?: RemoteChannelFeatureConfig;
};

/** 个人微信渠道（阶段 6 启用，实验特性） */
type RemoteWechatIpc = {
	enabled: boolean;
	puppet: "xp" | "padlocal" | "service";
	token?: string;
	endpoint?: string;
	enableDm: boolean;
	enableGroup: boolean;
	allowFrom: string[];
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
	features?: RemoteChannelFeatureConfig;
	acknowledgedRisk: boolean;
};

/** 远程终端预设（IM 远控 pty 桥） */
type RemoteTerminalPresetIpc = {
	id: string;
	name: string;
	command: string;
	cwd?: string;
};

/** 远程终端配置（IM 远控 pty 桥） */
type RemoteTerminalColorModeIpc = "auto" | "ansi" | "plain";

type RemoteTerminalIpc = {
	enabled: boolean;
	presets: RemoteTerminalPresetIpc[];
	defaultCwds: string[];
	cols: number;
	rows: number;
	snapshotIntervalMs: number;
	idleTimeoutMs: number;
	freeCommandMode: boolean;
	autoShowOnDesktop: boolean;

	// ─── 体验升级（2026-05-13） ───────────────────────────
	colorMode: RemoteTerminalColorModeIpc;
	perChannelCols: Partial<Record<RemoteChannelId, number>>;
	scrollbackLines: number;
	showStatusBar: boolean;
	highlightDiff: boolean;
	contextAwareButtons: boolean;
	dangerousCommandConfirm: boolean;
	dangerousPatterns: string[];
	longOutputFoldThreshold: number;
	offlineBufferLines: number;
	commandHistorySize: number;
	fileTransferEnabled: boolean;
	maxUploadBytes: number;
	maxDownloadBytes: number;
};

/** 远程终端会话快照（运行时） */
type RemoteTerminalSessionIpc = {
	session_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	target_id: string;
	command: string;
	cwd: string;
	preset_id?: string;
	pid?: number;
	started_at: number;
	last_activity_at: number;
};

type RemotePairingStatus = "pending" | "approved" | "rejected" | "revoked";
type RemotePairingRecordStatus = "approved" | "revoked";
type RemoteSessionState =
	| "running"
	| "waiting_interaction"
	| "completed"
	| "aborted"
	| "error";
type CloudNodeRoutingMode = "cloud_only" | "prefer_desktop" | "auto";

// ==================
// Reader（阅读器）共享类型
// ==================
export type ReaderFormat =
	| "pdf"
	| "epub"
	| "mobi"
	| "azw3"
	| "txt"
	| "html"
	| "md"
	| "docx"
	| "cbz";

export type ReaderHighlightColor =
	| "yellow"
	| "peach"
	| "sky"
	| "sage"
	| "lilac"
	| "rose";

export type ReaderTocItem = {
	id: string;
	label: string;
	href: string;
	level: number;
	children?: ReaderTocItem[];
};

export type ReaderBook = {
	id: string;
	source_id: string | null;
	title: string;
	authors: string[];
	language: string | null;
	format: ReaderFormat;
	storage_path: string;
	cover_path: string | null;
	page_count: number | null;
	word_count: number | null;
	toc: ReaderTocItem[];
	metadata: Record<string, unknown>;
	added_at: number;
	last_opened_at: number | null;
};

export type ReaderProgress = {
	book_id: string;
	locator: string;
	percent: number;
	chapter_id: string | null;
	updated_at: number;
};

export type ReaderHighlight = {
	id: string;
	book_id: string;
	locator_start: string;
	locator_end: string;
	text: string;
	color: ReaderHighlightColor;
	note: string | null;
	created_at: number;
	updated_at: number;
};

export type ReaderBookmark = {
	id: string;
	book_id: string;
	locator: string;
	label: string | null;
	created_at: number;
};

export type ReaderCardStatus = "draft" | "active" | "archived";

export type ReaderKnowledgeCard = {
	id: string;
	book_id: string;
	chapter_id: string | null;
	question: string;
	answer: string;
	source_text: string | null;
	locator: string | null;
	tags: string[];
	status: ReaderCardStatus;
	generation_session_id: string | null;
	next_review_at: number | null;
	interval_days: number;
	ease: number;
	review_count: number;
	last_reviewed_at: number | null;
	created_at: number;
	updated_at: number;
};

export type ReaderSession = {
	id: string;
	book_id: string;
	started_at: number;
	ended_at: number | null;
	duration_ms: number;
	pages_read: number;
};

export type ReaderChapter = {
	id: string;
	title: string;
	html?: string;
	text?: string;
	images?: Array<{ name: string; data_url: string; mime: string }>;
	prev_id: string | null;
	next_id: string | null;
	word_count?: number;
};

export type ReaderSearchHit = {
	book_id: string;
	chapter_id: string | null;
	locator: string;
	snippet: string;
	score: number;
};

export type AppCloseBehavior = "ask" | "hide_to_tray" | "quit";

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
	/**
	 * 查询主窗口当前是否处于前台（focused + visible）。
	 * 主要给桌宠窗口用：主窗口前台时桌宠抑制 TTS 播报，避免与主窗口的对话朗读重复。
	 * 实时变化会通过 `main-window-focus-changed` 事件主动推送，此命令用于初次同步。
	 */
	main_window_is_focused: {
		input: Record<string, never>;
		output: { focused: boolean };
	};
	/**
	 * Windows 主窗口关闭按钮行为。
	 * - ask：每次点 X 弹出原生选择框
	 * - hide_to_tray：隐藏主窗口，后台服务与桌宠继续运行
	 * - quit：彻底退出应用，before-quit 会同步销毁桌宠
	 */
	app_get_close_behavior: {
		input: Record<string, never>;
		output: { windows: AppCloseBehavior; platform: NodeJS.Platform };
	};
	app_set_close_behavior: {
		input: { windows: AppCloseBehavior };
		output: { success: boolean; windows: AppCloseBehavior };
	};
	system_get_user_info: {
		input: Record<string, never>;
		output: {
			username: string;
			platform: NodeJS.Platform;
		};
	};
	/**
	 * 渲染端应用主题后把当前窗口背景色持久化到 userData/window-background.json，
	 * 主进程下次启动创建 BrowserWindow 时读取，消除启动白屏闪烁。
	 * color 必须是 #RRGGBB 格式。
	 */
	app_set_window_background: {
		input: { color: string };
		output: { success: boolean };
	};
	/**
	 * 渲染端切换亮暗模式时同步 nativeTheme.themeSource，
	 * 让原生菜单 / 对话框 / 滚动条等系统 UI 跟随应用主题。
	 */
	app_set_native_theme: {
		input: { mode: "light" | "dark" | "system" };
		output: { success: boolean };
	};
	/**
	 * 启动 / 停止目录文件监听（chokidar）。
	 * 变更事件通过 `coding-file-changed` 推送：{ projectPath, changes: FileChangeEvent[] }。
	 * 用于沙盒工作区文件树的事件驱动刷新，替代渲染端高频全量重扫。
	 */
	file_watch_start: {
		input: { path: string };
		output: { success: boolean; error?: string };
	};
	file_watch_stop: {
		input: { path: string };
		output: { success: boolean; error?: string };
	};
	// ==================
	// 日志导出
	// ==================
	logs_get_info: {
		input: Record<string, never>;
		output: {
			root: string;
			exists: boolean;
			total_bytes: number;
			subdir_count: number;
			latest_subdirs: string[];
		};
	};
	logs_reveal: {
		input: Record<string, never>;
		output: { success: boolean; path: string; error?: string };
	};
	logs_export: {
		input: { days?: number };
		output: {
			canceled: boolean;
			path: string;
			bytes: number;
			error?: string;
		};
	};
	/**
	 * 渲染端把全局未捕获错误 / unhandled promise rejection / 警告
	 * 推送给主进程的 winston，弥补生产构建剥离 console 后的盲区。
	 * 渲染端在 src/main.tsx 注册 window error/unhandledrejection 监听并调用此命令。
	 */
	log_renderer_event: {
		input: {
			level: "warn" | "error";
			message: string;
			source?: string;
			stack?: string;
			location?: { url?: string; line?: number; column?: number };
		};
		output: { success: boolean };
	};
	/**
	 * 主进程性能 telemetry：渲染端 Settings → About 面板获取最近 N 条 perf_metrics 样本。
	 */
	perf_get_recent_metrics: {
		input: { limit?: number };
		output: {
			samples: Array<{
				ts: number;
				rss: number;
				heap_used: number;
				heap_total: number;
				external: number;
				active_handles: number;
				active_requests: number;
				event_loop_lag_ms?: number;
			}>;
		};
	};
	/**
	 * userData 缓存清理：扫描 + 报告 + 执行。
	 * 默认 dry-run 仅返回可清理项；execute=true 时真正删除。
	 */
	userdata_janitor_scan: {
		input: Record<string, never>;
		output: {
			scopes: Array<{
				key: string;
				label: string;
				root: string;
				files: number;
				bytes: number;
			}>;
			total_bytes: number;
		};
	};
	userdata_janitor_execute: {
		input: { scopes?: string[] };
		output: {
			removed: number;
			bytes: number;
			errors: Array<{ path: string; error: string }>;
		};
	};
	/**
	 * Agent 数据保留策略：扫描过期的 agent 会话数。
	 * 默认保留最近 90 天，可通过 app_config('agent.retention_days') 调整。
	 */
	agent_retention_scan: {
		input: Record<string, never>;
		output: {
			expired_sessions: number;
			total_sessions: number;
			retention_days: number;
			cutoff_date: string;
		};
	};
	/** Agent 数据保留策略：手动触发清理过期会话（级联删除关联 tasks/messages）。 */
	agent_retention_clean: {
		input: Record<string, never>;
		output: {
			deleted_sessions: number;
			retention_days: number;
		};
	};
	// ==================
	// 应用更新
	// ==================
	update_check: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			releaseNotes?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_download: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_install: {
		input: Record<string, never>;
		output: { success: boolean };
	};
	update_get_state: {
		input: Record<string, never>;
		output: {
			status: string;
			version?: string;
			releaseName?: string;
			releaseNotes?: string;
			progress?: {
				percent: number;
				transferred: number;
				total: number;
				bytesPerSecond: number;
			};
			error?: string;
		};
	};
	update_reveal_pending: {
		input: Record<string, never>;
		output: { success: boolean; path?: string; error?: string };
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
		output: {
			content: string;
			encoding: string;
			size: number;
			mtime_ms: number;
			path: string;
		};
	};
	write_file_safe: {
		input: {
			path: string;
			content: string;
			encoding?: "utf-8" | "base64";
			create_dirs?: boolean;
			allow_empty?: boolean;
			expected_mtime_ms?: number;
			expected_size?: number;
		};
		output: {
			success: boolean;
			bytes_written: number;
			size: number;
			mtime_ms: number;
			path: string;
		};
	};
	list_files_safe: {
		input: { path: string; recursive?: boolean };
		output: Array<{
			path: string;
			name: string;
			is_file: boolean;
			is_dir: boolean;
			size?: number;
			mtime_ms?: number;
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
	// Claude Code 斜杠命令（扫描 / git diff / 写 CLAUDE.md）
	// ==================
	slash_commands_scan: {
		input: {
			workspace_dir: string;
			include_user_home: boolean;
			max_files?: number;
		};
		output: Array<{
			id: string;
			name?: string;
			description?: string;
			prompt: string;
			source: "project" | "user";
			sourcePath: string;
		}>;
	};
	slash_commands_git_diff: {
		input: { workspace_dir: string; max_bytes?: number };
		output: { has_changes: boolean; diff: string; stat: string };
	};
	slash_commands_write_init: {
		input: { workspace_dir: string; overwrite: boolean };
		output: {
			path: string;
			created: boolean;
			overwritten: boolean;
			/**
			 * 当 `overwrite=false` 且目标已存在时，主进程返回结构化错误标识，
			 * 由前端拦截后弹确认对话框，用户同意后带 `overwrite=true` 重调。
			 * 其它运行时异常仍按抛错处理。
			 */
			error?: "exists";
		};
	};
	/**
	 * 唤起原生目录选择对话框；供 `/add-dir` 等命令使用。
	 * 取消时返回 `canceled: true` 而非抛错。
	 */
	slash_commands_pick_directory: {
		input: {
			/** 对话框标题；默认 "选择目录"。 */
			title?: string;
			/** 起始目录；建议传当前工作区。 */
			default_path?: string;
		};
		output: {
			canceled: boolean;
			/** 用户选中的绝对路径；canceled=true 时为空字符串。 */
			path: string;
		};
	};
	/**
	 * 唤起原生保存文件对话框；供 `/export` 等命令使用。
	 * 取消时返回 `canceled: true` 而非抛错。
	 */
	slash_commands_save_dialog: {
		input: {
			title?: string;
			default_path?: string;
			/** 文件扩展名过滤；默认 markdown。 */
			filters?: Array<{ name: string; extensions: string[] }>;
		};
		output: {
			canceled: boolean;
			path: string;
		};
	};
	/**
	 * 把字符串内容写入指定绝对路径；用于 `/export` 输出 Markdown 文件。
	 * 路径必须是绝对路径；目标目录不存在时会自动 mkdir -p。
	 */
	slash_commands_export_session_md: {
		input: {
			path: string;
			content: string;
		};
		output: {
			path: string;
			bytes: number;
		};
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
			/** 来自 SKILL.md `od.mode` 或描述启发，决定该技能是否归属"设计/媒体"类 */
			modeClass: "design" | "general";
			/** 原始 od.mode（若存在），用于 UI 展示 chip */
			modeTag?: string;
			/** 用户是否手动设置过启用状态；未手动调过的项跟随设计模式开关 */
			userOverride: boolean;
			/** 来自 Claude 插件市场等只读源，本面板不允许删除 */
			readonly?: boolean;
		}>;
	};
	import_skill: {
		input: { sourcePath: string };
		output: {
			name: string;
			description: string;
			location: string;
			enabled: boolean;
			modeClass: "design" | "general";
			modeTag?: string;
			userOverride: boolean;
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
	// Skills Marketplace（多源市场）
	// ==================
	skills_marketplace_list_sources: {
		input: Record<string, never>;
		output: {
			sources: Array<{
				id: string;
				name: string;
				type:
					| "anthropic_marketplace_json"
					| "skills_sh"
					| "tencent_skillhub"
					| "custom_json";
				url: string;
				enabled: boolean;
				trust?: "official" | "community" | "custom";
			}>;
			mirrors: Array<{
				id: string;
				name: string;
				pattern: string;
				enabled: boolean;
			}>;
			autoCheck: boolean;
		};
	};
	skills_marketplace_set_sources: {
		input: {
			sources?: Array<{
				id: string;
				name: string;
				type:
					| "anthropic_marketplace_json"
					| "skills_sh"
					| "tencent_skillhub"
					| "custom_json";
				url: string;
				enabled: boolean;
				trust?: "official" | "community" | "custom";
			}>;
			mirrors?: Array<{
				id: string;
				name: string;
				pattern: string;
				enabled: boolean;
			}>;
			autoCheck?: boolean;
		};
		output: { success: boolean };
	};
	skills_marketplace_search: {
		input: { query?: string; sourceId?: string };
		output: {
			entries: Array<{
				id: string;
				sourceId: string;
				trust: "official" | "community" | "custom";
				name: string;
				displayName?: string;
				description: string;
				version?: string;
				author?: string;
				homepage?: string;
				tags?: string[];
				icon?: string;
				license?: string;
				sha256?: string;
				artifact: unknown;
				rawSourceUrl?: string;
				installed?: boolean;
				installedVersion?: string;
			}>;
			errors: Array<{ sourceId: string; error: string }>;
		};
	};
	skills_marketplace_install: {
		input: { entryId: string };
		output: {
			success: boolean;
			name?: string;
			location?: string;
			error?: string;
		};
	};
	skills_marketplace_uninstall: {
		input: { skillName: string };
		output: { success: boolean };
	};
	skills_marketplace_check_updates: {
		input: Record<string, never>;
		output: {
			updates: Array<{
				name: string;
				currentVersion?: string;
				latestVersion?: string;
				entryId: string;
				sourceId: string;
			}>;
		};
	};
	skills_marketplace_test_mirror: {
		input: Record<string, never>;
		output: {
			results: Array<{
				url: string;
				ok: boolean;
				latencyMs?: number;
				error?: string;
			}>;
		};
	};
	skills_marketplace_preview: {
		input: { entryId: string };
		output: {
			skillMd?: string;
			usedUrl?: string;
			error?: string;
		};
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
					features?: RemoteChannelFeatureConfig;
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
					features?: RemoteChannelFeatureConfig;
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
					features?: RemoteChannelFeatureConfig;
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
					features?: RemoteChannelFeatureConfig;
				};
				qqbot: RemoteQqbotIpc;
				wechat: RemoteWechatIpc;
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
			terminal: RemoteTerminalIpc;
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
						features?: RemoteChannelFeatureConfig;
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
						features?: RemoteChannelFeatureConfig;
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
						features?: RemoteChannelFeatureConfig;
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
						features?: RemoteChannelFeatureConfig;
					};
					qqbot: RemoteQqbotIpc;
					wechat: RemoteWechatIpc;
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
				terminal: RemoteTerminalIpc;
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
	list_remote_channel_capabilities: {
		input: Record<string, never>;
		output: Array<{
			channel: RemoteChannelId;
			label: string;
			status: "legacy" | "sdk" | "placeholder";
			capabilities: {
				text: boolean;
				card: boolean;
				streaming: boolean;
				typing: boolean;
				interactive: boolean;
				editMessage: boolean;
				deleteMessage: boolean;
				reactions: boolean;
				pin: boolean;
				media: boolean;
			};
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
	remote_terminal_list_sessions: {
		input: Record<string, never>;
		output: { sessions: RemoteTerminalSessionIpc[] };
	};
	remote_terminal_terminate_session: {
		input: { session_id: string };
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
	feishu_begin_app_registration: {
		input: { domain?: "feishu" | "lark" };
		output: {
			sessionId: string;
			deviceCode: string;
			qrUrl: string;
			qrDataUrl: string;
			userCode: string;
			intervalSec: number;
			expireInSec: number;
		};
	};
	feishu_poll_app_registration: {
		input: {
			deviceCode: string;
			currentDomain: "feishu" | "lark";
			intervalSec: number;
		};
		output:
			| {
					status: "pending";
					domain: "feishu" | "lark";
					intervalSec: number;
			  }
			| {
					status: "success";
					appId: string;
					appSecret: string;
					domain: "feishu" | "lark";
					openId?: string;
			  }
			| { status: "access_denied" }
			| { status: "expired" }
			| { status: "error"; message: string };
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
		input: {
			title?: string;
			project_id?: string | null;
			config_json?: unknown;
		};
		output: AgentSession;
	};
	agent_get_session: {
		input: { id: string };
		output: AgentSession | null;
	};
	agent_list_sessions: {
		input: { status?: string; limit?: number; project_id?: string | null };
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
			/**
			 * 思考档位（直接透传给 SDK 的 effort / thinking 字段）。
			 * - "off" → thinking: { type: "disabled" }
			 * - "low" / "medium" / "high" / "xhigh" → effort
			 * - 未提供 → 不传，SDK 自行决定（Opus 4.6+ 默认 adaptive + high）
			 */
			thinking_level?: "off" | "low" | "medium" | "high" | "xhigh";
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
			/** Project root directory (actual user folder, separate from sandbox cwd). Used to locate .llm-wiki/ */
			wiki_scope_path?: string;
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
				| "mcp_set_servers"
				| "stop_task";
			mode?: string;
			model?: string;
			serverName?: string;
			enabled?: boolean;
			servers?: Record<string, unknown>;
			/** SDK 侧 task_id（来自 task_started/task_progress 事件），用于 stop_task。 */
			taskId?: string;
		};
		output: { success: boolean; data?: unknown; error?: string };
	};

	agent_sdk_send_followup: {
		input: {
			runId: string;
			message: string;
			attachments?: Array<{ path: string; title?: string }>;
		};
		output: { success: boolean; error?: string };
	};

	agent_sdk_check_alive: {
		input: { runId: string };
		output: { alive: boolean };
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
	// Agent 记忆管理（Markdown 文件式：SOUL/USER/MEMORY + SDK 自动加载的 CLAUDE.md/AGENTS.md）
	// ==================
	agent_get_memory_stats: {
		input: Record<string, never>;
		output: {
			soul: { chars: number; limit: number };
			user: { chars: number; limit: number; entries: number };
			memory: { chars: number; limit: number; entries: number };
		};
	};
	agent_get_memory_context: {
		input: Record<string, never>;
		output: { context: string; memory_count: number };
	};
	agent_clear_all_memories: {
		input: Record<string, never>;
		// deleted = 被清空的总字符数（仅 USER + MEMORY；SOUL 不动）
		output: { deleted: number };
	};
	agent_memory_read_file: {
		input: {
			file:
				| "soul"
				| "user"
				| "memory"
				| "global_claude_md"
				| "project_claude_md"
				| "project_agents_md";
			cwd?: string | null;
		};
		output: {
			token: string;
			displayName: string;
			path: string;
			content: string;
			charCount: number;
			limit?: number;
			lastModified: number;
			exists: boolean;
			managedBy: "ipo" | "sdk";
			requiresConfirm: boolean;
			cwdRelative: boolean;
		};
	};
	agent_memory_write_file: {
		input: {
			file:
				| "soul"
				| "user"
				| "memory"
				| "global_claude_md"
				| "project_claude_md"
				| "project_agents_md";
			content: string;
			cwd?: string | null;
			// global_claude_md 写入必须 confirmed=true
			confirmed?: boolean;
		};
		output: { ok: boolean; error?: string; path?: string };
	};
	agent_memory_list_context_files: {
		input: { cwd?: string | null };
		output: Array<{
			token: string;
			displayName: string;
			path: string;
			content: string;
			charCount: number;
			limit?: number;
			lastModified: number;
			exists: boolean;
			managedBy: "ipo" | "sdk";
			requiresConfirm: boolean;
			cwdRelative: boolean;
			injectedInActiveSnapshot: boolean;
		}>;
	};
	agent_memory_get_snapshot: {
		input: { runId: string };
		output: {
			runId: string;
			frozenAt: number;
			soul: string;
			user: string;
			memory: string;
		} | null;
	};
	agent_memory_open_folder: {
		input: { path: string };
		output: { ok: boolean };
	};
	agent_memory_set_active_cwd: {
		input: { cwd: string | null };
		output: { ok: boolean };
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
	/**
	 * 取消进行中的 LLM 流式调用，立即 abort 上游 SSE 连接。
	 * - streamId 提供：取消该 id 对应的流；不存在时返回 cancelled=false。
	 * - cancelAll=true：取消所有进行中的流。
	 */
	invoke_llm_stream_cancel: {
		input: { streamId?: string; cancelAll?: boolean };
		output: { cancelled: boolean; count: number };
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
		input: undefined;
		output: { path: string | null };
	};
	system_pick_directory: {
		input: { title?: string };
		output: { path: string | null };
	};
	storage_reveal_vault_root: {
		input: Record<string, never>;
		output: { success: boolean; error?: string };
	};
	// ==================
	// 缓存根目录（可清理缓存的统一存储位置，独立于 Vault）
	// ==================
	cache_root_get: {
		input: Record<string, never>;
		output: { current: string; isDefault: boolean; defaultRoot: string };
	};
	cache_root_pick: {
		input: undefined;
		output: { path: string | null };
	};
	cache_root_update: {
		input: { newRoot: string; migrate: boolean };
		output: {
			current: string;
			isDefault: boolean;
			migration?: {
				copied: number;
				bytes: number;
				skipped: number;
				errors: Array<{ path: string; error: string }>;
			};
		};
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
	// Git Worktree 沙盒隔离
	// ==================
	/** 创建 worktree */
	worktree_create: {
		input: { repoPath: string; branchName?: string };
		output: {
			worktreePath: string;
			branchName: string;
			isGitWorktree: boolean;
			createdAt: number;
		};
	};
	/** 列出所有 worktree */
	worktree_list: {
		input: { repoPath: string };
		output: Array<{
			worktreePath: string;
			branchName: string;
			head: string;
			isMain: boolean;
		}>;
	};
	/** 合并 worktree 变更回主分支 */
	worktree_merge: {
		input: { repoPath: string; worktreePath: string };
		output: {
			success: boolean;
			method: "merge" | "cherry-pick" | "patch";
			message: string;
			conflicts?: string[];
		};
	};
	/** 删除 worktree */
	worktree_remove: {
		input: { repoPath: string; worktreePath: string };
		output: { success: boolean; message: string };
	};
	/** 获取 worktree 相对于主分支的 diff */
	worktree_diff: {
		input: { repoPath: string; worktreePath: string };
		output: {
			diff: string;
			changedFiles: string[];
			stat: string;
		};
	};

	// ==================
	// Wiki 知识页面
	// ==================
	/** 列出线程工作目录对应的 Wiki 页面 */
	wiki_list_pages: {
		input: { scope_path: string; limit?: number; offset?: number };
		output: Array<{
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			reference_count: number;
			last_updated_by: string;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		}>;
	};
	/** 获取单个 Wiki 页面 */
	wiki_get_page: {
		input: { scope_path: string; page_id: string };
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			reference_count: number;
			last_updated_by: string;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		} | null;
	};
	/** 创建 Wiki 页面 */
	wiki_create_page: {
		input: {
			scope_path: string;
			title: string;
			content: string;
			summary?: string;
			tags?: string[];
			related_page_ids?: string[];
			page_type?: string;
			confidence?: number;
			sources?: string[];
			status?: "active" | "stub" | "needs-update" | "deprecated";
			aliases?: string[];
		};
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		};
	};
	/** 更新 Wiki 页面 */
	wiki_update_page: {
		input: {
			scope_path: string;
			page_id: string;
			title?: string;
			content?: string;
			summary?: string;
			tags?: string[];
			related_page_ids?: string[];
			page_type?: string;
			confidence?: number;
			sources?: string[];
			status?: "active" | "stub" | "needs-update" | "deprecated";
			aliases?: string[];
		};
		output: {
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			related_page_ids: string[];
			page_type: string;
			confidence: number;
			created_at: number;
			updated_at: number;
			sources: string[];
			status: "active" | "stub" | "needs-update" | "deprecated";
			aliases: string[];
		} | null;
	};
	/** 删除 Wiki 页面 */
	wiki_delete_page: {
		input: { scope_path: string; page_id: string };
		output: { success: boolean };
	};
	/** 搜索 Wiki 页面 */
	wiki_search_pages: {
		input: { scope_path: string; query: string; limit?: number };
		output: Array<{
			id: string;
			scope_path: string;
			title: string;
			slug: string;
			content: string;
			summary: string;
			tags: string[];
			confidence: number;
			updated_at: number;
		}>;
	};
	/** 统计 Wiki 页面数量 */
	wiki_count_pages: {
		input: { scope_path: string };
		output: { count: number };
	};
	/** 检查当前线程工作目录的 Wiki 是否启用 */
	wiki_is_enabled: {
		input: { scope_path: string };
		output: { enabled: boolean };
	};
	/** 启用/初始化当前线程工作目录的 Wiki */
	wiki_enable: {
		input: { scope_path: string };
		output: { success: boolean };
	};
	/** 禁用当前线程工作目录的 Wiki */
	wiki_disable: {
		input: { scope_path: string };
		output: { success: boolean };
	};
	/** 重建当前线程工作目录的 Wiki 目录与默认地图 */
	wiki_rebuild: {
		input: { scope_path: string };
		output: { success: boolean; created_map: boolean };
	};
	/** 获取 Wiki 页面对应的物理文件绝对路径（供文档编辑器打开真实 .md 文件） */
	wiki_get_page_file_path: {
		input: { scope_path: string; page_id: string };
		output: { path: string | null };
	};
	/** AI 生成 Wiki 页面（从知识库源文件提取知识） */
	wiki_generate: {
		input: { scope_path: string; model?: string };
		output: { success: boolean; generated_pages: number };
	};
	/** 查询 Wiki 生成状态 */
	wiki_generation_status: {
		input: Record<string, never>;
		output: {
			is_generating: boolean;
			scope_path: string | null;
			/** 生成管线阶段：preflight/scanning/filtering/extracting/llm/linking/finalizing/idle */
			phase:
				| "idle"
				| "preflight"
				| "scanning"
				| "filtering"
				| "extracting"
				| "llm"
				| "linking"
				| "finalizing";
			total_sources: number;
			processed_sources: number;
			generated_pages: number;
			current_source_title: string | null;
			error: string | null;
			warnings?: string[];
			/** 本轮中被跳过的文件数（内容无法提取 / 提取失败 / LLM 返回空） */
			skipped_count?: number;
			/** schema 累计跳过的文件数（跨轮次，用于 UI 决定是否展示「重试跳过的文件」按钮） */
			total_skipped_in_schema?: number;
		};
	};
	/** 查询 Wiki schema 的统计信息（处理/跳过/实际页面数） */
	wiki_schema_stats: {
		input: { scope_path: string };
		output: {
			processed_count: number;
			skipped_count: number;
			real_page_count: number;
			has_knowledge_map: boolean;
			skipped_files: Array<{
				path: string;
				name: string;
				reason: string;
				reason_detail?: string;
				skipped_at: number;
			}>;
		};
	};
	/** 清空 skipped_sources：让下次生成时重新尝试这些文件 */
	wiki_reset_skipped_sources: {
		input: { scope_path: string };
		output: { cleared: number };
	};
	/** 清空 processed_sources：让下次生成时重新处理所有文件（不影响已生成的页面） */
	wiki_reset_processed_sources: {
		input: { scope_path: string };
		output: { cleared: number };
	};
	/** Wiki 健康检查（Karpathy lint pattern）：孤儿 / stub / 断链 / frontmatter 缺失 / 未摄入源 */
	wiki_lint: {
		input: { scope_path: string };
		output: {
			scope_path: string;
			total_pages: number;
			issues: Array<{
				kind:
					| "orphan"
					| "stub"
					| "broken-link"
					| "frontmatter-missing"
					| "source-no-sources";
				page_slug: string;
				page_title: string;
				detail: string;
			}>;
			counts: {
				orphan: number;
				stub: number;
				"broken-link": number;
				"frontmatter-missing": number;
				"source-no-sources": number;
			};
			un_ingested_sources: Array<{
				path: string;
				name: string;
				size: number;
			}>;
			suggestions: string[];
			ran_at: number;
		};
	};

	// ==================
	// 桌面宠物窗口
	// ==================
	pet_window_get_state: {
		input: Record<string, never>;
		output: {
			enabled: boolean;
			x: number;
			y: number;
			throughClicks: boolean;
			mascotId: string;
			sizePreset: "sm" | "md" | "lg" | "xl";
			dwellPreset: "short" | "normal" | "long";
			dndStart: string | null;
			dndEnd: string | null;
			globalShortcutEnabled: boolean;
		};
	};
	pet_window_set_enabled: {
		input: { enabled: boolean };
		output: { success: boolean };
	};
	pet_window_set_position: {
		input: { x: number; y: number };
		output: { success: boolean };
	};
	pet_window_set_through_clicks: {
		input: { enabled: boolean };
		output: { success: boolean };
	};
	pet_window_focus_main: {
		input: Record<string, never>;
		output: { success: boolean };
	};
	pet_window_send_chat: {
		input: { text: string };
		output: { success: boolean };
	};
	pet_window_drag_move: {
		input: { mouseX: number; mouseY: number };
		output: { success: boolean };
	};
	pet_window_drag_start: {
		input: { mouseX: number; mouseY: number };
		output: { success: boolean };
	};
	pet_window_drag_end: {
		input: { vx?: number; vy?: number } | Record<string, never>;
		output: { success: boolean; moved: boolean; x: number; y: number };
	};
	/** 拖动结束后吸附到最近的屏幕边缘（仅水平贴墙） */
	pet_window_snap_to_edge: {
		input: { threshold?: number };
		output: { success: boolean; snapped: boolean; x: number; y: number };
	};
	/** 取宠物窗口当前位置 + 所在显示器工作区几何（用于气泡 placement 计算） */
	pet_window_get_position: {
		input: Record<string, never>;
		output: {
			x: number;
			y: number;
			width: number;
			height: number;
			displayX: number;
			displayY: number;
			displayWidth: number;
			displayHeight: number;
		};
	};
	/** 设置宠物角色尺寸档（持久化 + 通过广播让宠物窗口立即重渲染） */
	pet_window_set_size_preset: {
		input: { preset: "sm" | "md" | "lg" | "xl" };
		output: { success: boolean };
	};
	/** 设置通知停留时长档 */
	pet_window_set_dwell_preset: {
		input: { preset: "short" | "normal" | "long" };
		output: { success: boolean };
	};
	/** 设置勿扰时段（null 关闭勿扰） */
	pet_window_set_dnd: {
		input: { start: string | null; end: string | null };
		output: { success: boolean };
	};
	/** 启用 / 关闭"桌宠全局热键"（默认 Control+Alt+Space） */
	pet_window_set_global_shortcut_enabled: {
		input: { enabled: boolean };
		output: { success: boolean; active: boolean };
	};
	/**
	 * 动态设置鼠标事件忽略模式（精确命中检测用）。
	 * ignore=true  → setIgnoreMouseEvents(true, { forward: true })：透明区域穿透，mousemove 仍转发
	 * ignore=false → setIgnoreMouseEvents(false)：窗口正常捕获全部鼠标事件
	 */
	pet_window_set_mouse_ignore: {
		input: { ignore: boolean };
		output: { success: boolean };
	};
	/**
	 * 让桌宠"说一句话"——主动朗读 + 弹气泡。
	 * 任何地方都可以调用：远程控制 / 番茄钟 / 工作流 / 设置面板试听 等。
	 * 朗读会走 TTSScope: pet（受 scene_pet_enabled / dnd 控制；force=true 可强制）。
	 */
	pet_speak: {
		input: {
			/** 必填：要朗读 + 显示的内容（已是面向用户的最终文案） */
			text: string;
			/** 触发的动作；不传则保持当前 motion */
			motion?:
				| "idle"
				| "greet"
				| "thinking"
				| "done"
				| "sad"
				| "sleepy"
				| "surprise";
			/** 气泡类型：notification（默认）= 自动消失；reminder = 持续直到用户处理 */
			bubble?: "notification" | "reminder";
			/** 气泡前缀（可视为 "小庆祝 / 安抚" 之类的语气提示） */
			prefix?: string;
			/** 气泡 type / reminder kind，用于上色与图标；可省略走默认 */
			notificationType?: "done" | "error" | "approval";
			reminderKind?: "schedule" | "pomodoro" | "approval-waiting";
			/** 强制朗读（忽略 scene_pet_enabled / dnd） */
			force?: boolean;
		};
		output: { success: boolean };
	};
	/**
	 * 桌宠台词生成（LLM 个性化朗读的入口；本期返回话术池兜底，留待后续接 LLM）。
	 * 当 scene_pet_persona_enabled = true 且配置了 provider/model 时，主进程会调 LLM
	 * 生成一句符合人设的台词；否则直接从 personality.ts 的话术池里选一句返回。
	 */
	pet_generate_line: {
		input: {
			/** 事件类型：决定话术池 key */
			event:
				| "thinkingShort"
				| "thinkingMedium"
				| "thinkingLong"
				| "done"
				| "error"
				| "approval"
				| "encouragement"
				| "consolation"
				| "greetFirstTimeToday"
				| "quickSuggestions"
				| "contextSwitchSkin";
			/** 当前 mascot id；用于选话术池 */
			mascotId?: string;
			/** 自定义上下文（如任务标题、错误内容），传给 LLM 当 user prompt */
			context?: string;
		};
		output: {
			text: string;
			source: "llm" | "pool";
		};
	};

	// ==================
	// 桌面宠物 IP（跨窗口同步）
	// ==================
	/** 设置当前宠物 IP，并广播给所有窗口（pet + main）。id 可以是内置 id、"off" 或自定义桌宠 id */
	mascot_set_id: {
		input: {
			id: string;
			source?: "main" | "pet" | "system";
		};
		output: { success: boolean };
	};
	/** 取当前持久化的 IP（启动时初始化用） */
	mascot_get_id: {
		input: Record<string, never>;
		output: { id: string };
	};
	/** 列出所有自定义桌宠（不含内置） */
	mascot_list_custom: {
		input: Record<string, never>;
		output: { mascots: CustomMascotMeta[] };
	};
	/** 导入自定义桌宠 zip 包；zipPath 为空时主进程弹原生文件选择 */
	mascot_import_custom: {
		input: { zipPath?: string };
		output: {
			success: boolean;
			mascot?: CustomMascotMeta;
			/** id 冲突时实际使用的 id（自动加 -2/-3 后缀） */
			finalId?: string;
			/** id 是否被改写（true 时 UI 应提示用户） */
			renamed?: boolean;
			error?: string;
		};
	};
	/**
	 * 从目录导入自定义桌宠（兼容 codex hatch-pet runs/<id> 与 ~/.codex/pets/<id>）
	 * - dirPath 为空时主进程弹原生目录选择
	 * - 与 zip 导入共享同一套校验 / 派生 / 写盘逻辑
	 */
	mascot_import_custom_dir: {
		input: { dirPath?: string };
		output: {
			success: boolean;
			mascot?: CustomMascotMeta;
			finalId?: string;
			renamed?: boolean;
			error?: string;
		};
	};
	/** 删除自定义桌宠；若它是当前选中，自动改回 "efficiency" 并广播 mascot-id-changed */
	mascot_delete_custom: {
		input: { id: string };
		output: { success: boolean; error?: string };
	};
	/** 编辑自定义桌宠的 meta（label / tagline / personality / accentColor） */
	mascot_update_custom_meta: {
		input: {
			id: string;
			label?: string;
			tagline?: string;
			personality?: string;
			accentColor?: string;
		};
		output: { success: boolean; mascot?: CustomMascotMeta; error?: string };
	};
	/** 备用——查询自定义桌宠某个 slot 的资源 URL（一般渲染层直接走 mascot:// 不需要这个） */
	mascot_get_custom_asset_url: {
		input: { id: string; slot: string };
		output: { url: string | null };
	};
	/**
	 * 主动触发宠物 reminder 气泡（番茄钟 / 外部 cron / 通知服务的接入点）。
	 * 本次只暴露通道，不绑定具体触发器。
	 */
	"pet-trigger-reminder": {
		input: {
			kind: "schedule" | "pomodoro" | "approval-waiting";
			title: string;
			detail?: string;
			id?: string;
		};
		output: { success: boolean };
	};

	// ==================
	// 预览服务器（沙盒前端预览）
	// ==================
	/** 启动预览服务器 */
	preview_server_start: {
		input: {
			taskId: string;
			sandboxDir: string;
			mode?: "dev" | "static" | "single";
		};
		output: {
			port: number;
			url: string;
			mode: "dev" | "static" | "single";
			processId?: number;
		};
	};
	/** 停止预览服务器 */
	preview_server_stop: {
		input: { taskId: string };
		output: { success: boolean };
	};
	/** 查询预览服务器状态 */
	preview_server_status: {
		input: { taskId: string };
		output: {
			running: boolean;
			mode?: "dev" | "static" | "single";
			url?: string;
			port?: number;
			ready?: boolean;
		};
	};
	/** 弹出独立预览窗口 */
	preview_window_open: {
		input: { taskId: string; url?: string };
		output: { windowId: number };
	};
	/** 保存沙盒文件（Monaco 编辑器用） */
	sandbox_save_file: {
		input: { taskId: string; relPath: string; content: string };
		output: { success: boolean };
	};

	// ==================
	// Reader（阅读器）
	// ==================
	/** 导入电子书：解析元数据 + 抽取目录 + 生成封面 + 全文索引 */
	reader_import_files: {
		input: {
			paths: string[];
			project_id?: string | null;
			folder_id?: string | null;
			/**
			 * 静默导入：仅写 reader_books（阅读器自身需要），跳过 sources / notes / note_chunks
			 * 全文索引写入。用于"在阅读器中打开本地文件但不放进资料库"的场景。
			 */
			silent?: boolean;
		};
		output: ReaderBook[];
	};
	/** 列出书架（按 last_opened_at / added_at 排序） */
	reader_list_books: {
		input: {
			format?: ReaderFormat;
			project_id?: string | null;
			limit?: number;
			sort?: "recent" | "added" | "title";
		};
		output: ReaderBook[];
	};
	/** 单本元数据 + TOC */
	reader_get_book: {
		input: { id: string };
		output: ReaderBook | null;
	};
	/** 打开（更新 last_opened_at） */
	reader_open_book: {
		input: { id: string };
		output: { book: ReaderBook; progress: ReaderProgress | null };
	};
	/** 通过资料库 source_id 打开阅读器：先查关联，未关联时尝试用 source 原文件路径补建并关联 */
	reader_open_from_source: {
		input: { source_id: string };
		output: { book: ReaderBook | null };
	};
	/** 删除一本书（不删除底层文件，仅清理书架记录） */
	reader_delete_book: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 取章节内容（HTML / 文本 / 图片序列） */
	reader_get_chapter: {
		input: { book_id: string; chapter_id: string };
		output: ReaderChapter;
	};
	/** 保存阅读位置 */
	reader_save_progress: {
		input: {
			book_id: string;
			locator: string;
			percent: number;
			chapter_id?: string | null;
		};
		output: ReaderProgress;
	};
	/** 书内全文搜索（FTS5） */
	reader_search_in_book: {
		input: { book_id: string; query: string; limit?: number };
		output: ReaderSearchHit[];
	};
	/** 跨书全文搜索（书架范围） */
	reader_search_global: {
		input: { query: string; limit?: number };
		output: ReaderSearchHit[];
	};
	/** 列出某书的高亮 */
	reader_list_highlights: {
		input: { book_id: string };
		output: ReaderHighlight[];
	};
	/** 创建高亮（含可选笔记） */
	reader_create_highlight: {
		input: {
			book_id: string;
			locator_start: string;
			locator_end: string;
			text: string;
			color?: ReaderHighlightColor;
			note?: string | null;
		};
		output: ReaderHighlight;
	};
	/** 更新高亮（颜色 / 笔记） */
	reader_update_highlight: {
		input: {
			id: string;
			color?: ReaderHighlightColor;
			note?: string | null;
		};
		output: ReaderHighlight;
	};
	/** 删除高亮 */
	reader_delete_highlight: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 列出某书的书签 */
	reader_list_bookmarks: {
		input: { book_id: string };
		output: ReaderBookmark[];
	};
	/** 创建书签 */
	reader_create_bookmark: {
		input: { book_id: string; locator: string; label?: string | null };
		output: ReaderBookmark;
	};
	/** 删除书签 */
	reader_delete_bookmark: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 阅读会话开始（用于阅读统计） */
	reader_session_start: {
		input: { book_id: string };
		output: ReaderSession;
	};
	/** 阅读会话结束（写入 duration / pages_read） */
	reader_session_end: {
		input: { session_id: string; pages_read?: number };
		output: ReaderSession;
	};
	/** 列出阅读会话（用于热力图） */
	reader_list_sessions: {
		input: { book_id?: string; days?: number; limit?: number };
		output: ReaderSession[];
	};
	/** 导出某书的高亮与笔记为 Markdown */
	reader_export_highlights: {
		input: { book_id: string; format?: "markdown" };
		output: { content: string; suggested_filename: string };
	};
	/** 获取阅读器全局设置（落 app_config） */
	reader_get_settings: {
		input: Record<string, never>;
		output: {
			theme: string;
			font_family: string;
			font_size: number;
			line_height: number;
			letter_spacing: number;
			column_count: 1 | 2;
			max_width_ch: number;
			page_transition: "slide" | "fade" | "instant";
			auto_hide_chrome_ms: number;
			default_selection_action: "explain" | "translate" | "highlight" | "ask";
			tts_provider: "system" | "openai" | "azure" | "volcano";
			tts_rate: number;
			ai_context_scope: "chapter" | "book";
			disable_notifications_while_reading: boolean;
			/** 卡片生成模型；空字符串表示使用全局活跃模型 */
			card_gen_model: string;
			card_default_count_selection: number;
			card_default_count_chapter: number;
			card_srs_enabled: boolean;
			card_daily_new_limit: number;
		};
	};
	/** 更新阅读器设置 */
	reader_update_settings: {
		input: Partial<{
			theme: string;
			font_family: string;
			font_size: number;
			line_height: number;
			letter_spacing: number;
			column_count: 1 | 2;
			max_width_ch: number;
			page_transition: "slide" | "fade" | "instant";
			auto_hide_chrome_ms: number;
			default_selection_action: "explain" | "translate" | "highlight" | "ask";
			tts_provider: "system" | "openai" | "azure" | "volcano";
			tts_rate: number;
			ai_context_scope: "chapter" | "book";
			disable_notifications_while_reading: boolean;
			/** 卡片生成模型；空字符串表示使用全局活跃模型 */
			card_gen_model: string;
			card_default_count_selection: number;
			card_default_count_chapter: number;
			card_srs_enabled: boolean;
			card_daily_new_limit: number;
		}>;
		output: { success: boolean };
	};
	/** 列出某书的知识卡片 */
	reader_list_cards: {
		input: { book_id: string; chapter_id?: string };
		output: ReaderKnowledgeCard[];
	};
	/** 跨书查询卡片（支持 status / due / tag / 搜索） */
	reader_list_all_cards: {
		input: {
			book_id?: string | null;
			status?: ReaderCardStatus | null;
			due_only?: boolean | null;
			tag?: string | null;
			search?: string | null;
			limit?: number | null;
		};
		output: ReaderKnowledgeCard[];
	};
	/** 列出当前到期需要复习的卡片 */
	reader_list_due_cards: {
		input: { book_id?: string | null; limit?: number | null };
		output: ReaderKnowledgeCard[];
	};
	/** 列出所有已用过的标签（按使用频率降序） */
	reader_list_card_tags: {
		input: { book_id?: string | null };
		output: string[];
	};
	/** 创建知识卡片 */
	reader_create_card: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			question: string;
			answer: string;
			source_text?: string | null;
			locator?: string | null;
			tags?: string[] | null;
			status?: ReaderCardStatus | null;
		};
		output: ReaderKnowledgeCard;
	};
	/** 批量创建草稿卡片（一次划词/章节生成共享 generation_session_id） */
	reader_create_draft_cards: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			locator?: string | null;
			source_text?: string | null;
			generation_session_id: string;
			items: Array<{ question: string; answer: string }>;
		};
		output: ReaderKnowledgeCard[];
	};
	/** 接受草稿卡片（status: draft → active） */
	reader_accept_draft_cards: {
		input: { ids: string[] };
		output: { accepted: number };
	};
	/** 拒绝草稿卡片（删除） */
	reader_reject_draft_cards: {
		input: { ids: string[] };
		output: { rejected: number };
	};
	/** 更新知识卡片（问题 / 答案 / 标签 / 状态） */
	reader_update_card: {
		input: {
			id: string;
			question?: string;
			answer?: string;
			tags?: string[];
			status?: ReaderCardStatus;
		};
		output: ReaderKnowledgeCard;
	};
	/** 单独更新卡片标签 */
	reader_update_card_tags: {
		input: { id: string; tags: string[] };
		output: ReaderKnowledgeCard;
	};
	/** 上报复习结果（SM-2） */
	reader_review_card: {
		input: { id: string; quality: 0 | 1 | 2 };
		output: ReaderKnowledgeCard;
	};
	/** 删除知识卡片 */
	reader_delete_card: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 批量删除知识卡片 */
	reader_delete_cards_bulk: {
		input: { ids: string[] };
		output: { success: boolean; deleted: number };
	};
	/** AI 生成知识卡片（启动 LLM 流，结果通过事件推送） */
	reader_generate_cards: {
		input: {
			book_id: string;
			chapter_id?: string | null;
			text: string;
			count?: number;
		};
		output: { started: boolean };
	};

	// =====================
	// TTS（文本转语音）— 全局多 provider 模块
	// 接入：阅读器 / 聊天 / 桌宠
	// =====================
	/** 读取 TTS 全局设置（含 providers 数组与各场景默认） */
	tts_settings_get: {
		input: Record<string, never>;
		output: TTSSettings;
	};
	/** 更新 TTS 全局设置（部分字段；providers 整体替换） */
	tts_settings_update: {
		input: Partial<TTSSettings>;
		output: TTSSettings;
	};
	/** 列出某 provider 内的可用音色（含克隆） */
	tts_list_voices: {
		input: { providerId: string; forceRefresh?: boolean };
		output: TTSVoice[];
	};
	/** 试听某音色（不传 text 时使用默认问候语） */
	tts_voice_preview: {
		input: { providerId: string; voiceId: string; text?: string };
		output: { audioBase64: string; format: string };
	};
	/** 克隆新音色：上传样本 + 命名 + 描述 */
	tts_clone_voice: {
		input: TTSCloneRequest;
		output: { ok: boolean; voice?: TTSVoice; error?: string };
	};
	/** 删除已克隆的音色 */
	tts_delete_voice: {
		input: { providerId: string; voiceId: string };
		output: { ok: boolean; error?: string };
	};
	/** 查询某 provider 的能力（用于 UI 决定哪些区块显隐） */
	tts_capabilities: {
		input: { providerId: string };
		output: TTSCapabilities;
	};
	/** 一次性合成（小文本 / 试听走这个；返回 base64） */
	tts_synthesize: {
		input: TTSSynthesizeRequest;
		output: { audioBase64: string; format: string };
	};
	/** 流式合成（长文本走这个；通过 tts-stream-chunk 事件下发） */
	tts_synthesize_stream: {
		input: TTSSynthesizeRequest & { streamId: string };
		output: { ok: boolean };
	};
	/** 取消进行中的流式合成 */
	tts_cancel: {
		input: { streamId: string };
		output: { ok: boolean };
	};
	/** 测试某 provider 配置是否可用 */
	tts_test: {
		input: { providerId: string; text?: string };
		output: {
			ok: boolean;
			audioBase64?: string;
			format?: string;
			error?: string;
		};
	};

	// ==================================================================================
	// 语言风格包（Style Profile）IPC channels
	// ==================================================================================

	/** 创建风格包 */
	style_profile_create: {
		input: {
			name: string;
			description?: string;
			language?: string;
			analyze_model_id?: string;
		};
		output: StyleProfile;
	};
	/** 获取风格包列表 */
	style_profile_list: {
		input: { include_archived?: boolean };
		output: StyleProfile[];
	};
	/** 获取风格包详情（含分析结果和样本） */
	style_profile_get: {
		input: { id: string };
		output: StyleProfileDetail;
	};
	/** 更新风格包基本信息 */
	style_profile_update: {
		input: {
			id: string;
			name?: string;
			description?: string;
			language?: string;
			analyze_model_id?: string;
			generation_config?: StyleProfile["generation_config"];
			is_default?: boolean;
		};
		output: StyleProfile;
	};
	/** 删除风格包（含级联删除样本、分析、反馈） */
	style_profile_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 归档/恢复风格包 */
	style_profile_archive: {
		input: { id: string; archive: boolean };
		output: StyleProfile;
	};

	/** 添加样本 */
	style_sample_add: {
		input: {
			profile_id: string;
			title?: string;
			content: string;
			content_type?: StyleSampleContentType;
			authorization_status?: StyleSampleAuthStatus;
		};
		output: StyleSample;
	};
	/** 删除样本 */
	style_sample_remove: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 获取某风格包的所有样本 */
	style_sample_list: {
		input: { profile_id: string };
		output: StyleSample[];
	};
	/** 主进程解析文件（txt/md/docx/pdf）→ 返回文本 */
	style_sample_parse_file: {
		input: { file_path: string };
		output: { content: string; title: string; word_count: number };
	};
	/** 从 zip 压缩包批量导入样本（主进程解压 + 解析） */
	style_sample_import_from_zip: {
		input: { profile_id: string; zip_path: string };
		output: {
			imported: number;
			failed: number;
			results: Array<{ file: string; success: boolean; error?: string }>;
		};
	};

	/** 触发 LLM 分步分析（通过 style-analysis-progress 事件推送进度） */
	style_analysis_start: {
		input: { profile_id: string; model_id?: string };
		output: { job_id: string };
	};
	/** 获取已完成的分析结果 */
	style_analysis_get: {
		input: { profile_id: string };
		output: StyleAnalysisData | null;
	};
	/** 手动更新（校准）分析结果 */
	style_analysis_update: {
		input: { profile_id: string; data: Partial<StyleAnalysisData> };
		output: StyleAnalysisData;
	};

	/** 将风格包渲染为注入用的 system prompt XML 块 */
	style_profile_render_prompt: {
		input: { profile_id: string; intensity?: StyleIntensity };
		output: { prompt: string };
	};

	/** 提交风格反馈 */
	style_feedback_submit: {
		input: {
			profile_id: string;
			feedback_type: StyleFeedbackType;
			session_context?: string;
			note?: string;
		};
		output: StyleFeedback;
	};
	/** 获取风格包的历史反馈 */
	style_feedback_list: {
		input: { profile_id: string; limit?: number };
		output: StyleFeedback[];
	};

	// ==================================================================================
	// 语言风格包混搭配方（Style Recipe）IPC channels
	// ==================================================================================

	/** 创建混搭配方 */
	style_recipe_create: {
		input: {
			name: string;
			description?: string;
			// v2 层级来源（灵魂 / 思维 / 篇章 / 血肉 / 关系性）
			soul_profile_id?: string | null;
			thinking_profile_id?: string | null;
			articulation_profile_id?: string | null;
			texture_profile_id?: string | null;
			relational_profile_id?: string | null;
			// v1 层级来源（向后兼容）
			cognitive_profile_id?: string | null;
			rhetorical_profile_id?: string | null;
			aesthetic_profile_id?: string | null;
			anchors_profile_id?: string | null;
			intensity?: StyleIntensity;
		};
		output: StyleProfileRecipe;
	};
	/** 获取混搭配方列表 */
	style_recipe_list: {
		input: Record<string, never>;
		output: StyleProfileRecipe[];
	};
	/** 获取混搭配方详情 */
	style_recipe_get: {
		input: { id: string };
		output: StyleProfileRecipe;
	};
	/** 更新混搭配方 */
	style_recipe_update: {
		input: {
			id: string;
			name?: string;
			description?: string;
			// v2 层级来源
			soul_profile_id?: string | null;
			thinking_profile_id?: string | null;
			articulation_profile_id?: string | null;
			texture_profile_id?: string | null;
			relational_profile_id?: string | null;
			// v1 层级来源（向后兼容）
			cognitive_profile_id?: string | null;
			rhetorical_profile_id?: string | null;
			aesthetic_profile_id?: string | null;
			anchors_profile_id?: string | null;
			intensity?: StyleIntensity;
		};
		output: StyleProfileRecipe;
	};
	/** 删除混搭配方 */
	style_recipe_delete: {
		input: { id: string };
		output: { success: boolean };
	};
	/** 将混搭配方渲染为注入用的 system prompt XML 块 */
	style_recipe_render_prompt: {
		input: { recipe_id: string; intensity?: StyleIntensity };
		output: { prompt: string };
	};
};

// =====================
// TTS 类型导出（renderer 端通过 import type 复用）
// =====================
export type TTSProviderType =
	| "system"
	| "openai_compatible"
	| "elevenlabs"
	| "volcano"
	| "mimo";

export interface TTSCapabilities {
	listVoices: boolean;
	cloneVoice: boolean;
	deleteVoice: boolean;
	voiceLabels: boolean;
	streamSynthesis: boolean;
}

export interface TTSProviderConfig {
	id: string;
	name: string;
	type: TTSProviderType;
	api_key?: string;
	api_base?: string;
	model?: string;
	voice?: string;
	metadata?: Record<string, unknown>;
	is_enabled: boolean;
	capabilities?: TTSCapabilities;
}

export interface TTSVoice {
	id: string;
	providerId: string;
	name: string;
	language?: string;
	gender?: "male" | "female" | "neutral";
	description?: string;
	preview_url?: string;
	is_cloned: boolean;
	labels?: Record<string, string>;
	created_at?: number;
}

export interface TTSSynthesizeRequest {
	providerId: string;
	text: string;
	voice?: string;
	rate?: number;
	format?: "mp3" | "wav" | "opus";
	streamId?: string;
}

export interface TTSCloneSample {
	filename: string;
	dataBase64: string;
	mimeType?: string;
}

export interface TTSCloneRequest {
	providerId: string;
	name: string;
	description?: string;
	samples: TTSCloneSample[];
	labels?: Record<string, string>;
}

export type TTSScenePetFilter =
	| "reminder"
	| "approval"
	| "done"
	| "error"
	| "progress"
	/** 任务启动瞬间（agent_start）朗读 thinkingShort 话术 */
	| "task_start"
	/** 任务长时思考（>60s）朗读 thinkingMedium / thinkingLong */
	| "thinking";

export interface TTSSettings {
	default_provider_id: string | null;
	default_voice_id: string | null;
	rate: number;
	volume: number;
	pitch: number;
	scene_reader_enabled: boolean;
	scene_reader_voice_id: string | null;
	scene_chat_enabled: boolean;
	scene_chat_auto: boolean;
	scene_chat_voice_id: string | null;
	scene_pet_enabled: boolean;
	scene_pet_filter: TTSScenePetFilter[];
	scene_pet_verbosity: "title" | "full";
	scene_pet_voice_id: string | null;
	/**
	 * 桌宠"AI 个性化说话"开关；启用后 pet_generate_line 走 LLM 生成台词，
	 * 否则回退到 personality.ts 话术池。本字段以下三项为后续接入 LLM 留的扩展点。
	 */
	scene_pet_persona_enabled: boolean;
	/** AI 人设 system prompt（附在 LLM 调用前） */
	scene_pet_persona_prompt: string | null;
	/** 走哪个 LLM provider（关联 settings 表 / model_providers），null 走默认 */
	scene_pet_persona_provider_id: string | null;
	/** 用什么模型；null 走 provider 默认 */
	scene_pet_persona_model: string | null;
	providers: TTSProviderConfig[];
	updated_at: number | null;
}

/** 流式合成事件 chunk（通过 tts-stream-chunk 通道下发） */
export interface TTSStreamChunkEvent {
	streamId: string;
	/** base64 编码的音频片段 */
	audioBase64?: string;
	format?: string;
	done: boolean;
	error?: string;
}

/** 克隆进度事件（通过 tts-clone-progress 通道下发） */
export interface TTSCloneProgressEvent {
	providerId: string;
	stage: "uploading" | "training" | "ready" | "error";
	progress: number; // 0~1
	message?: string;
}

// ==================================================================================
// 语言风格包（Style Profile）共享类型 — 完整「灵魂-骨干-血肉」体系
// ==================================================================================

/** 风格轴维度分析结果 */
export interface StyleAxisAnalysis {
	/** 维度名称 */
	name: string;
	/** 描述性文本 */
	description: string;
	/** 强度标注 */
	intensity: "low" | "medium" | "high" | "insufficient_evidence";
	/** 条件/触发场景（可选） */
	conditions?: string;
	/** 经变标注：该维度是跨题目不变(经)还是会摆动(变) */
	constancy?: "constant" | "variable";
	/** 变化范围或触发条件（当 constancy=variable 时有效） */
	variance_note?: string;
}

/** 灵魂层 - 世界观与根本姿态 */
export interface SoulLayerAnalysis {
	/** 核心关切（最多2-3个） */
	core_concerns: StyleAxisAnalysis[];
	/** 对核心关切的基本立场 */
	core_stance: StyleAxisAnalysis[];
	/** 认识论姿态（实证↔诠释↔实用） */
	epistemology: StyleAxisAnalysis[];
	/** 复杂性与矛盾的处理 */
	complexity_handling: StyleAxisAnalysis[];
	/** 不确定性的姿态 */
	uncertainty_stance: StyleAxisAnalysis[];
	/** 与时间的关系（历史↔当下↔前瞻） */
	temporal_orientation: StyleAxisAnalysis[];
	/** 系统与个案的优先级 */
	system_vs_case: StyleAxisAnalysis[];
	/** 与主流/共识的关系 */
	mainstream_relation: StyleAxisAnalysis[];
	/** 起笔的触发（反应↔生成） */
	initiation_trigger: StyleAxisAnalysis[];
	/** 读者关系的根本姿态 */
	reader_relation: StyleAxisAnalysis[];
	/** 自我在场方式 */
	self_presence: StyleAxisAnalysis[];
	/** 语言的自觉度 */
	language_consciousness: StyleAxisAnalysis[];
	/** 根本气质 */
	fundamental_temperament: StyleAxisAnalysis[];
}

/** 骨干层 - 思维运作 */
export interface ThinkingOperationAnalysis {
	/** 推理方向（归纳↔演绎↔类比） */
	reasoning_direction: StyleAxisAnalysis[];
	/** 抽象-具体的运动 */
	abstraction_movement: StyleAxisAnalysis[];
	/** 取景与剪裁 */
	attention_framing: StyleAxisAnalysis[];
	/** 论据的质料偏好 */
	evidence_preference: StyleAxisAnalysis[];
	/** 论证的构造方式 */
	argumentation_structure: StyleAxisAnalysis[];
	/** 收敛方式 */
	convergence_mode: StyleAxisAnalysis[];
}

/** 骨干层 - 篇章外化（关节活动范围） */
export interface ArticulationPatternAnalysis {
	/** 问题驱动程度 */
	question_driven: StyleAxisAnalysis[];
	/** 信息密度的运动范围 */
	density_movement: StyleAxisAnalysis[];
	/** 转折/让步的关节范围 */
	transition_joint: StyleAxisAnalysis[];
	/** 开篇的重力倾向 */
	opening_gravity: StyleAxisAnalysis[];
	/** 结尾的重力倾向 */
	closing_gravity: StyleAxisAnalysis[];
	/** 结构的显隐 */
	structure_visibility: StyleAxisAnalysis[];
}

/** 血肉层 - 语言质感与指纹 */
export interface TextureLayerAnalysis {
	/** 句子节奏 */
	sentence_rhythm: StyleAxisAnalysis[];
	/** 词汇层级 */
	lexical_register: StyleAxisAnalysis[];
	/** 修辞偏好 */
	rhetorical_devices: StyleAxisAnalysis[];
	/** 情感温度及其突破条件 */
	emotional_temperature: StyleAxisAnalysis[];
	/** 比喻系统 */
	metaphor_system: StyleAxisAnalysis[];
	/** 数据与数字的审美 */
	data_aesthetics: StyleAxisAnalysis[];
	/** 人称/称谓的具体使用 */
	pronoun_usage: StyleAxisAnalysis[];
	/** 引用与他者声音的处理 */
	citation_handling: StyleAxisAnalysis[];
	/** 格式与排版习惯 */
	formatting_habits: StyleAxisAnalysis[];
	/** 指纹级小习惯 */
	fingerprint_habits: StyleAxisAnalysis[];
}

/** 横切话题（贯穿三层） */
export interface CrossCuttingTopics {
	/** 执念意象/反复出现的例证域 */
	recurring_imagery?: {
		soul: string; // 为什么重要
		structure: string; // 在论证什么位置出现、起什么作用
		texture: string; // 具体怎么措辞
	};
	/** 幽默与讽刺 */
	humor_irony?: {
		soul: string; // 根在灵魂根本气质
		structure: string; // 出现在什么阶段、服务什么功能
		texture: string; // 靠什么手段
	};
	/** 标题习惯 */
	title_habit?: {
		structure: string; // 在结构中的角色
		texture: string; // 表层形式
	};
	/** 元评论/自我指涉 */
	meta_commentary?: {
		soul: string; // 是否是自我在场的延伸
		structure: string; // 出现在思维转向的什么节点
		texture: string; // 具体怎么表达
	};
}

/** 关系性维度 - 气韵（跨层） */
export interface LayerHarmony {
	/** 一句话描述三层之间的比例关系或反差 */
	description: string;
}

/** 关系性维度 - 全息性（跨尺度） */
export interface HolographicPattern {
	/** 模式名称 */
	name: string;
	/** 模式描述 */
	description: string;
	/** 句子级表现 */
	sentence_level?: string;
	/** 段落级表现 */
	paragraph_level?: string;
	/** 全文级表现 */
	article_level?: string;
}

/** 关系性维度 - 经变分布（跨篇） */
export interface ConstancyVarianceMap {
	/** 综合一句话：经集中在哪些方面，变集中在哪些方面 */
	summary: string;
	/** 标记为"经"的维度关键路径 */
	constants: string[];
	/** 标记为"变"的维度及其浮动范围 */
	variables: Array<{ dimension: string; range: string }>;
}

/** 校准锚点（扩展） */
export interface StyleCalibrationAnchors {
	/** 正向示例（倾向使用的表达方式） */
	positive: string[];
	/** 负向示例（应避免的表达方式） */
	negative: string[];
	/** 缺失特征（分析时样本不足的维度） */
	missing: string[];
	/** 关系性维度 - 气韵 */
	layer_harmony?: LayerHarmony;
	/** 关系性维度 - 全息性 */
	holographic_patterns?: HolographicPattern[];
	/** 关系性维度 - 经变分布 */
	constancy_variance?: ConstancyVarianceMap;
}

/** 风格分析结果完整结构 */
export interface StyleAnalysisData {
	/** schema 版本标识（v2 = 新体系） */
	schema_version?: "v1" | "v2";
	/** 灵魂层：世界观与根本姿态 */
	soul_layer?: SoulLayerAnalysis;
	/** 骨干层：思维运作 */
	thinking_operation?: ThinkingOperationAnalysis;
	/** 骨干层：篇章外化 */
	articulation_pattern?: ArticulationPatternAnalysis;
	/** 血肉层：语言质感与指纹 */
	texture_layer?: TextureLayerAnalysis;
	/** 横切话题 */
	cross_cutting?: CrossCuttingTopics;
	/** 校准锚点（含关系性维度） */
	calibration_anchors: StyleCalibrationAnchors;
	/** 任务适配规则（key=任务类型，value=特殊调整说明） */
	task_adaptation_rules: Record<string, string>;

	// === 向后兼容字段（v1 旧数据） ===
	/** @deprecated 旧版：文本认知模式 */
	cognitive_pattern?: StyleAxisAnalysis[];
	/** @deprecated 旧版：话语姿态 */
	rhetorical_stance?: StyleAxisAnalysis[];
	/** @deprecated 旧版：语言审美 */
	language_aesthetic?: StyleAxisAnalysis[];
}

/** 风格包状态 */
export type StyleProfileStatus = "active" | "archived";

/** 风格强度 */
export type StyleIntensity = "low" | "medium" | "high";

/** 样本内容类型 */
export type StyleSampleContentType = "article" | "email" | "social" | "other";

/** 样本授权状态 */
export type StyleSampleAuthStatus =
	| "self_authored"
	| "licensed"
	| "public_domain";

/** 风格包基本信息（列表用） */
export interface StyleProfile {
	id: string;
	name: string;
	description: string | null;
	status: StyleProfileStatus;
	language: string;
	generation_config: {
		default_intensity?: StyleIntensity;
	};
	analyze_model_id: string | null;
	is_default: boolean;
	created_at: number;
	updated_at: number;
}

/** 风格包详情（含分析结果） */
export interface StyleProfileDetail extends StyleProfile {
	analysis: StyleAnalysisData | null;
	samples: StyleSample[];
}

/** 样本记录 */
export interface StyleSample {
	id: string;
	profile_id: string;
	title: string | null;
	content: string;
	content_type: StyleSampleContentType;
	authorization_status: StyleSampleAuthStatus;
	word_count: number;
	created_at: number;
}

/** 风格反馈类型 */
export type StyleFeedbackType =
	| "too_weak"
	| "too_heavy"
	| "too_imitative"
	| "unnatural"
	| "great";

/** 风格反馈记录 */
export interface StyleFeedback {
	id: string;
	profile_id: string;
	session_context: string | null;
	feedback_type: StyleFeedbackType;
	note: string | null;
	created_at: number;
}

/** 分析进度推送事件（通过 style-analysis-progress 通道） */
export interface StyleAnalysisProgressEvent {
	profile_id: string;
	step: number;        // 1-4
	total_steps: number; // 4
	step_name: string;
	status: "running" | "done" | "error";
	partial_result?: Partial<StyleAnalysisData>;
	error?: string;
}

/** 混搭配方（从多个风格包中挑选不同层级组合） */
export interface StyleProfileRecipe {
	id: string;
	name: string;
	description: string | null;
	/** 灵魂层来源 profile_id */
	soul_profile_id: string | null;
	/** 骨干层-思维运作来源 profile_id */
	thinking_profile_id: string | null;
	/** 骨干层-篇章外化来源 profile_id */
	articulation_profile_id: string | null;
	/** 血肉层来源 profile_id */
	texture_profile_id: string | null;
	/** 关系性维度来源 profile_id（气韵、全息、经变） */
	relational_profile_id: string | null;
	intensity: StyleIntensity;
	created_at: number;
	updated_at: number;
	/** 各层级来源的名称（由后端填充，方便前端展示） */
	soul_profile_name?: string;
	thinking_profile_name?: string;
	articulation_profile_name?: string;
	texture_profile_name?: string;
	relational_profile_name?: string;

	// === 向后兼容字段（v1 旧数据） ===
	/** @deprecated 旧版：认知模式来源 */
	cognitive_profile_id?: string | null;
	/** @deprecated 旧版：话语姿态来源 */
	rhetorical_profile_id?: string | null;
	/** @deprecated 旧版：语言审美来源 */
	aesthetic_profile_id?: string | null;
	/** @deprecated 旧版：校准锚点来源 */
	anchors_profile_id?: string | null;
	cognitive_profile_name?: string;
	rhetorical_profile_name?: string;
	aesthetic_profile_name?: string;
	anchors_profile_name?: string;
}

export type IPCChannel = keyof IPCSchema;
