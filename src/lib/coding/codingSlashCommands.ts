import type {
	BackendCapabilityMatrix,
	CodingApprovalMode,
	CodingBackendId,
} from "../../../electron/shared/coding-workspace";
import type { CodingThread } from "../stores/codingThreadTypes";

export type SlashCommandCategory =
	| "session"
	| "runtime"
	| "context"
	| "inspect"
	| "workspace";

export interface SlashCommandContext {
	thread: CodingThread | null;
	currentBackend: CodingBackendId;
	capabilities: Record<CodingBackendId, BackendCapabilityMatrix | null>;
	isRunning: boolean;
	projectPath: string | null;
}

export interface SlashCommandOption {
	id: string;
	label: string;
	description: string;
	value: string;
	actionId: string;
	disabledReason?: string;
}

export interface CodingSlashCommand {
	id: string;
	name: string;
	description: string;
	category: SlashCommandCategory;
	type: "action" | "prompt" | "submenu";
	actionId?: string;
	prompt?: string;
	/** 限定命令可用的后端；为空或 undefined 表示所有后端 */
	backends?: CodingBackendId[];
	getOptions?: (context: SlashCommandContext) => SlashCommandOption[];
	getDisabledReason?: (context: SlashCommandContext) => string | undefined;
}

function getOptionScore(option: SlashCommandOption, query: string): number {
	const q = query.toLowerCase().trim();
	if (!q) return 0;
	const fields = [option.id, option.label, option.description, option.value].map((value) =>
		value.toLowerCase(),
	);
	if (fields[0] === q) return 100;
	if (fields[0].startsWith(q)) return 80;
	if (fields[1].startsWith(q)) return 70;
	if (fields[3].startsWith(q)) return 60;
	if (fields[0].includes(q) || fields[1].includes(q) || fields[3].includes(q)) return 40;
	if (fields[2].includes(q)) return 10;
	return -1;
}

const CLAUDE_APPROVAL_OPTIONS: Array<{ value: CodingApprovalMode; label: string; description: string }> = [
	{ value: "default", label: "default", description: "遵循 Claude 默认权限策略" },
	{ value: "acceptEdits", label: "acceptEdits", description: "允许文件修改，命令仍受控" },
	{ value: "dontAsk", label: "dontAsk", description: "尽量减少运行前确认" },
	{ value: "plan", label: "plan", description: "只读规划模式" },
	{ value: "bypassPermissions", label: "bypassPermissions", description: "绕过权限确认，仅适合隔离环境" },
];

const CODEX_APPROVAL_OPTIONS: Array<{ value: CodingApprovalMode; label: string; description: string }> = [
	{ value: "untrusted", label: "untrusted", description: "仅对白名单命令免审批" },
	{ value: "on-request", label: "on-request", description: "运行时按需请求批准" },
	{ value: "never", label: "never", description: "不再请求批准，失败直接返回" },
	{ value: "on-failure", label: "on-failure", description: "失败时再请求批准（兼容旧策略）" },
];

export const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
	session: "会话",
	runtime: "运行时",
	context: "上下文",
	inspect: "检查",
	workspace: "工作区",
};

function getCommandScore(command: CodingSlashCommand, query: string): number {
	const q = query.toLowerCase().trim();
	if (!q) return 0;
	const fields = [command.id, command.name, command.description].map((value) =>
		value.toLowerCase(),
	);
	if (fields[0] === q) return 100;
	if (fields[0].startsWith(q)) return 80;
	if (fields[1].startsWith(q)) return 70;
	if (fields[0].includes(q)) return 50;
	if (fields[1].includes(q)) return 30;
	if (fields[2].includes(q)) return 10;
	return -1;
}

function getRuntimeCapability(
	context: SlashCommandContext,
	backend = context.currentBackend,
) {
	return context.capabilities[backend];
}

function getSubmenuCommandDisabledReason(
	context: SlashCommandContext,
): string | undefined {
	if (!context.thread) return "请先进入一个线程。";
	return undefined;
}

export const codingSlashCommands: CodingSlashCommand[] = [
	{
		id: "clear",
		name: "清空会话",
		description: "清空当前线程的会话消息，但保留线程累计 diff。",
		category: "session",
		type: "action",
		actionId: "clear_conversation",
		getDisabledReason: (context) => (!context.thread ? "请先进入一个线程。" : undefined),
	},
	{
		id: "compact",
		name: "压缩上下文",
		description: "让当前后端主动总结当前上下文。",
		category: "session",
		type: "prompt",
		prompt: "请基于当前线程内容压缩上下文，只保留后续继续开发必须的信息。",
		getDisabledReason: (context) => (!context.thread ? "请先进入一个线程。" : undefined),
	},
	{
		id: "resume",
		name: "恢复会话",
		description: "恢复当前线程绑定的后端会话 ID。",
		category: "session",
		type: "action",
		actionId: "resume_session",
		getDisabledReason: (context) => {
			if (!context.thread) return "请先进入一个线程。";
			const capability = getRuntimeCapability(context);
			if (!capability?.capabilities.resume) {
				return capability?.unsupportedReasons?.resume || "当前后端不支持 resume。";
			}
			if (!context.thread.sdkSessionId && !context.thread.runtimeSessionId) {
				return "当前线程还没有可恢复的会话 ID。";
			}
			return undefined;
		},
	},
	{
		id: "rewind",
		name: "回退运行",
		description: "回退到历史运行转折点。",
		category: "session",
		type: "action",
		backends: ["claude-code"],
		getDisabledReason: (context) => {
			const capability = getRuntimeCapability(context);
			return capability?.unsupportedReasons?.rewind || "当前版本暂不支持 rewind。";
		},
	},
	{
		id: "model",
		name: "切换模型",
		description: "为当前线程切换真实模型，并同步项目默认值。",
		category: "runtime",
		type: "submenu",
		getOptions: (context) => {
			const capability = getRuntimeCapability(context);
			const models = capability?.modelCatalog ?? [];
			return models.map((model) => ({
				id: model,
				label: model,
				description: context.thread?.model === model ? "当前线程正在使用该模型" : "切换到该模型",
				value: model,
				actionId: "set_model",
				disabledReason:
					context.isRunning && !capability?.capabilities.setModelWhileRunning
						? capability?.unsupportedReasons?.setModelWhileRunning || "当前运行中不能切换模型。"
						: undefined,
			}));
		},
		getDisabledReason: getSubmenuCommandDisabledReason,
	},
	{
		id: "backend",
		name: "切换后端",
		description: "在 Claude Code 与 Codex 之间切换真实执行链路。",
		category: "runtime",
		type: "submenu",
		getOptions: (context) => {
			const entries: Array<{ backend: CodingBackendId; label: string; description: string }> = [
				{ backend: "claude-code", label: "Claude Code", description: "Agent SDK + Claude Code CLI" },
				{ backend: "codex", label: "Codex", description: "Codex CLI exec / resume JSON 事件流" },
			];
			return entries.map((entry) => {
				const capability = context.capabilities[entry.backend];
				return {
					id: entry.backend,
					label: entry.label,
					description: capability?.available ? entry.description : capability?.error || "未检测到后端",
					value: entry.backend,
					actionId: "set_backend",
					disabledReason: !capability?.available
						? capability?.error || "当前环境不可用。"
						: context.isRunning
							? "请先结束当前运行，再切换后端。"
							: undefined,
				};
			});
		},
		getDisabledReason: getSubmenuCommandDisabledReason,
	},
	{
		id: "approvals",
		name: "切换审批模式",
		description: "切换后端真实权限 / 审批策略，并同步项目默认值。",
		category: "runtime",
		type: "submenu",
		getOptions: (context) => {
			const capability = getRuntimeCapability(context);
			const options = context.currentBackend === "codex" ? CODEX_APPROVAL_OPTIONS : CLAUDE_APPROVAL_OPTIONS;
			return options.map((option) => ({
				id: option.value,
				label: option.label,
				description: option.description,
				value: option.value,
				actionId: "set_approval_mode",
				disabledReason:
					context.isRunning && !capability?.capabilities.interactiveApproval && context.currentBackend === "codex"
						? capability?.unsupportedReasons?.interactiveApproval || "当前后端运行中无法切换审批模式。"
						: undefined,
			}));
		},
		getDisabledReason: getSubmenuCommandDisabledReason,
	},
	{
		id: "mode",
		name: "切换模式",
		description: "在 Code / Plan / Ask 之间切换。",
		category: "runtime",
		type: "submenu",
		getOptions: () => [
			{ id: "code", label: "Code", description: "自主编码", value: "code", actionId: "set_mode" },
			{ id: "plan", label: "Plan", description: "先规划再执行", value: "plan", actionId: "set_mode" },
			{ id: "ask", label: "Ask", description: "只分析与回答", value: "ask", actionId: "set_mode" },
		],
		getDisabledReason: getSubmenuCommandDisabledReason,
	},
		{
			id: "context",
			name: "查看上下文",
			description: "打开上下文面板，检查当前附加文件、workspace 指令源与 token 使用。",
			category: "inspect",
			type: "action",
			actionId: "open_context_panel",
			getDisabledReason: (context) => (!context.projectPath ? "请先打开一个项目。" : undefined),
		},
		{
			id: "add-file",
			name: "附加文件",
			description: "选择文件加入当前线程上下文。",
			category: "context",
			type: "action",
			actionId: "pick_context_files",
			getDisabledReason: (context) => (!context.projectPath ? "请先打开一个项目。" : undefined),
		},
	{
		id: "memory",
		name: "查看记忆",
		description: "查看当前项目 workspace / memory / rules。",
		category: "workspace",
		type: "action",
		actionId: "open_memory_panel",
		getDisabledReason: (context) => (!context.projectPath ? "请先打开一个项目。" : undefined),
	},
	{
		id: "diff",
		name: "查看变更",
		description: "让当前后端基于真实仓库状态汇总 diff。",
		category: "inspect",
		type: "prompt",
		prompt: "请基于当前仓库的真实 git diff 总结本线程已产生的改动，并指出潜在风险。",
		getDisabledReason: (context) => (!context.thread ? "请先进入一个线程。" : undefined),
	},
	{
		id: "status",
		name: "查看运行状态",
		description: "打开工具活动面板，查看当前线程的真实运行轨迹。",
		category: "inspect",
		type: "action",
		actionId: "open_activity_panel",
		getDisabledReason: (context) => (!context.thread ? "请先进入一个线程。" : undefined),
	},
	{
		id: "settings",
		name: "打开设置",
		description: "打开 AI 编程相关设置。",
		category: "workspace",
		type: "action",
		actionId: "open_settings",
	},
];

export function filterSlashCommands(
	query: string,
	_context: SlashCommandContext,
): CodingSlashCommand[] {
	const q = query.toLowerCase().replace(/^\//, "").trim();
	const currentBackend = _context.currentBackend;
	return codingSlashCommands
		.filter((command) => {
			// 按后端过滤
			if (command.backends && command.backends.length > 0) {
				if (!command.backends.includes(currentBackend)) return false;
			}
			return true;
		})
		.map((command) => ({ command, score: getCommandScore(command, q) }))
		.filter((entry) => (q ? entry.score >= 0 : true))
		.sort((a, b) => b.score - a.score || a.command.id.localeCompare(b.command.id, "zh-CN"))
		.map((entry) => ({
			...entry.command,
			getDisabledReason: entry.command.getDisabledReason,
		}));
}

export function getSlashCommandById(commandId: string): CodingSlashCommand | null {
	return codingSlashCommands.find((command) => command.id === commandId) ?? null;
}

export function getSlashCommandDisabledReason(
	command: CodingSlashCommand,
	context: SlashCommandContext,
): string | undefined {
	return command.getDisabledReason?.(context);
}

export function getSlashCommandOptions(
	command: CodingSlashCommand,
	context: SlashCommandContext,
): SlashCommandOption[] {
	return command.getOptions?.(context) ?? [];
}

export function filterSlashCommandOptions(
	options: SlashCommandOption[],
	query: string,
): SlashCommandOption[] {
	const q = query.trim().toLowerCase();
	return options
		.map((option) => ({ option, score: getOptionScore(option, q) }))
		.filter((entry) => (q ? entry.score >= 0 : true))
		.sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label, "zh-CN"))
		.map((entry) => entry.option);
}
