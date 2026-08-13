// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 内容 = 原 ipc-schema.ts 里除 `IPCSchema` 本体之外的全部辅助类型声明。
// 各域 schema（同目录的其它文件）与 barrel `../ipc-schema.ts` 都从这里取类型。

export type {
	AgentArtifact,
	AgentAuditLog,
	AgentCheckpoint,
	AgentMessage,
	AgentNode,
	AgentSession,
	AgentTask,
	AgentToolCall,
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
} from "../types";
export type { RemoteGatewayScope } from "../remote-control-schema";

export type RemoteChannelId =
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
export type RemoteChannelFeatureConfig = {
	streaming: { mode: "off" | "edit" | "card" };
	typing: { enabled: boolean };
	interactive: { enabled: boolean };
	dedupe: { persistent: boolean };
	sequential_delivery: boolean;
};

/** QQ Bot 渠道配置（阶段 5 启用） */
export type RemoteQqbotIpc = {
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
export type RemoteWechatIpc = {
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
export type RemoteTerminalPresetIpc = {
	id: string;
	name: string;
	command: string;
	cwd?: string;
};

/** 远程终端配置（IM 远控 pty 桥） */
export type RemoteTerminalColorModeIpc = "auto" | "ansi" | "plain";

export type RemoteTerminalIpc = {
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
export type RemoteTerminalSessionIpc = {
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

export type RemotePairingStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "revoked";
export type RemotePairingRecordStatus = "approved" | "revoked";
export type RemoteSessionState =
	| "running"
	| "waiting_interaction"
	| "completed"
	| "aborted"
	| "error";
export type CloudNodeRoutingMode = "cloud_only" | "prefer_desktop" | "auto";

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

/** 导入导出命令的统一返回体（`export_project` / `import_data*`）。 */
export interface IpcExportResult {
	success: boolean;
	file_path?: string;
	file_size?: number;
	export_time: number;
	error?: string;
}

export interface IpcImportResult {
	success: boolean;
	imported_count: {
		projects: number;
		folders: number;
		sources: number;
		notes: number;
	};
	import_time: number;
	error?: string;
}

/** 本机可导入登录态的浏览器 profile。 */
export interface BrowserCookieSourceRow {
	/** chrome / edge / brave */
	browser: string;
	/** 展示名（"Google Chrome · Default"） */
	label: string;
	/** profile 目录名（Default / Profile 1 …） */
	profile: string;
	/**
	 * 该 profile 里目标站点未过期的 cookie 条数。
	 * 只在请求时带了 `site_id` 才有值；0 表示这个 profile 没在该站点登录过。
	 */
	valid_cookies?: number;
}

/** 一个时间桶内的用量。 */
export interface HarnessUsageBucket {
	sessions: number;
	messages: number;
	/** 估算 token，口径见 HarnessUsageRow.token_basis */
	token_estimate: number;
}

/**
 * 单个 AI 入口的用量。
 *
 * **口径必须如实展示给用户，不要在 UI 上把它说成精确值：**
 * - `cli`：token 由各 adapter 从会话 JSONL 的 usage 字段推算（只累加 output，
 *   输入侧用最后一条的 input+cache 近似当前上下文），属于估算。
 * - `app`：本应用自己的 Agent SDK 会话，同上。
 * - `web`：Web 端不暴露 token，只能按提取到的字符数 /4 粗估；而且**只统计用户
 *   主动「提取当前对话」导入过的会话**，不是该站点的全部使用量。
 *
 * 时间分桶按会话 `updated_at`（最后活跃时间）归集，不是按每条消息。
 */
export interface HarnessUsageRow {
	harness: string;
	label: string;
	kind: "cli" | "web" | "app";
	/** token 估算口径：usage 字段推算 / 字符数粗估 */
	token_basis: "usage" | "chars";
	/** Web 入口为 true：只统计主动导入过的会话，不代表全部使用量 */
	partial_coverage: boolean;
	last_active_at: number | null;
	total: HarnessUsageBucket;
	today: HarnessUsageBucket;
	week: HarnessUsageBucket;
	month: HarnessUsageBucket;
}

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
	step: number; // 1-4
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

// ==================
// Chat 历史（SQLite 后端，F2）行类型
// ==================

/** chat_sessions 表行（list 输出，附带派生统计字段） */
export interface ChatHistorySessionRow {
	id: string;
	title: string;
	folder_id: string | null;
	cwd: string | null;
	agent_session_id: string | null;
	is_pinned: boolean;
	is_archived: boolean;
	created_at: number;
	updated_at: number;
	/** 装不下的会话字段（model / sdkSessionId / threadSource 等）的 JSON */
	meta_json: string | null;
	/** 该会话消息总数（派生） */
	message_count: number;
	/** 末条消息角色（派生，可能为 null） */
	last_message_role: string | null;
	/** 末条消息内容预览（截断，派生） */
	last_message_preview: string | null;
	/** 末条消息时间（派生） */
	last_message_at: number | null;
	/** 末条 user 消息内容预览（截断，派生；线程列表预览用） */
	last_user_preview: string | null;
}

/** chat_sessions upsert 输入 */
export interface ChatHistorySessionInput {
	id: string;
	title: string;
	folder_id?: string | null;
	cwd?: string | null;
	agent_session_id?: string | null;
	is_pinned?: boolean;
	is_archived?: boolean;
	created_at: number;
	updated_at: number;
	meta_json?: string | null;
}

/** chat_messages 表行 */
export interface ChatHistoryMessageRow {
	id: string;
	session_id: string;
	role: string;
	content: string;
	/** metadata.blocks 的 JSON */
	blocks_json: string | null;
	/** 其余消息字段（model / suggestedContent / originalContent / metadata 去 blocks）的 JSON */
	metadata_json: string | null;
	/** 会话内顺序号 */
	seq: number;
	created_at: number;
}

/** chat_messages upsert 输入（session_id 由命令参数携带） */
export interface ChatHistoryMessageInput {
	id: string;
	role: string;
	content: string;
	blocks_json?: string | null;
	metadata_json?: string | null;
	seq: number;
	created_at: number;
}

// ==================
// AI Harness Hub 行类型
// ==================

/** harness 探测结果行 */
export interface HarnessDetectionRow {
	harness: string;
	label: string;
	installed: boolean;
	bin_path: string | null;
	session_dir: string | null;
	/** 能否读取历史会话（adapter 已实现且目录存在） */
	can_read: boolean;
	/** 能否被注入（App 内 pty 启动该 CLI） */
	can_inject: boolean;
	/** 在 pty 中启动该 CLI 的命令（中栏 CLI 标签页用它拉起进程） */
	launch_command: string;
	session_count: number;
}

/** harness_sessions 表行 */
export interface HarnessSessionRow {
	id: string;
	harness: string;
	external_id: string;
	cwd: string | null;
	title: string | null;
	summary: string | null;
	status: string;
	origin_path: string | null;
	message_count: number;
	token_estimate: number;
	/** model / gitBranch / cliVersion / provider 等的 JSON */
	meta_json: string | null;
	created_at: number;
	updated_at: number;
}

/** harness_messages 表行 */
export interface HarnessMessageRow {
	id: string;
	session_id: string;
	role: string;
	content: string;
	/** CanonicalBlock[] 的 JSON（thinking / tool_use / tool_result） */
	blocks_json: string | null;
	seq: number;
	created_at: number;
}

/** 全文检索命中项（附所属会话的展示信息） */
export interface HarnessSearchHit {
	session_id: string;
	harness: string;
	title: string | null;
	cwd: string | null;
	role: string;
	seq: number;
	/** 命中片段（FTS snippet，命中词用 <mark> 包裹） */
	snippet: string;
	created_at: number;
}

/** 蒸馏产出的结构化交接包 */
export interface HarnessHandoffPackage {
	goal: string;
	done: string[];
	in_progress: string[];
	decisions: string[];
	files: string[];
	next_steps: string[];
	/** 渲染好的完整 markdown */
	markdown: string;
}

/** harness_handoffs 表行 */
export interface HarnessHandoffRow {
	id: string;
	source_session_id: string;
	target_harness: string;
	package_md: string;
	status: string;
	pty_id: string | null;
	result_session_id: string | null;
	created_at: number;
	/**
	 * 实际使用的接力档位：native = 原生续接（无损）/ raw = 原文接力（无损）/
	 * distill = LLM 蒸馏（有损）。一期只有 distill，老记录该列为 null。
	 */
	mode: string | null;
	/** 导出的交换文件路径（走附件通道时有值） */
	payload_path: string | null;
	source_cwd: string | null;
}

/**
 * 接力方案预演结果。
 *
 * 在真正开始接力（可能要花钱调 LLM）之前先算出「会走哪一档、为什么」，
 * UI 据此如实告诉用户这次是无损还是有损。
 */
export interface HarnessHandoffPlan {
	mode: "native" | "raw" | "distill";
	/** 选这一档的原因，原样展示给用户 */
	reason: string;
	/** mode === native 时的完整启动命令 */
	resume_command: string | null;
	/** 参与判定的转录字符数 */
	transcript_chars: number;
	/** 该源会话是否具备原生续接条件（与最终选档无关，供 UI 提示） */
	native_available: boolean;
}

/** 跨入口调用（把别的入口当工具）的结果 */
export interface HarnessBridgeResult {
	ok: boolean;
	call_id: string;
	target: string;
	kind: "cli" | "web" | "app";
	/** 目标的回答；失败时为空串 */
	answer: string;
	error: string | null;
	duration_ms: number;
	/** true = 超时后返回了已产出的部分内容，answer 不完整 */
	partial: boolean;
}

/** harness_bridge_calls 表行（调用审计） */
export interface HarnessBridgeCallRow {
	id: string;
	caller: string;
	target: string;
	target_kind: string;
	prompt: string | null;
	cwd: string | null;
	response: string | null;
	status: string;
	error: string | null;
	duration_ms: number;
	created_at: number;
	finished_at: number | null;
}

/** 议会单路答案 */
export interface HarnessCouncilAnswerRow {
	id: string;
	harness: string;
	label: string;
	answer: string;
	/** succeeded / failed / timeout —— 失败分支如实保留，不静默丢弃 */
	status: string;
	error: string | null;
	duration_ms: number;
}

/** 议会运行记录 */
export interface HarnessCouncilRunRow {
	id: string;
	question: string;
	cwd: string | null;
	participants: string[];
	status: string;
	verdict: string | null;
	error: string | null;
	created_at: number;
	finished_at: number | null;
}

/** 共享白板条目 */
export interface HarnessBoardEntryRow {
	id: string;
	/** 作用域：工作目录绝对路径；空串 = 全局 */
	scope: string;
	/** goal / decision / pitfall / next / note */
	kind: string;
	content: string;
	author: string | null;
	session_id: string | null;
	state: string;
	created_at: number;
	updated_at: number;
}

/** 能力路由规则 */
export interface HarnessRouteRow {
	capability: string;
	label: string;
	/** 按优先级排列的入口 id */
	harnesses: string[];
	enabled: boolean;
	updated_at: number;
}

/** 路由候选及其可用性 */
export interface HarnessRouteCandidateRow {
	harness: string;
	label: string;
	kind: "cli" | "web" | "app";
	available: boolean;
	/** 不可用的原因，如实展示 */
	reason: string | null;
	blocked_by_quota: boolean;
}

/**
 * 入口额度状态。
 *
 * 只反映从**真实转录**里检测到的限额信号；没检测到就是全 null
 * （UI 应显示"未检测到"，而不是编造一个余额百分比）。
 */
export interface HarnessQuotaRow {
	harness: string;
	limit_hit_at: number | null;
	resets_at: number | null;
	/** 触发判定的原始文案片段，供用户自行判断是否误判 */
	evidence: string | null;
	manual_blocked: boolean;
	/** 综合判定：当前是否应避免派活 */
	blocked: boolean;
}

/** 反向 MCP Server 状态与接入信息 */
export interface HarnessMcpStatusRow {
	/** 服务是否已监听（端口被占时为 false） */
	running: boolean;
	/** 用户是否打开了开关（关闭时请求一律 503） */
	enabled: boolean;
	port: number | null;
	endpoint: string | null;
	token: string | null;
	/** 一键接入命令，用户复制到终端即可 */
	install_commands: { label: string; command: string }[];
	/** 暴露出去的工具清单 */
	tools: { name: string; summary: string }[];
}

/** AI Hub 可配置项 */
export interface HarnessHubSettingsRow {
	bridge_enabled: boolean;
	bridge_allow_write: boolean;
	bridge_cli_timeout_ms: number;
	bridge_web_timeout_ms: number;
	handoff_policy: "auto" | "native" | "raw" | "distill";
	auto_board_sync: boolean;
	/** 自动化总开关（关闭后定时任务不再触发，手动运行仍可用） */
	automation_enabled: boolean;
	/** 同时最多跑几个自动化任务 */
	automation_max_concurrent: number;
	/** 有任务在跑时阻止系统挂起应用 */
	automation_prevent_sleep: boolean;
	/** 电池供电时跳过定时触发 */
	automation_skip_on_battery: boolean;
	/** 多久没有输出算「卡死」（毫秒） */
	automation_stalled_threshold_ms: number;
	/** 新建任务默认的最大尝试次数 */
	automation_default_max_attempts: number;
	/** 任务失败 / 需人工介入时给系统通知 */
	automation_notify_on_failure: boolean;
}

// ============================================================
// AI Harness 自动化
// ============================================================

/** 执行体种类。 */
export type HarnessRuntimeKind = "pty" | "bridge" | "sdk";

/** 执行体状态。 */
export type HarnessRuntimeState =
	| "starting"
	| "working"
	| "idle"
	| "error"
	| "stalled"
	| "exited";

/** 失败类别，与主进程 automation/errors.ts 的 FailureKind 一一对应。 */
export type HarnessFailureKind =
	| "rate_limit"
	| "quota_exhausted"
	| "overloaded"
	| "network"
	| "auth"
	| "invalid_request"
	| "not_found"
	| "timeout"
	| "stalled"
	| "crash";

/** 失败判定结果。`evidence` 是命中的原文片段，UI 必须原样展示供用户自证。 */
export interface HarnessFailureSignalRow {
	kind: HarnessFailureKind;
	retryable: boolean;
	evidence: string;
	http_status: number | null;
	suggested_delay_ms: number;
}

/** 一个正在运行（或刚结束）的执行体。 */
export interface HarnessRuntimeRow {
	id: string;
	kind: HarnessRuntimeKind;
	harness: string;
	label: string;
	cwd: string | null;
	state: HarnessRuntimeState;
	failure: HarnessFailureSignalRow | null;
	job_run_id: string | null;
	pty_id: string | null;
	bridge_call_id: string | null;
	started_at: number;
	last_output_at: number;
	updated_at: number;
	exited_at: number | null;
	exit_code: number | null;
	/** 最近的输出尾巴，给用户看「它现在在干嘛」 */
	tail: string;
}

/** 任务触发方式。 */
export type HarnessJobTriggerRow =
	| { type: "manual" }
	| { type: "once"; at: number }
	/** weekdays 为空表示每天；0 = 周日 */
	| { type: "daily"; time: string; weekdays: number[] }
	| { type: "interval"; minutes: number };

/** 执行窗口（允许跨零点）。 */
export interface HarnessJobWindowRow {
	start: string;
	end: string;
}

/** 重试策略。 */
export interface HarnessJobRetryPolicyRow {
	/** 错过触发时刻的处理：skip = 只排下一次；runOnce = 补跑一次 */
	misfire: "skip" | "runOnce";
	backoff_cap_ms: number;
	/** 同一入口连续失败多少次后考虑换入口 */
	failover_after: number;
}

/** 自动化任务定义。 */
export interface HarnessJobRow {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	target_harness: string;
	/** headless = 后台子进程；pty = 可视终端，可随时接管 */
	exec_mode: "headless" | "pty";
	cwd: string | null;
	prompt: string;
	allow_write: boolean;
	trigger: HarnessJobTriggerRow;
	window: HarnessJobWindowRow | null;
	max_attempts: number;
	retry_policy: HarnessJobRetryPolicyRow;
	failover_enabled: boolean;
	timeout_ms: number | null;
	next_run_at: number | null;
	last_run_at: number | null;
	last_status: string | null;
	created_at: number;
	updated_at: number;
	/** 触发方式的人话描述（主进程渲染，避免前后端两套措辞） */
	trigger_label: string;
}

/**
 * 一次运行的状态。
 *
 * `succeeded` 的含义是**本轮无错误结束**，不是「任务已完成」——
 * 自动化只判定错误信号，不判定语义完成度。UI 文案必须与此一致。
 */
export type HarnessJobRunStatus =
	| "queued"
	| "running"
	| "waiting"
	| "succeeded"
	| "failed"
	| "blocked"
	| "cancelled";

/** 一次运行记录。 */
export interface HarnessJobRunRow {
	id: string;
	job_id: string;
	status: HarnessJobRunStatus;
	trigger: string;
	attempt_count: number;
	last_failure_kind: HarnessFailureKind | null;
	last_error: string | null;
	/** 处于 waiting 时的下次尝试时刻 */
	next_attempt_at: number | null;
	result_text: string | null;
	started_at: number;
	finished_at: number | null;
}

/** 一次尝试的明细。 */
export interface HarnessJobAttemptRow {
	id: string;
	run_id: string;
	seq: number;
	harness: string;
	mode: string;
	exit_code: number | null;
	failure_kind: HarnessFailureKind | null;
	/** 判定证据原文 */
	evidence: string | null;
	/** 非空表示这次是续接原生会话继续跑，而不是重发原指令 */
	resumed_from: string | null;
	bridge_call_id: string | null;
	pty_id: string | null;
	/** 这次失败后实际等待了多久 */
	wait_ms: number | null;
	output: string | null;
	started_at: number;
	finished_at: number | null;
}

/**
 * 保存任务的入参。
 *
 * 用 type alias 而非 interface：它会被直接当作 `invoke` 的 args 传下去，
 * 而 interface 没有隐式索引签名，赋给 `Record<string, unknown>` 会被拒。
 */
export type HarnessJobInputRow = {
	id?: string | null;
	name: string;
	description?: string | null;
	enabled?: boolean;
	target_harness: string;
	exec_mode?: "headless" | "pty";
	cwd?: string | null;
	prompt: string;
	allow_write?: boolean;
	trigger: HarnessJobTriggerRow;
	window?: HarnessJobWindowRow | null;
	max_attempts?: number;
	retry_policy?: Partial<HarnessJobRetryPolicyRow>;
	failover_enabled?: boolean;
	timeout_ms?: number | null;
};

/** AI Hub 站点配置行 */
export interface AiHubSiteRow {
	id: string;
	harness: string;
	label: string;
	url: string;
	/** 输入框选择器候选，按序尝试 */
	input_selectors: string[];
	/** 发送按钮选择器候选 */
	submit_selectors: string[];
	/** 对话消息节点选择器候选 */
	message_selectors: string[];
	/** 内置站点不可删除，只能禁用 */
	builtin: boolean;
	enabled: boolean;
}
