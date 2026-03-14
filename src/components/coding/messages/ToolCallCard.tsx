/**
 * 通用工具调用卡片 - 按 toolName 分发到子组件
 *
 * 关键设计：Claude Code CLI 返回的工具名是 API 原始名称（如 exec_command、
 * file_editor、text_editor_20250124），需要先通过 normalizeToolName() 映射
 * 为内部统一名称（Bash、Edit、Read 等），再分发到对应的专用卡片组件。
 */
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { AgentToolCard } from "./AgentToolCard";
import { AskUserQuestionCard } from "./AskUserQuestionCard";
import { BashToolCard } from "./BashToolCard";
import { CodexFileChangeCard } from "./CodexFileChangeCard";
import { CodexTodoListCard } from "./CodexTodoListCard";
import { CodexWebSearchCard } from "./CodexWebSearchCard";
import { FileToolCard } from "./FileToolCard";
import { SearchToolCard } from "./SearchToolCard";
import { WebToolCard } from "./WebToolCard";
import { Wrench, Plug } from "lucide-react";
import { useMemo } from "react";
import { ToolCardShell } from "./shared/ToolCardShell";

interface ToolCallCardProps {
	toolCall: SessionToolCall;
	onAskUserAnswer?: (
		requestId: string,
		answers: Record<string, string>,
	) => void;
}

// ─── Claude Code CLI 工具名 → 内部统一名称映射 ────────────────────

/**
 * Claude Code CLI / API 使用的原始工具名 → 我们的内部标准名称
 * 这是确保所有 Claude Code 工具调用被正确路由到专用卡片的关键映射表
 */
const TOOL_NAME_ALIASES: Record<string, string> = {
	// Bash / 命令执行
	"exec_command": "Bash",
	"bash": "Bash",
	"execute_command": "Bash",
	"run_command": "Bash",
	"shell": "Bash",
	"terminal": "Bash",

	// stdin 写入 → 也当作 Bash 展示
	"write_stdin": "Bash",

	// 文件读取
	"read_file": "Read",
	"file_read": "Read",
	"read": "Read",
	"View": "Read",
	"view_file": "Read",
	"cat_file": "Read",

	// 文件编辑
	"file_editor": "Edit",
	"text_editor": "Edit",
	"str_replace_editor": "Edit",
	"edit_file": "Edit",
	"file_edit": "Edit",
	"apply_diff": "Edit",
	"replace_in_file": "Edit",
	"insert_code_in_file": "Edit",

	// text_editor 带版本号的变体
	"text_editor_20250124": "Edit",
	"text_editor_20241022": "Edit",

	// 文件写入
	"write_file": "Write",
	"create_file": "Write",
	"file_write": "Write",
	"save_file": "Write",

	// 文件补丁
	"patch": "Patch",
	"apply_patch": "Patch",
	"file_patch": "Patch",

	// 多文件编辑
	"multi_edit": "MultiEdit",
	"batch_edit": "MultiEdit",

	// 搜索
	"glob": "Glob",
	"find_files": "Glob",
	"list_files": "Glob",
	"file_search": "Glob",
	"list_directory": "Glob",
	"grep": "Grep",
	"search": "Grep",
	"ripgrep": "Grep",
	"search_files": "Grep",

	// Web
	"web_search": "WebSearch",
	"WebSearch": "WebSearch",
	"web_fetch": "WebFetch",
	"fetch_url": "WebFetch",
	"WebFetch": "WebFetch",

	// Agent
	"dispatch_agent": "Agent",
	"spawn_agent": "Agent",
	"Agent": "Agent",

	// 用户交互
	"ask_user": "AskUserQuestion",
	"AskUserQuestion": "AskUserQuestion",

	// Codex 特有
	"FileChange": "FileChange",
	"TodoList": "TodoList",
	"update_plan": "TodoList",
};

/**
 * 标准化工具名：先查映射表，再尝试去掉版本号后缀后查映射
 */
function normalizeToolName(rawName: string): string {
	// 直接匹配
	if (TOOL_NAME_ALIASES[rawName]) return TOOL_NAME_ALIASES[rawName];

	// 小写匹配
	const lower = rawName.toLowerCase();
	for (const [alias, normalized] of Object.entries(TOOL_NAME_ALIASES)) {
		if (alias.toLowerCase() === lower) return normalized;
	}

	// 去掉版本号后缀（如 text_editor_20250124 → text_editor）
	const withoutVersion = rawName.replace(/_\d{8,}$/, "");
	if (withoutVersion !== rawName && TOOL_NAME_ALIASES[withoutVersion]) {
		return TOOL_NAME_ALIASES[withoutVersion];
	}

	// 智能推断：包含关键词
	if (lower.includes("bash") || lower.includes("exec") || lower.includes("command") || lower.includes("shell")) {
		return "Bash";
	}
	if (lower.includes("read") || lower.includes("view") || lower.includes("cat")) {
		return "Read";
	}
	if (lower.includes("edit") || lower.includes("replace") || lower.includes("str_replace")) {
		return "Edit";
	}
	if (lower.includes("write") || lower.includes("create") || lower.includes("save")) {
		return "Write";
	}
	if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) {
		return "Grep";
	}

	return rawName;
}

/** 智能提取 title：将规范化前的原始名称和 input 结合成友好文本 */
function buildSmartTitle(toolCall: SessionToolCall): string {
	const input = toolCall.input;
	// 优先用语义化字段
	const candidate =
		(input.pattern as string) ||
		(input.query as string) ||
		(input.file_path as string) ||
		(input.path as string) ||
		(input.name as string) ||
		(input.command as string) ||
		(input.url as string) ||
		(input.content as string);

	const displayName = normalizeToolName(toolCall.name);
	if (candidate && typeof candidate === "string") {
		const display = candidate.length > 80 ? `${candidate.slice(0, 80)}…` : candidate;
		return `${displayName} ${display}`;
	}
	return displayName;
}

// ─── 工具类型分类集合 ──────────────────────────────────────────

const FILE_TOOLS = new Set(["Read", "Write", "Edit", "Patch", "MultiEdit"]);
const SEARCH_TOOLS = new Set(["Glob", "Grep"]);
const WEB_TOOLS = new Set(["WebSearch", "WebFetch"]);

// ─── 主组件 ──────────────────────────────────────────────────

export function ToolCallCard({ toolCall, onAskUserAnswer }: ToolCallCardProps) {
	// 先标准化工具名
	const normalized = normalizeToolName(toolCall.name);

	// 构造带标准化名称的 toolCall（传给子组件用）
	const normalizedToolCall = useMemo(() => {
		if (normalized === toolCall.name) return toolCall;
		return { ...toolCall, name: normalized };
	}, [toolCall, normalized]);

	// AskUserQuestion 交互卡片
	if (normalized === "AskUserQuestion") {
		return (
			<AskUserQuestionCard toolCall={normalizedToolCall} onAnswer={onAskUserAnswer} />
		);
	}

	// Agent 工具
	if (normalized === "Agent") {
		return <AgentToolCard toolCall={normalizedToolCall} />;
	}

	// Bash
	if (normalized === "Bash") {
		return <BashToolCard toolCall={normalizedToolCall} />;
	}

	// Codex FileChange
	if (normalized === "FileChange") {
		return <CodexFileChangeCard toolCall={normalizedToolCall} />;
	}

	// Codex TodoList
	if (normalized === "TodoList") {
		return <CodexTodoListCard toolCall={normalizedToolCall} />;
	}

	// 文件操作
	if (FILE_TOOLS.has(normalized)) {
		return <FileToolCard toolCall={normalizedToolCall} />;
	}

	// 搜索
	if (SEARCH_TOOLS.has(normalized)) {
		return <SearchToolCard toolCall={normalizedToolCall} />;
	}

	// Web 工具
	if (WEB_TOOLS.has(normalized)) {
		return <WebToolCard toolCall={normalizedToolCall} />;
	}

	// Codex WebSearch
	if (normalized.toLowerCase().includes("websearch")) {
		return <CodexWebSearchCard toolCall={normalizedToolCall} />;
	}

	// MCP 工具
	if (toolCall.name.includes("/")) {
		return <McpToolCard toolCall={normalizedToolCall} />;
	}

	// 通用 fallback
	return <GenericToolCard toolCall={normalizedToolCall} />;
}

// ─── MCP 工具卡片 ────────────────────────────────────────────

function McpToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const parts = toolCall.name.split("/");
	const serverName = parts.slice(0, -1).join("/");
	const toolName = parts[parts.length - 1];

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null) return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const inputStr = useMemo(() => {
		const keys = Object.keys(toolCall.input);
		if (keys.length === 0) return "";
		return JSON.stringify(toolCall.input, null, 2);
	}, [toolCall.input]);

	return (
		<ToolCardShell
			icon={Plug}
			label={serverName}
			title={toolName}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			iconColor="text-violet-500"
		>
			<div className="space-y-2">
				{inputStr && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">输入</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{inputStr.slice(0, 2000)}
						</pre>
					</div>
				)}
				{output && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">输出</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 2000)}
						</pre>
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}

// ─── 通用工具卡片 ───────────────────────────────────────────

function GenericToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null) return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const inputStr = useMemo(() => {
		const keys = Object.keys(toolCall.input);
		if (keys.length === 0) return "";
		return JSON.stringify(toolCall.input, null, 2);
	}, [toolCall.input]);

	const smartTitle = useMemo(() => buildSmartTitle(toolCall), [toolCall]);

	return (
		<ToolCardShell
			icon={Wrench}
			title={smartTitle}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
		>
			<div className="space-y-2">
				{inputStr && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">输入</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{inputStr.slice(0, 2000)}
						</pre>
					</div>
				)}
				{output && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">输出</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 2000)}
						</pre>
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}
