/**
 * `sdk.query({ options })` 的装配层。
 *
 * 从 `agent_sdk_start` 外提出来的纯装配逻辑：工具白名单、settingSources、
 * MCP 服务集合、system prompt 追加段、子进程环境变量、additionalDirectories。
 *
 * 这里的函数刻意做成**无副作用的纯函数**（唯一例外是 `buildMcpServers`，
 * 它要实例化 in-process MCP server 对象）。好处是这些决策可以脱离 Electron
 * 主进程单测，也让 `agent_sdk_start` 的主流程只剩"读输入 → 装配 → 起流"。
 */
import { uniqStrings } from "./configManager";
import { HARNESS_BRIDGE_PROMPT } from "./harnessBridgeMcp";
import { LOCAL_WEB_SEARCH_MCP_TOOL } from "./localWebSearchMcp";
import type { ThinkingLevel } from "./configManager";

/** `buildMultiAgentRuntime()` 的返回值里本模块真正用到的字段。 */
export interface MultiAgentRuntimeLike {
	experimentalEnabled: boolean;
	multiAgentMode: string;
}

/**
 * 计算这次 run 的工具白名单。
 *
 * 关键点是 `hasExplicitAllowedTools`：只有调用方**显式传了数组**才进入裁剪分支。
 * `undefined` / `null` / 非数组都走 SDK 的 `claude_code` preset 全工具集——
 * 那是让 agent 接近 Claude Code 原生体验的关键路径，不能被"默认空数组"悄悄改掉。
 */
export function resolveAllowedTools(options: {
	rawAllowedTools: unknown;
	/** 交互审批开启时必须把 AskUserQuestion 加进白名单，否则弹卡工具本身被裁掉。 */
	interactiveApproval: boolean;
	multiAgentRuntime: MultiAgentRuntimeLike;
}): { hasExplicitAllowedTools: boolean; allowedToolsForRun: string[] } {
	const hasExplicitAllowedTools = Array.isArray(options.rawAllowedTools);
	const allowedRaw = hasExplicitAllowedTools
		? (options.rawAllowedTools as string[])
		: [];
	const allowed = uniqStrings(
		options.interactiveApproval
			? [...allowedRaw, "AskUserQuestion"]
			: [...allowedRaw],
	);

	const includeTeammate =
		options.multiAgentRuntime.experimentalEnabled &&
		options.multiAgentRuntime.multiAgentMode !== "subagent_only";
	const allowedToolsForRun = uniqStrings(
		includeTeammate
			? [...allowed, "Teammate", LOCAL_WEB_SEARCH_MCP_TOOL]
			: [...allowed, LOCAL_WEB_SEARCH_MCP_TOOL],
	);

	return { hasExplicitAllowedTools, allowedToolsForRun };
}

/** `input.sandbox` 只在是对象时才透传给 SDK，其余一律视为未配置。 */
export function normalizeSandboxSettings(
	value: unknown,
): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

/**
 * additionalDirectories 终值。
 *
 * wiki scope 目录必须并进来：SDK 的文件工具只在 cwd + additionalDirectories
 * 里解析相对路径，漏了它读 raw sources 会直接因路径解析失败被拒。
 */
export function resolveAdditionalDirectories(
	additionalDirectories: string[],
	wikiScopePath?: string,
): string[] | undefined {
	const dirs = [...additionalDirectories];
	if (wikiScopePath && !dirs.includes(wikiScopePath)) {
		dirs.push(wikiScopePath);
	}
	return dirs.length > 0 ? dirs : undefined;
}

/**
 * 组装这次 run 的 MCP 服务集合。
 *
 * 三个内建服务（本地搜索 / 长期记忆 / 跨入口桥接）与调用方传入的
 * `mcp_servers` 合并；同名时内建的优先，避免外部配置把内建能力顶掉。
 */
export function buildMcpServers(params: {
	sdk: any;
	db: unknown;
	inputMcpServers?: Record<string, unknown>;
	harnessBridgeEnabled: boolean;
	createLocalWebSearchMcpServer: (sdk: any) => unknown;
	createMemoryMcpServer: (sdk: any) => unknown;
	createHarnessBridgeMcpServer: (sdk: any, db: any) => unknown;
}): Record<string, unknown> {
	return {
		...(params.inputMcpServers || {}),
		ipo_browser_search: params.createLocalWebSearchMcpServer(params.sdk),
		ipo_agent_memory: params.createMemoryMcpServer(params.sdk),
		...(params.harnessBridgeEnabled
			? {
					ipo_harness_bridge: params.createHarnessBridgeMcpServer(
						params.sdk,
						params.db,
					),
				}
			: {}),
	};
}

const LOCAL_WEB_SEARCH_PROMPT = [
	"联网搜索说明：本应用已提供本地 MCP 搜索工具",
	`${LOCAL_WEB_SEARCH_MCP_TOOL}。`,
	"需要实时联网搜索时优先调用该工具，它会返回真实 URL 和摘要。",
	"不要调用内置 WebSearch；如果看到 WebSearch 不可用或没有搜索工具的文本，不要把它当作搜索结果。",
].join(" ");

const MEMORY_TOOL_PROMPT = [
	"长期记忆工具说明：本应用提供 mcp__ipo_agent_memory__memory 工具，用于显式管理你的长期记忆。",
	"当用户明确要求「记住」某事、或者你判断某条信息对未来会话有长期价值时，调用该工具的 add/replace/remove 动作写入 user 或 memory 文件。",
	"不要把一次性任务结果、当前对话临时状态写入记忆。SOUL 文件由用户独占编辑，工具不可写。",
].join(" ");

/**
 * system prompt 的 append 段。
 *
 * 注意这里**不重复注入 CLAUDE.md**：`CLAUDE_CONFIG_DIR` 已指向 ~/.claude，
 * SDK 会通过 settingSources 自行加载 user / project 级 CLAUDE.md。这里只追加
 * 本应用独有的内容（记忆三件套、风格档案、内建工具说明、思考档位标记）。
 */
export function buildSystemPromptAppend(params: {
	memorySection: string;
	userSystemPrompt: string;
	activeStylePrompt: string;
	harnessBridgeEnabled: boolean;
	thinkingLevel?: ThinkingLevel;
}): string {
	const thinkingLevelMarker = params.thinkingLevel
		? `<!-- ipo-thinking-level:${params.thinkingLevel} -->`
		: "";
	return [
		params.memorySection,
		params.userSystemPrompt,
		params.activeStylePrompt,
		LOCAL_WEB_SEARCH_PROMPT,
		MEMORY_TOOL_PROMPT,
		params.harnessBridgeEnabled ? HARNESS_BRIDGE_PROMPT : "",
		thinkingLevelMarker,
	]
		.filter((s) => s && s.trim().length > 0)
		.join("\n\n");
}

/**
 * Claude Code 子进程的环境变量。
 *
 * 两件事必须做对：
 *
 * 1. **清掉继承来的账号态**（OAuth token / session token / 各种 fd 传递）。
 *    留着它们，CLI 会绕过本地代理直连 Anthropic，用户配置的 provider 形同虚设。
 * 2. **`ANTHROPIC_BASE_URL` 不能带 `/v1`**。CLI 内部会自己拼 `/v1/messages`，
 *    带了就变成 `/v1/v1/messages`。
 *
 * `ANTHROPIC_API_KEY` 下发的是本地代理的鉴权 token（代理已强制鉴权），
 * 不是用户的真 key —— 真 key 只在主进程内、由代理按 provider 配置注入上游。
 */
export function buildSdkEnv(params: {
	resolvedPath?: string | null;
	claudeConfigDir: string;
	anthropicBaseUrl: string;
	anthropicApiKey: string;
	enableToolSearch: string;
}): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") env[k] = v;
	}

	if (params.resolvedPath) env.PATH = params.resolvedPath;

	delete env.ANTHROPIC_AUTH_TOKEN;
	delete env.CLAUDE_CODE_OAUTH_TOKEN;
	delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
	delete env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
	delete env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR;
	delete env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;

	env.CLAUDE_CONFIG_DIR = params.claudeConfigDir;
	env.ANTHROPIC_BASE_URL = params.anthropicBaseUrl;
	env.ANTHROPIC_API_KEY = params.anthropicApiKey;
	// 部分 CLI 代码路径读的是这个名字。
	env.CLAUDE_CODE_API_BASE_URL = params.anthropicBaseUrl;

	// 调试期降噪。
	env.DISABLE_TELEMETRY = "1";
	env.DISABLE_ERROR_REPORTING = "1";
	env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
	env.ENABLE_TOOL_SEARCH = params.enableToolSearch;

	return env;
}
