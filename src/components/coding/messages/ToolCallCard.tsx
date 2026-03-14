/**
 * 通用工具调用卡片 - 按 toolName 分发到子组件
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

/** 文件操作工具 */
const FILE_TOOLS = new Set(["Read", "Write", "Edit", "Patch", "MultiEdit"]);
/** 搜索工具 */
const SEARCH_TOOLS = new Set(["Glob", "Grep"]);
/** Web 工具 */
const WEB_TOOLS = new Set(["WebSearch", "WebFetch"]);

export function ToolCallCard({ toolCall, onAskUserAnswer }: ToolCallCardProps) {
	// AskUserQuestion 交互卡片
	if (toolCall.name === "AskUserQuestion") {
		return (
			<AskUserQuestionCard toolCall={toolCall} onAnswer={onAskUserAnswer} />
		);
	}

	// Agent 工具（spawn 子代理）
	if (toolCall.name === "Agent") {
		return <AgentToolCard toolCall={toolCall} />;
	}

	// Bash
	if (toolCall.name === "Bash") {
		return <BashToolCard toolCall={toolCall} />;
	}

	// Codex FileChange
	if (toolCall.name === "FileChange") {
		return <CodexFileChangeCard toolCall={toolCall} />;
	}

	// Codex TodoList
	if (toolCall.name === "TodoList") {
		return <CodexTodoListCard toolCall={toolCall} />;
	}

	// 文件操作
	if (FILE_TOOLS.has(toolCall.name)) {
		return <FileToolCard toolCall={toolCall} />;
	}

	// 搜索
	if (SEARCH_TOOLS.has(toolCall.name)) {
		return <SearchToolCard toolCall={toolCall} />;
	}

	// Web 工具（含 Codex WebSearch）
	if (WEB_TOOLS.has(toolCall.name)) {
		return <WebToolCard toolCall={toolCall} />;
	}

	// Codex WebSearch
	if (toolCall.name.toLowerCase().includes("websearch")) {
		return <CodexWebSearchCard toolCall={toolCall} />;
	}

	// MCP 工具（含 server/tool 格式的名称）
	if (toolCall.name.includes("/")) {
		return <McpToolCard toolCall={toolCall} />;
	}

	// 通用 fallback
	return <GenericToolCard toolCall={toolCall} />;
}

/** MCP 工具卡片 - server/tool 格式 */
function McpToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const parts = toolCall.name.split("/");
	const serverName = parts.slice(0, -1).join("/");
	const toolName = parts[parts.length - 1];

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null)
			return JSON.stringify(toolCall.output, null, 2);
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
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">
							输入
						</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{inputStr.slice(0, 2000)}
						</pre>
					</div>
				)}
				{output && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">
							输出
						</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 2000)}
						</pre>
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}

/** 通用工具卡片（Fallback） - 从 input 中智能提取展示信息 */
function GenericToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null)
			return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const inputStr = useMemo(() => {
		const keys = Object.keys(toolCall.input);
		if (keys.length === 0) return "";
		return JSON.stringify(toolCall.input, null, 2);
	}, [toolCall.input]);

	// 智能提取 title：优先使用语义化字段
	const smartTitle = useMemo(() => {
		const input = toolCall.input;
		// 尝试常见的语义字段作为标题补充
		const candidate =
			(input.pattern as string) ||
			(input.query as string) ||
			(input.file_path as string) ||
			(input.path as string) ||
			(input.name as string) ||
			(input.command as string) ||
			(input.url as string) ||
			(input.content as string);
		if (candidate && typeof candidate === "string") {
			const display = candidate.length > 80 ? `${candidate.slice(0, 80)}...` : candidate;
			return `${toolCall.name} ${display}`;
		}
		return toolCall.name;
	}, [toolCall.name, toolCall.input]);

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
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">
							输入
						</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{inputStr.slice(0, 2000)}
						</pre>
					</div>
				)}
				{output && (
					<div>
						<div className="mb-0.5 text-[10px] font-medium text-zinc-400">
							输出
						</div>
						<pre className="max-h-32 overflow-y-auto rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-1.5 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 2000)}
						</pre>
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}
