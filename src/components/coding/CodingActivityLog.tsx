/**
 * AI 活动日志面板 - 右侧面板
 * 紧凑的时间线视图，展示 AI 工具调用历史
 * 整合文件变更和命令执行记录
 */
import {
	Terminal,
	FileCode,
	FilePen,
	FilePlus,
	Search,
	FolderSearch,
	Globe,
	Bot,
	Wrench,
	Plug,
	ChevronRight,
	ListChecks,
} from "lucide-react";
import {
	useMemo,
	useRef,
	useEffect,
	useState,
	type ComponentType,
} from "react";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";
import type { SessionToolCall } from "../../lib/stores/codingSessionTypes";

/** 工具名称到图标映射 */
function getToolIcon(name: string): ComponentType<{ className?: string }> {
	switch (name) {
		case "Bash":
			return Terminal;
		case "Read":
			return FileCode;
		case "Edit":
		case "Patch":
		case "MultiEdit":
			return FilePen;
		case "Write":
			return FilePlus;
		case "Glob":
			return FolderSearch;
		case "Grep":
			return Search;
		case "WebSearch":
		case "WebFetch":
			return Globe;
		case "Agent":
			return Bot;
		case "TodoList":
			return ListChecks;
		default:
			return name.includes("/") ? Plug : Wrench;
	}
}

/** 工具名称到中文动作 */
function getToolAction(name: string): string {
	switch (name) {
		case "Bash":
			return "执行命令";
		case "Read":
			return "读取";
		case "Edit":
		case "Patch":
		case "MultiEdit":
			return "编辑";
		case "Write":
			return "创建";
		case "Glob":
			return "搜索文件";
		case "Grep":
			return "搜索内容";
		case "WebSearch":
		case "WebFetch":
			return "网络搜索";
		case "Agent":
			return "子代理";
		case "TodoList":
			return "待办列表";
		case "FileChange":
			return "文件变更";
		default:
			return name;
	}
}

/** 从工具调用输入中提取简要描述 */
function extractDescription(tc: SessionToolCall): string {
	const input = tc.input;
	if (tc.name === "Bash") {
		const cmd = (input.command as string) || "";
		return cmd.length > 60 ? `${cmd.slice(0, 60)}…` : cmd;
	}
	const filePath = (input.file_path || input.path || "") as string;
	if (filePath) {
		return filePath.split("/").pop() || filePath;
	}
	const pattern = (input.pattern || input.query || input.name || "") as string;
	if (pattern) {
		return typeof pattern === "string" && pattern.length > 60
			? `${pattern.slice(0, 60)}…`
			: String(pattern);
	}
	return "";
}

/** 状态颜色 */
function getStatusColor(
	status: SessionToolCall["status"],
	isError?: boolean,
): string {
	if (isError) return "bg-red-500";
	switch (status) {
		case "running":
			return "bg-[#D96C46]";
		case "completed":
			return "bg-emerald-500";
		case "error":
			return "bg-red-500";
		default:
			return "bg-zinc-300 dark:bg-zinc-600";
	}
}

function getIconColor(
	status: SessionToolCall["status"],
	isError?: boolean,
): string {
	if (isError) return "text-red-500";
	switch (status) {
		case "running":
			return "text-[#D96C46]";
		case "completed":
			return "text-zinc-500 dark:text-zinc-400";
		case "error":
			return "text-red-500";
		default:
			return "text-zinc-400";
	}
}

interface ActivityEntry {
	id: string;
	toolName: string;
	description: string;
	status: SessionToolCall["status"];
	isError: boolean;
	durationMs?: number;
	timestamp: number;
	output?: string;
}

export function CodingActivityLog() {
	const messages = useCodingSessionSelector((s) => s.messages);
	const scrollRef = useRef<HTMLDivElement>(null);

	// 从消息中提取所有工具调用
	const entries = useMemo<ActivityEntry[]>(() => {
		const result: ActivityEntry[] = [];
		for (const msg of messages) {
			if (msg.role !== "assistant") continue;
			for (const tc of msg.toolCalls) {
				result.push({
					id: tc.id,
					toolName: tc.name,
					description: extractDescription(tc),
					status: tc.status,
					isError: tc.isError,
					durationMs: tc.durationMs,
					timestamp: msg.timestamp,
					output:
						typeof tc.output === "string"
							? tc.output
							: tc.output != null
								? JSON.stringify(tc.output)
								: undefined,
				});
			}
		}
		return result;
	}, [messages]);

	// 自动滚动到底部
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [entries.length]);

	if (entries.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 text-center">
				<Wrench className="mb-3 h-7 w-7 text-zinc-300 dark:text-zinc-600" />
				<div className="text-xs font-medium text-zinc-400">暂无活动</div>
				<div className="mt-1 text-[11px] text-zinc-400/70">
					AI 开始工作后，工具调用历史会显示在这里
				</div>
			</div>
		);
	}

	return (
		<div ref={scrollRef} className="h-full overflow-y-auto scrollbar-thin py-1">
			{entries.map((entry) => (
				<ActivityLogEntry key={entry.id} entry={entry} />
			))}
		</div>
	);
}

/** 单条活动记录 */
function ActivityLogEntry({ entry }: { entry: ActivityEntry }) {
	const [expanded, setExpanded] = useState(false);
	const Icon = getToolIcon(entry.toolName);
	const action = getToolAction(entry.toolName);
	const statusColor = getStatusColor(entry.status, entry.isError);
	const iconColor = getIconColor(entry.status, entry.isError);
	const isRunning = entry.status === "running";
	const hasOutput = Boolean(entry.output);

	const durationLabel =
		entry.durationMs != null && entry.durationMs > 0
			? entry.durationMs >= 1000
				? `${(entry.durationMs / 1000).toFixed(1)}s`
				: `${entry.durationMs}ms`
			: null;

	return (
		<div className="group">
			<button
				type="button"
				onClick={() => hasOutput && setExpanded(!expanded)}
				className={`flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition-colors ${
					hasOutput
						? "hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 cursor-pointer"
						: "cursor-default"
				}`}
			>
				{/* 状态点 */}
				<div
					className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor} ${
						isRunning ? "animate-pulse" : ""
					}`}
				/>

				{/* 图标 */}
				<Icon className={`h-3 w-3 shrink-0 ${iconColor}`} />

				{/* 动作 */}
				<span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
					{action}
				</span>

				{/* 描述 */}
				<span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
					{entry.description}
				</span>

				{/* 耗时 */}
				{durationLabel && !isRunning && (
					<span className="shrink-0 text-[9px] tabular-nums text-zinc-400/50">
						{durationLabel}
					</span>
				)}

				{/* 展开箭头 */}
				{hasOutput && (
					<ChevronRight
						className={`h-2.5 w-2.5 shrink-0 text-zinc-300 dark:text-zinc-600 transition-transform duration-150 ${
							expanded ? "rotate-90" : ""
						}`}
					/>
				)}
			</button>

			{/* 展开内容 */}
			{expanded && entry.output && (
				<div className="mx-2.5 mb-1 ml-6">
					<pre className="max-h-32 overflow-y-auto rounded bg-zinc-100/80 px-2 py-1 font-mono text-[10px] leading-[1.5] text-zinc-500 scrollbar-thin dark:bg-zinc-800/50 dark:text-zinc-500">
						{entry.output.slice(0, 2000)}
					</pre>
				</div>
			)}
		</div>
	);
}
