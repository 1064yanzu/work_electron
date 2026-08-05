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
