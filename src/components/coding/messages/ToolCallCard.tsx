/**
 * 通用工具调用卡片 - 按 toolName 分发到子组件
 */
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';
import { AgentToolCard } from './AgentToolCard';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { BashToolCard } from './BashToolCard';
import { CodexFileChangeCard } from './CodexFileChangeCard';
import { CodexTodoListCard } from './CodexTodoListCard';
import { CodexWebSearchCard } from './CodexWebSearchCard';
import { FileToolCard } from './FileToolCard';
import { SearchToolCard } from './SearchToolCard';
import { WebToolCard } from './WebToolCard';
import { Wrench, ChevronDown, Plug } from 'lucide-react';
import { useState } from 'react';

interface ToolCallCardProps {
	toolCall: SessionToolCall;
	onAskUserAnswer?: (requestId: string, answers: Record<string, string>) => void;
}

/** 文件操作工具 */
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'Patch', 'MultiEdit']);
/** 搜索工具 */
const SEARCH_TOOLS = new Set(['Glob', 'Grep']);
/** Web 工具 */
const WEB_TOOLS = new Set(['WebSearch', 'WebFetch']);

export function ToolCallCard({ toolCall, onAskUserAnswer }: ToolCallCardProps) {
	// AskUserQuestion 交互卡片
	if (toolCall.name === 'AskUserQuestion') {
		return <AskUserQuestionCard toolCall={toolCall} onAnswer={onAskUserAnswer} />;
	}

	// Agent 工具（spawn 子代理）
	if (toolCall.name === 'Agent') {
		return <AgentToolCard toolCall={toolCall} />;
	}

	// Bash
	if (toolCall.name === 'Bash') {
		return <BashToolCard toolCall={toolCall} />;
	}

	// Codex FileChange
	if (toolCall.name === 'FileChange') {
		return <CodexFileChangeCard toolCall={toolCall} />;
	}

	// Codex TodoList
	if (toolCall.name === 'TodoList') {
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

	// Codex WebSearch（当 toolName 被上层映射为 "WebSearch" 但不在 WEB_TOOLS 集合时的兜底）
	if (toolCall.name.toLowerCase().includes('websearch')) {
		return <CodexWebSearchCard toolCall={toolCall} />;
	}

	// MCP 工具（含 server/tool 格式的名称）
	if (toolCall.name.includes('/')) {
		return <McpToolCard toolCall={toolCall} />;
	}

	// 通用 fallback
	return <GenericToolCard toolCall={toolCall} />;
}

/** MCP 工具卡片 - server/tool 格式 */
function McpToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const [expanded, setExpanded] = useState(false);
	const parts = toolCall.name.split('/');
	const serverName = parts.slice(0, -1).join('/');
	const toolName = parts[parts.length - 1];

	const output = typeof toolCall.output === 'string'
		? toolCall.output
		: toolCall.output != null
			? JSON.stringify(toolCall.output, null, 2)
			: '';

	const statusColor =
		toolCall.status === 'running'
			? 'bg-[#D96C46] animate-pulse'
			: toolCall.status === 'completed'
				? 'bg-emerald-500'
				: toolCall.status === 'error'
					? 'bg-red-500'
					: 'bg-zinc-300';

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Plug className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-[10px] text-zinc-400 shrink-0">{serverName}</span>
				<span className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
					{toolName}
				</span>
				<div className="flex-1" />
				<div className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
				{toolCall.status === 'running' && (
					<span className="text-[10px] text-zinc-400">执行中...</span>
				)}
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50 px-3 py-2 space-y-2">
					{Object.keys(toolCall.input).length > 0 && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">输入</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
								{JSON.stringify(toolCall.input, null, 2).slice(0, 1000)}
							</pre>
						</div>
					)}
					{output && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">输出</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
								{output.slice(0, 1000)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/** 通用工具卡片 */
function GenericToolCard({ toolCall }: { toolCall: SessionToolCall }) {
	const [expanded, setExpanded] = useState(false);

	const statusColor =
		toolCall.status === 'running'
			? 'bg-[#D96C46] animate-pulse'
			: toolCall.status === 'completed'
				? 'bg-emerald-500'
				: toolCall.status === 'error'
					? 'bg-red-500'
					: 'bg-zinc-300';

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Wrench className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
					{toolCall.name}
				</span>
				<div className="flex-1" />
				<div className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
				{toolCall.status === 'running' && (
					<span className="text-[10px] text-zinc-400">执行中...</span>
				)}
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50 px-3 py-2 space-y-2">
					{/* Input */}
					{Object.keys(toolCall.input).length > 0 && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">输入</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
								{JSON.stringify(toolCall.input, null, 2).slice(0, 1000)}
							</pre>
						</div>
					)}
					{/* Output */}
					{toolCall.output != null && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">输出</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
								{(typeof toolCall.output === 'string'
									? toolCall.output
									: JSON.stringify(toolCall.output, null, 2)
								).slice(0, 1000)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
