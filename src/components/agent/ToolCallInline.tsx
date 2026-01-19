import {
	Brain,
	CheckCircle2,
	ChevronDown,
	Code,
	Database,
	File,
	FileCode,
	FileJson,
	FileText,
	FileType,
	Globe,
	Image as ImageIcon,
	Search,
	Sparkles,
	Terminal,
	XCircle,
	Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useAgentStore } from "../../lib/agent/store";
import type { ToolCall } from "../../lib/agent/types";
import { cn } from "../../lib/utils";

// 高级感渐变配置
const toolConfig: Record<
	string,
	{
		icon: React.ComponentType<{ className?: string }>;
		gradient: string;
		iconColor: string;
		label: string;
	}
> = {
	kb_search_chunks: {
		icon: Database,
		gradient:
			"from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-violet-200/50 dark:border-violet-800/30",
		iconColor: "text-violet-600 dark:text-violet-400",
		label: "Knowledge Base",
	},
	web_search: {
		icon: Search,
		gradient:
			"from-blue-500/10 via-indigo-500/10 to-violet-500/10 border-blue-200/50 dark:border-blue-800/30",
		iconColor: "text-blue-600 dark:text-blue-400",
		label: "Web Search",
	},
	fetch_url: {
		icon: Globe,
		gradient:
			"from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-emerald-200/50 dark:border-emerald-800/30",
		iconColor: "text-emerald-600 dark:text-emerald-400",
		label: "Fetch URL",
	},
	llm_call: {
		icon: Brain,
		gradient:
			"from-amber-500/10 via-orange-500/10 to-rose-500/10 border-amber-200/50 dark:border-amber-800/30",
		iconColor: "text-amber-600 dark:text-amber-400",
		label: "AI Analysis",
	},
	code_execute: {
		icon: Code,
		gradient:
			"from-pink-500/10 via-rose-500/10 to-red-500/10 border-pink-200/50 dark:border-pink-800/30",
		iconColor: "text-pink-600 dark:text-pink-400",
		label: "Execute Code",
	},
	default: {
		icon: Zap,
		gradient:
			"from-zinc-500/10 via-zinc-500/10 to-zinc-500/10 border-zinc-200/50 dark:border-zinc-800/30",
		iconColor: "text-zinc-600 dark:text-zinc-400",
		label: "Tool Call",
	},
	skill_call: {
		icon: Sparkles,
		gradient:
			"from-orange-500/10 via-amber-500/10 to-yellow-500/10 border-orange-200/50 dark:border-orange-800/30",
		iconColor: "text-orange-600 dark:text-orange-400",
		label: "Skill Action",
	},
	skill_invoke: {
		icon: Sparkles,
		gradient:
			"from-orange-500/10 via-amber-500/10 to-yellow-500/10 border-orange-200/50 dark:border-orange-800/30",
		iconColor: "text-orange-600 dark:text-orange-400",
		label: "Skill Action",
	},
};

function getToolConfig(type: string, name?: string) {
	if (toolConfig[type]) return toolConfig[type];

	const lower = (name || "").toLowerCase();
	if (lower.includes("search") || lower.includes("检索"))
		return toolConfig.web_search;
	if (lower.includes("fetch") || lower.includes("抓取"))
		return toolConfig.fetch_url;
	if (lower.includes("code") || lower.includes("代码"))
		return toolConfig.code_execute;
	if (lower.includes("llm") || lower.includes("ai")) return toolConfig.llm_call;

	return toolConfig.default;
}

function StatusBadge({ status }: { status: ToolCall["status"] }) {
	if (status === "running") {
		return (
			<div className="flex items-center gap-1.5">
				<div className="relative flex h-2 w-2">
					<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
					<span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
				</div>
				<span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 tracking-wide uppercase">
					Running
				</span>
			</div>
		);
	}

	if (status === "completed") {
		return (
			<div className="flex items-center gap-1 opacity-70">
				<CheckCircle2 className="w-3 h-3 text-emerald-500" />
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex items-center gap-1">
				<XCircle className="w-3 h-3 text-rose-500" />
				<span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 tracking-wide uppercase">
					Error
				</span>
			</div>
		);
	}

	return null;
}

const CodeBlock = ({
	content,
	className,
}: {
	content: string;
	className?: string;
}) => (
	<div
		className={cn(
			"relative overflow-hidden rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800/50 group/code",
			className,
		)}
	>
		<div className="absolute right-2 top-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
			<button
				onClick={(e) => {
					e.stopPropagation();
					navigator.clipboard.writeText(content);
				}}
				className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded md:transition-colors text-zinc-400 hover:text-zinc-600"
			>
				<Sparkles className="w-3 h-3" />
			</button>
		</div>
		<pre className="p-3 text-[10px] sm:text-[11px] font-mono leading-relaxed overflow-x-auto text-zinc-600 dark:text-zinc-300 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700">
			{content}
		</pre>
	</div>
);

// 辅助函数：根据文件名获取图标
function getFileIcon(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();

	switch (ext) {
		case "ts":
		case "tsx":
		case "js":
		case "jsx":
			return <FileCode className="w-3.5 h-3.5 text-blue-500" />;
		case "json":
		case "yml":
		case "yaml":
			return <FileJson className="w-3.5 h-3.5 text-yellow-500" />;
		case "html":
		case "css":
			return <FileType className="w-3.5 h-3.5 text-orange-500" />;
		case "md":
		case "txt":
			return <FileText className="w-3.5 h-3.5 text-zinc-500" />;
		case "png":
		case "jpg":
		case "svg":
			return <ImageIcon className="w-3.5 h-3.5 text-purple-500" />;
		case "rs":
		case "go":
		case "py":
			return (
				<Terminal className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
			);
		default:
			return <File className="w-3.5 h-3.5 text-zinc-400" />;
	}
}

// 结构化结果：资料库检索
function SearchResultView({ output }: { output: any }) {
	// 尝试解析结构
	const results = useMemo(() => {
		try {
			if (typeof output === "string") {
				const parsed = JSON.parse(output);
				return Array.isArray(parsed) ? parsed : [];
			}
			return Array.isArray(output) ? output : [];
		} catch {
			return [];
		}
	}, [output]);

	if (results.length === 0)
		return (
			<CodeBlock
				content={
					typeof output === "string" ? output : JSON.stringify(output, null, 2)
				}
			/>
		);

	return (
		<div className="space-y-1">
			{results.map((item: any, idx: number) => {
				// 兼容不同可能的字段名
				const file = item.file || item.path || item.filename || "unknown";
				const startLine = item.start_line || item.startLine || item.line || "?";
				const endLine = item.end_line || item.endLine;
				const lineDisplay = endLine
					? `L${startLine}-${endLine}`
					: `L${startLine}`;
				const basename = file.split(/[/\\]/).pop();

				return (
					<div
						key={idx}
						className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group/item cursor-default text-[12px]"
					>
						{getFileIcon(file)}
						<span
							className="font-medium text-zinc-700 dark:text-zinc-300 truncate"
							title={file}
						>
							{basename}
						</span>
						{startLine !== "?" && (
							<span className="text-zinc-400 font-mono text-[10px] ml-auto">
								{lineDisplay}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// 结构化结果：网络检索
function WebSearchResultView({ output }: { output: any }) {
	const results = useMemo(() => {
		const normalize = (payload: any) => {
			if (Array.isArray(payload)) return payload;
			if (Array.isArray(payload?.results)) return payload.results;
			if (Array.isArray(payload?.data?.results)) return payload.data.results;
			return [];
		};
		try {
			if (typeof output === "string") {
				const parsed = JSON.parse(output);
				return normalize(parsed);
			}
			return normalize(output);
		} catch {
			return [];
		}
	}, [output]);

	if (results.length === 0)
		return (
			<CodeBlock
				content={
					typeof output === "string" ? output : JSON.stringify(output, null, 2)
				}
			/>
		);

	return (
		<div className="space-y-2">
			{results.slice(0, 5).map((item: any, idx: number) => (
				<a
					key={idx}
					href={item.url}
					target="_blank"
					rel="noopener noreferrer"
					className="block p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group/web"
				>
					<div className="flex items-center gap-2 mb-1">
						<Globe className="w-3 h-3 text-blue-500" />
						<span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-1 group-hover/web:text-blue-600 dark:group-hover/web:text-blue-400 transition-colors">
							{item.title || item.url}
						</span>
					</div>
					{(item.content || item.snippet) && (
						<p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 pl-5">
							{item.content || item.snippet}
						</p>
					)}
				</a>
			))}
			{results.length > 5 && (
				<div className="text-center text-[10px] text-zinc-400 py-1">
					+ {results.length - 5} more results
				</div>
			)}
		</div>
	);
}

// 新增终端风格视图
function TerminalOutputView({
	command,
	output,
	cwd = "/app",
}: {
	command?: string;
	output: string;
	cwd?: string;
}) {
	return (
		<div className="rounded-lg overflow-hidden border border-zinc-800 bg-[#1e1e1e] shadow-lg my-2 font-mono text-sm">
			{/* Terminal Title Bar */}
			<div className="bg-[#2d2d2d] px-3 py-1.5 flex items-center gap-2 border-b border-black/20">
				<div className="flex gap-1.5">
					<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /> {/* Red */}
					<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />{" "}
					{/* Yellow */}
					<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />{" "}
					{/* Green */}
				</div>
				<div className="flex-1 text-center text-[10px] text-zinc-400 font-medium select-none">
					bash — 80x24
				</div>
			</div>

			{/* Terminal Content */}
			<div className="p-3 text-zinc-300 space-y-2 overflow-x-auto min-h-[60px] max-h-[300px] scrollbar-thin scrollbar-thumb-zinc-700">
				{command && (
					<div className="flex gap-2 text-[#4ade80]">
						<span className="shrink-0 select-none">➜</span>
						<span className="shrink-0 text-cyan-400 select-none">{cwd}</span>
						<span className="text-zinc-100">{command}</span>
					</div>
				)}
				<div className="whitespace-pre-wrap leading-relaxed text-[11px] sm:text-[12px] opacity-90">
					{output || <span className="text-zinc-600 italic">No output...</span>}
				</div>
				{/* Cursor */}
				<div className="w-2 h-4 bg-zinc-500/50 animate-pulse mt-1" />
			</div>
		</div>
	);
}

// 结构化结果渲染器分发
function StructuredOutput({
	type,
	name,
	input,
	output,
}: {
	type: string;
	name?: string;
	input?: any;
	output: any;
}) {
	// 特殊处理：Terminal / Bash / Shell
	const isTerminal =
		name?.toLowerCase() === "bash" ||
		name?.toLowerCase().includes("terminal") ||
		name?.toLowerCase().includes("shell") ||
		(type as string) === "bash";

	if (isTerminal) {
		const cmd = input?.command || input?.cmd || input?.code || "";
		const outStr =
			typeof output === "string" ? output : JSON.stringify(output, null, 2);
		return <TerminalOutputView command={cmd} output={outStr} />;
	}

	if (!output)
		return <span className="text-zinc-400 italic text-[11px]">No output</span>;

	// 1. 资料库检索
	if (type === "kb_search_chunks") {
		return <SearchResultView output={output} />;
	}

	// 2. 网络搜索
	if (type === "web_search") {
		return <WebSearchResultView output={output} />;
	}

	// 3. 网页抓取
	if (type === "fetch_url") {
		// 如果是简单的文本内容
		if (typeof output === "string") {
			return (
				<div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 p-3 scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700">
					<div className="prose prose-xs dark:prose-invert max-w-none break-words whitespace-pre-wrap">
						{output.length > 2000 ? output.slice(0, 2000) + "..." : output}
					</div>
				</div>
			);
		}
	}

	// 默认：代码块
	return (
		<CodeBlock
			content={
				typeof output === "string" ? output : JSON.stringify(output, null, 2)
			}
			className="bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-100/50 dark:border-emerald-800/30"
		/>
	);
}

export default function ToolCallInline({
	taskId,
	toolCallId,
	initialData,
}: {
	taskId: string;
	toolCallId: string;
	initialData?: ToolCall;
}) {
	const { currentTask, taskHistory } = useAgentStore();
	// 默认展开状态：如果是 Error 或者 Running，或者是 Terminal 类型，则默认展开
	const [open, setOpen] = useState(false);

	// 性能优化：直接从 currentTask 查找，减少遍历
	const storeTask =
		currentTask?.id === taskId
			? currentTask
			: taskHistory.find((t) => t.id === taskId);
	const storeToolCall = storeTask?.toolCalls.find((tc) => tc.id === toolCallId);

	const toolCall = storeToolCall || initialData;

	// 监听状态变化以自动展开
	React.useEffect(() => {
		if (toolCall) {
			if (toolCall.status === "error" || toolCall.status === "running") {
				setOpen(true);
			}
			// 终端类型的工具调用，通常用户想直接看到输出，所以完成后也保持展开（或者是默认展开状态）
			const isTerminal =
				toolCall.name?.toLowerCase() === "bash" ||
				(toolCall.type as string) === "bash";
			if (isTerminal && toolCall.status === "completed") {
				// 可选：终端命令完成后是否自动收起？或者保持展开？
				// 既然用户想要看到输入输出，那么默认保持展开可能更好，或者至少初始是展开的。
				// 这里保持 open 状态不变，由用户控制
			}
		}
	}, [toolCall?.status, toolCall?.name, toolCall?.type]);

	if (!toolCall) return null;

	const config = getToolConfig(toolCall.type, toolCall.name);
	const Icon = config.icon;
	const isError = toolCall.status === "error";

	const duration = toolCall.duration
		? `${(toolCall.duration / 1000).toFixed(1)}s`
		: "";

	// 提取需要显示的精简信息
	const getInputDisplay = () => {
		if (toolCall.type === "web_search") return (toolCall.input as any)?.query;
		if (toolCall.type === "kb_search_chunks")
			return (toolCall.input as any)?.query;
		if (toolCall.type === "fetch_url") return (toolCall.input as any)?.url;

		// 如果是命令行
		if (
			toolCall.name === "bash" ||
			(toolCall.type as string) === "bash" ||
			(toolCall.type as string) === "skill"
		) {
			return (
				(toolCall.input as any)?.command ||
				(toolCall.input as any)?.cmd ||
				"Execute Command"
			);
		}

		return toolCall.name;
	};

	// 是否是终端类型，如果是，我们可能要隐藏默认的 Input 显示，因为 TerminalOutputView header 已经包含了命令
	const isTerminal =
		toolCall.name?.toLowerCase() === "bash" ||
		toolCall.name?.toLowerCase().includes("terminal") ||
		(toolCall.type as string) === "bash" ||
		(toolCall.type as string) === "skill";

	return (
		<div
			className={cn(
				"group/card relative rounded-2xl transition-all duration-300 ease-out mb-3",
				"bg-white dark:bg-zinc-900/40",
				"border border-zinc-200/60 dark:border-zinc-800/60",
				"hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm",
				isError &&
					"border-rose-200 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10",
				open &&
					"shadow-md ring-1 ring-black/5 dark:ring-white/5 border-transparent",
			)}
		>
			{/* 头部摘要区 */}
			<button
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-start gap-3 p-3 text-left outline-none"
			>
				{/* 图标容器 - 增加高级感 */}
				<div
					className={cn(
						"relative flex items-center justify-center w-8 h-8 rounded-xl border transition-all duration-300 mt-0.5",
						"bg-gradient-to-br shadow-sm",
						config.gradient,
					)}
				>
					<Icon className={cn("w-4 h-4", config.iconColor)} />
				</div>

				<div className="min-w-0 flex-1 flex flex-col gap-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate tracking-tight">
							{config.label}
						</span>
						<StatusBadge status={toolCall.status} />
					</div>

					<div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500 font-medium">
						<span className="truncate max-w-[300px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400 font-mono">
							{getInputDisplay()}
						</span>
						{duration && (
							<>
								<span className="w-0.5 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
								<span className="font-mono text-[10px] opacity-70">
									{duration}
								</span>
							</>
						)}
					</div>
				</div>

				<div
					className={cn(
						"flex items-center justify-center w-6 h-6 rounded-lg text-zinc-400 transition-all duration-300 mt-1",
						"hover:bg-zinc-100 dark:hover:bg-zinc-800",
						open && "bg-zinc-100 dark:bg-zinc-800 rotate-180",
					)}
				>
					<ChevronDown className="w-4 h-4" />
				</div>
			</button>

			{/* 展开的详情内容 - 极简主义设计 */}
			{open && (
				<div className="px-3 pb-3 pt-0 space-y-3 animate-in fade-in slide-in-from-top-1 duration-300">
					<div className="h-px w-full bg-zinc-100 dark:bg-zinc-800/50" />

					<div className="grid gap-3">
						{/* 对于非终端工具，显示 Input */}
						{!isTerminal && (
							<div className="space-y-1.5">
								<span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider pl-1">
									Input
								</span>
								<CodeBlock content={JSON.stringify(toolCall.input, null, 2)} />
							</div>
						)}

						{/* Output Section - 使用结构化渲染器 */}
						{/* 对于终端工具，如果正在运行且没有输出，也显示空终端 */}
						{(toolCall.output || isTerminal) && (
							<div className="space-y-1.5">
								{!isTerminal && (
									<span className="text-[10px] font-semibold text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider pl-1">
										Result
									</span>
								)}
								<StructuredOutput
									type={toolCall.type}
									name={toolCall.name}
									input={toolCall.input}
									output={toolCall.output}
								/>
							</div>
						)}

						{/* Error Section */}
						{toolCall.error && (
							<div className="space-y-1.5">
								<span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider pl-1">
									Error
								</span>
								<div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 text-[11px] text-rose-600 dark:text-rose-400 font-mono break-all leading-relaxed">
									{toolCall.error}
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
