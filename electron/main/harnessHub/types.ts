/**
 * AI Harness Hub —— canonical 类型定义（跨 harness 会话资产互通的公共契约）。
 *
 * 设计要点：所有 adapter 把各自 harness 的原生格式归一到这里定义的
 * CanonicalSession / CanonicalMessage，之后的检索、蒸馏、注入都只认这套类型，
 * 不再关心来源格式。新增一个 harness = 新增一个 adapter 文件，其余层零改动。
 */

/** 支持的 AI 入口种类。web-* 为内嵌 Web 站点，ipo-sdk 为本应用自己的 Agent SDK。 */
export type HarnessKind =
	| "claude-code"
	| "codex"
	| "gemini-cli"
	| "opencode"
	| "ipo-sdk"
	| "web-chatgpt"
	| "web-gemini"
	| "web-kimi"
	| "web-doubao"
	| "web-glm"
	| "web-deepseek";

/** 规范化角色。工具调用/结果统一并入 assistant/user 的 blocks，不单列角色。 */
export type CanonicalRole = "user" | "assistant" | "system";

/**
 * 规范化的内容块。保留原始语义（思考 / 工具调用 / 工具结果），
 * 供 UI 展示与蒸馏时的重要性加权使用。
 */
export type CanonicalBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; text: string }
	| { type: "tool_use"; name: string; input?: unknown; id?: string }
	| { type: "tool_result"; output: string; id?: string; isError?: boolean };

/** 规范化的单条消息。 */
export interface CanonicalMessage {
	/** 会话内稳定 id（优先用原生 uuid，缺失时用 `<sessionId>:<seq>` 兜底） */
	id: string;
	role: CanonicalRole;
	/** 扁平化纯文本（用于 FTS 检索与蒸馏输入） */
	content: string;
	/** 原始结构化块；为空表示纯文本消息 */
	blocks?: CanonicalBlock[];
	/** 会话内顺序号，从 0 递增 */
	seq: number;
	createdAt: number;
}

/** 规范化的会话元数据。 */
export interface CanonicalSession {
	/** 本地主键：`<harness>:<externalId>`，保证跨 harness 不撞 id */
	id: string;
	harness: HarnessKind;
	/** 原生会话 id（claude-code 的 sessionId / codex 的 payload.id） */
	externalId: string;
	cwd: string | null;
	title: string | null;
	summary: string | null;
	/** active = 文件仍在追加写；idle = 一段时间无变化 */
	status: "active" | "idle" | "unknown";
	/** 来源 JSONL 绝对路径；ipo-sdk / web 来源为 null */
	originPath: string | null;
	/** 已摄取到的字节位置，增量续读用 */
	byteOffset: number;
	messageCount: number;
	tokenEstimate: number;
	/** 装不下的字段：model / gitBranch / cliVersion / provider 等 */
	meta: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

/** adapter 增量解析单个来源文件的产物。 */
export interface AdapterParseResult {
	session: CanonicalSession;
	/** 本次新增的消息（增量解析时只含新增部分） */
	messages: CanonicalMessage[];
	/** 解析失败被跳过的行数（防御式解析的可观测性） */
	skippedLines: number;
	/**
	 * 本次是「不连续的重读」（文件被截断/重写，或超大文件只读了尾部）。
	 * 摄取层据此先清空该会话已有消息，再写入本次结果。
	 */
	restarted?: boolean;
}

/** 单个 harness 的探测结果。 */
export interface HarnessDetection {
	harness: HarnessKind;
	/** 展示名（"Claude Code"） */
	label: string;
	/** 是否检测到（CLI 可执行文件或会话目录存在） */
	installed: boolean;
	/** CLI 可执行文件绝对路径 */
	binPath: string | null;
	/** 会话目录绝对路径 */
	sessionDir: string | null;
	/** 能否读取历史会话（adapter 已实现且目录存在） */
	canRead: boolean;
	/** 能否被注入（App 内 pty 启动该 CLI） */
	canInject: boolean;
	/** 在 pty 中启动该 CLI 的命令（渲染端「中栏开 CLI 标签页」要用） */
	launchCommand: string;
	/** 已摄取的会话数 */
	sessionCount: number;
}

/** 内嵌 Web AI 站点配置。selector 做成数据而非硬编码，DOM 变化时用户可自行修正。 */
export interface WebSiteConfig {
	id: string;
	/**
	 * 该站点会话在 canonical 表里的 harness 标识。
	 * 内置站点取 HarnessKind 里的 `web-*`；用户自定义站点为 `web-<id>`，
	 * 故这里放宽为 string（自定义站点不可能穷举进联合类型）。
	 */
	harness: HarnessKind | (string & {});
	label: string;
	url: string;
	/** 输入框选择器候选列表，按序尝试，全部失败则降级剪贴板 */
	inputSelectors: string[];
	/** 发送按钮选择器候选（可空 —— 空则只填入不自动发送） */
	submitSelectors: string[];
	/** 对话消息节点选择器候选，用于提取 */
	messageSelectors: string[];
	/**
	 * 登录态还依赖哪些**额外**的注册域。
	 *
	 * 导入本机浏览器登录态时，默认只搬 `url` 自身的注册域及其子域。但不少站点
	 * 把会话拆在别的域上——ChatGPT 的 `unified_session_manifest` / `usc_*` /
	 * `oai-sc` 全挂在 `.auth.openai.com` 与 `.openai.com`，只搬 `chatgpt.com`
	 * 会拿到半套 cookie，页面照样是未登录。
	 *
	 * 这里必须**显式声明**而不是隐式放宽：写进来的每个域都会被整域搬运，
	 * 是有意扩大的安全边界，加之前要确认它确实承载该站点的登录态。
	 */
	authDomains?: string[];
	/** 是否内置（内置站点不可删除，只能禁用） */
	builtin: boolean;
	enabled: boolean;
}

/** 蒸馏产出的 HANDOFF 上下文包（结构化，便于 UI 分段展示与编辑）。 */
export interface HandoffPackage {
	/** 任务目标 */
	goal: string;
	/** 已完成 */
	done: string[];
	/** 进行中 */
	inProgress: string[];
	/** 关键决策与踩坑 */
	decisions: string[];
	/** 涉及文件 */
	files: string[];
	/** 下一步 */
	nextSteps: string[];
	/** 渲染好的完整 markdown（写入 HANDOFF.md / 粘贴到 Web 端用） */
	markdown: string;
}

/**
 * 接力档位。
 *
 * 一期只有 `distill` 一条路——同 harness 内续接也要过一遍 LLM，既慢又有损。
 * 二期改为按情况自动选档（见 `rawHandoff.pickHandoffMode`）：
 *
 * - `native`  原生续接：`claude --resume <id>` / `codex resume <id>`。零成本、完全无损。
 * - `raw`     原文接力：直接把转录渲染成交接包，零 LLM 调用。无损（可能尾部截断）。
 * - `distill` 蒸馏接力：map-reduce 压缩。有损，只在超长会话时用。
 */
export type HandoffMode = "native" | "raw" | "distill";

/** 选档结果。`reason` 会如实展示给用户——不能让人以为无损的其实被蒸馏过。 */
export interface HandoffModeDecision {
	mode: HandoffMode;
	reason: string;
	/** mode === "native" 时的完整启动命令 */
	resumeCommand?: string;
	/** 参与判定的转录字符数 */
	transcriptChars: number;
}

/** 被当作工具调用的目标种类。 */
export type BridgeTargetKind = "cli" | "web" | "app";

/** 一次「把某入口当工具调用」的请求。 */
export interface BridgeCallRequest {
	/** 目标 harness id（cli 用 HarnessKind，web 用站点 id 对应的 harness） */
	target: string;
	kind: BridgeTargetKind;
	prompt: string;
	/** CLI 目标的工作目录 */
	cwd?: string;
	/** 超时毫秒；不传走各类型默认值 */
	timeoutMs?: number;
	/** 发起方标识，用于审计（ipo-sdk / external:<name> / …） */
	caller?: string;
}

/** 一次桥接调用的结果。失败时 `ok=false` 且 `error` 必填，不返回假答案。 */
export interface BridgeCallResult {
	ok: boolean;
	callId: string;
	target: string;
	kind: BridgeTargetKind;
	/** 目标的回答；失败时为空串 */
	answer: string;
	error: string | null;
	durationMs: number;
	/** true = 超时后返回了「已产出的部分内容」，answer 不完整 */
	partial: boolean;
	/**
	 * 子进程退出码（仅 cli 目标，未知为 null）。
	 * 自动化守护要靠它 + rawOutput 做失败分类，`ok` 这个布尔量粒度不够——
	 * 「失败了」和「因为 429 失败、二十分钟后该重试」是两件事。
	 */
	exitCode?: number | null;
	/** stdout + stderr 原文（仅 cli 目标），交给失败分类器判定 */
	rawOutput?: string;
}

/** 共享白板条目类型。 */
export type BoardEntryKind = "goal" | "decision" | "pitfall" | "next" | "note";

/** 共享白板条目。 */
export interface BoardEntry {
	id: string;
	/** 作用域：工作目录绝对路径；空串 = 全局白板 */
	scope: string;
	kind: BoardEntryKind;
	content: string;
	author: string | null;
	sessionId: string | null;
	state: "open" | "done";
	createdAt: number;
	updatedAt: number;
}

/** 能力路由规则：某类任务优先派给哪些入口。 */
export interface RouteRule {
	capability: string;
	label: string;
	/** 按优先级排列的 harness id */
	harnesses: string[];
	enabled: boolean;
	updatedAt: number;
}

/**
 * 单个入口的额度状态。
 *
 * 只反映**从真实转录里检测到的**限额信号。检测不到就是 `unknown`——
 * 不外推剩余额度、不按用量猜测，宁可少报也不编造。
 */
export interface QuotaState {
	harness: string;
	/** null = 从未检测到限额信号 */
	limitHitAt: number | null;
	/** 从提示文案里解析出的恢复时间；解析不出就是 null */
	resetsAt: number | null;
	/** 触发判定的原始文案片段 */
	evidence: string | null;
	/** 用户手动标记不可用 */
	manualBlocked: boolean;
	/** 综合判定：当前是否应当避免派活给它 */
	blocked: boolean;
}

/** `.aihub-session.json` 交换文档。一个文件即完整上下文。 */
export interface ExchangeDocument {
	format: "aihub-session";
	version: 1;
	exportedAt: number;
	source: {
		harness: string;
		sessionId: string;
		externalId: string | null;
		cwd: string | null;
		title: string | null;
		messageCount: number;
	};
	messages: {
		role: CanonicalRole;
		content: string;
		blocks?: CanonicalBlock[];
		createdAt: number;
	}[];
	/** 附带的交接包（可空——纯转录导出时没有） */
	handoff: Omit<HandoffPackage, "markdown"> | null;
}
