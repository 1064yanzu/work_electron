import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { memo, useEffect, useState } from "react";
import type { ToolCall } from "../../../lib/agent/types";
import { cn } from "../../../lib/utils";
import { SkillCard } from "../SkillCard";
import { SubagentCard } from "../SubagentCard";
import { CommandHighlight } from "./CommandHighlight";
import { formatDurationMs, getToolIcon, ToolStatusIcon } from "./utils";

interface ToolCallRowProps {
	toolCall: ToolCall;
}

function getResultSummary(toolCall: ToolCall): string | null {
	if (!toolCall.output) return null;

	if (toolCall.type === "kb_search_chunks") {
		const hits = (toolCall.output as any)?.hits || [];
		return `找到 ${hits.length} 条结果`;
	}

	if (toolCall.type === "web_search") {
		const payload = toolCall.output as any;
		const results = payload?.results || (Array.isArray(payload) ? payload : []);
		return `找到 ${results.length} 条结果`;
	}

	if (toolCall.type === "fetch_url") {
		const title =
			(toolCall.output as any)?.title || (toolCall.output as any)?.data?.title;
		return title ? `已获取: ${title}` : "已获取内容";
	}

	if (toolCall.type === "code_execute") {
		if (toolCall.status === "completed") {
			const output = (toolCall.output as any)?.output || "";
			return output
				? `执行成功: ${output.slice(0, 50)}${output.length > 50 ? "..." : ""}`
				: "执行成功";
		}
		if (toolCall.status === "error") {
			return "执行失败";
		}
		return null;
	}

	return null;
}

/**
 * 单行工具调用。
 *
 * 分派：
 * - `skill_invoke` / `code_execute` / `skill_call` / `Task` 有专属卡片
 * - 其他类型走通用折叠行（running/error 时自动展开，completed 时自动折叠）
 */
export const ToolCallRow = memo(function ToolCallRow({
	toolCall,
}: ToolCallRowProps) {
	const Icon = getToolIcon(toolCall.type);
	const duration = formatDurationMs(toolCall.duration);
	const progress = toolCall.metadata?.progress as number | undefined;
	const progressMessage = toolCall.metadata?.message as string | undefined;

	const shouldAutoExpand =
		toolCall.status === "running" || toolCall.status === "error";

	const [isExpanded, setIsExpanded] = useState(shouldAutoExpand);

	useEffect(() => {
		if (toolCall.status === "running" || toolCall.status === "error") {
			setIsExpanded(true);
		} else if (toolCall.status === "completed") {
			setIsExpanded(false);
		}
	}, [toolCall.status]);

	const hasDetails =
		toolCall.output &&
		(toolCall.type === "kb_search_chunks" ||
			toolCall.type === "web_search" ||
			toolCall.type === "fetch_url" ||
			toolCall.type === "code_execute" ||
			(typeof toolCall.output === "object" &&
				Object.keys(toolCall.output).length > 0));

	// skill_invoke: 技能激活卡片（简化版）
	if (toolCall.type === "skill_invoke") {
		const skillData = (toolCall.output as any)?.data || toolCall.output;
		if (skillData?.skillName || skillData?.instructions) {
			return (
				<div className="mb-2 rounded-xl bg-surface/60 ring-1 ring-border overflow-hidden">
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="p-1.5 rounded-lg bg-warm-200 border border-border">
							<Wrench
								className="w-3.5 h-3.5 text-text-secondary"
								strokeWidth={1.5}
							/>
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-text-secondary">
									技能已激活: {skillData.skillName}
								</span>
								{toolCall.status === "completed" && (
									<span className="px-1.5 py-0.5 text-[11px] rounded font-medium bg-[rgba(74,124,89,0.08)] text-success">
										就绪
									</span>
								)}
							</div>
							{skillData.description && (
								<div className="text-xs text-text-light truncate">
									{skillData.description}
								</div>
							)}
						</div>
					</div>
					{skillData.instructions && (
						<div className="px-3 pb-2">
							<div className="text-[11px] text-text-light line-clamp-2">
								已加载 {Math.round(skillData.instructions.length / 1000)}KB
								技能指令
							</div>
						</div>
					)}
				</div>
			);
		}
	}

	// code_execute: 命令行卡片
	if (toolCall.type === "code_execute") {
		const command = (toolCall.input as any)?.command || "";
		const output = (toolCall.output as any)?.output || "";
		const exitCode = (toolCall.output as any)?.exit_code;

		return (
			<div
				className={cn(
					"rounded-xl overflow-hidden transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 mb-2",
					toolCall.status === "running"
						? "bg-surface/80 ring-2 ring-warm-300 shadow-sm"
						: toolCall.status === "error" || exitCode !== 0
							? "bg-surface/80 ring-2 ring-[rgba(181,51,51,0.22)] shadow-sm"
							: "bg-surface/60 ring-1 ring-border",
				)}
			>
				<button
					onClick={() => setIsExpanded((v) => !v)}
					className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-surface/90 transition-colors"
				>
					<div
						className={cn(
							"mt-0.5 p-1.5 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
							toolCall.status === "running"
								? "bg-warm-200"
								: toolCall.status === "error" || exitCode !== 0
									? "bg-[rgba(181,51,51,0.08)]"
									: "bg-[rgba(74,124,89,0.08)]",
						)}
					>
						<Wrench
							className={cn(
								"w-3.5 h-3.5 transition-colors",
								toolCall.status === "running"
									? "text-focus"
									: toolCall.status === "error" || exitCode !== 0
										? "text-error"
										: "text-success",
							)}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2 mb-1.5">
							<span className="text-xs font-medium text-text-muted uppercase tracking-wide">
								命令行
							</span>
							<ToolStatusIcon status={toolCall.status} />
							{duration ? (
								<div className="text-xs font-medium text-text-light">
									{duration}
								</div>
							) : null}
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-text-light transition-transform duration-150" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-text-light transition-transform duration-150" />
								)}
							</div>
						</div>
						{command && <CommandHighlight command={command} />}
					</div>
				</button>

				{isExpanded && output && (
					<div className="px-3 pb-3 border-t border-border/50">
						<div className="mt-2 p-3 rounded-lg bg-warm-50/50 border border-border/50">
							<div className="text-xs font-medium text-text-muted mb-2 flex items-center justify-between">
								<span>输出</span>
								{exitCode !== undefined && (
									<span
										className={cn(
											"px-1.5 py-0.5 rounded text-[11px] font-mono",
											exitCode === 0
												? "bg-[rgba(74,124,89,0.12)] text-success"
												: "bg-[rgba(181,51,51,0.12)] text-error",
										)}
									>
										exit {exitCode}
									</span>
								)}
							</div>
							<pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
								{output}
							</pre>
						</div>
					</div>
				)}
			</div>
		);
	}

	// skill_call: 完整技能卡片
	if (toolCall.type === "skill_call") {
		const skillExecution = toolCall.metadata?.skillExecution;
		if (skillExecution?.skillName) {
			return (
				<div className="mb-2">
					<SkillCard skill={skillExecution} compact />
				</div>
			);
		}
	}

	// 子代理：高级卡片
	if (toolCall.name === "Task") {
		console.log("[AgentTraceInline] Rendering SubagentCard for Task:", {
			toolCallId: toolCall.id,
			name: toolCall.name,
		});
		return <SubagentCard toolCall={toolCall} />;
	}

	if (toolCall.name.toLowerCase().includes("task")) {
		console.warn(
			'[AgentTraceInline] Tool name contains "task" but does not match exactly:',
			{ name: toolCall.name, toolCallId: toolCall.id },
		);
	}

	return (
		<div
			className={cn(
				"rounded-xl overflow-hidden transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 mb-2",
				toolCall.status === "running"
					? "bg-surface/80 ring-2 ring-warm-300 shadow-sm"
					: toolCall.status === "error"
						? "bg-surface/80 ring-2 ring-[rgba(181,51,51,0.22)] shadow-sm"
						: "bg-surface/60 ring-1 ring-border",
			)}
		>
			<button
				onClick={() => hasDetails && setIsExpanded((v) => !v)}
				className={cn(
					"w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors",
					hasDetails && "cursor-pointer hover:bg-surface/90",
					!hasDetails && "cursor-default",
				)}
				disabled={!hasDetails}
			>
				<div
					className={cn(
						"mt-0.5 p-1.5 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
						toolCall.status === "running"
							? "bg-warm-200"
							: toolCall.status === "error"
								? "bg-[rgba(181,51,51,0.08)]"
								: toolCall.status === "completed"
									? "bg-[rgba(74,124,89,0.08)]"
									: "bg-warm-50/50",
					)}
				>
					<Icon
						className={cn(
							"w-3.5 h-3.5 transition-colors",
							toolCall.status === "running"
								? "text-focus"
								: toolCall.status === "error"
									? "text-error"
									: toolCall.status === "completed"
										? "text-success"
										: "text-text-muted",
						)}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-semibold text-text-primary truncate">
							{toolCall.name}
							{toolCall.name === "Task" && toolCall.status === "running" && (
								<span className="ml-2 text-[11px] font-normal bai-icon-violet animate-pulse">
									子代理调用中...
								</span>
							)}
						</div>
						<ToolStatusIcon status={toolCall.status} />
						{duration ? (
							<div className="text-xs font-medium text-text-light">
								{duration}
							</div>
						) : null}
						{hasDetails ? (
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-text-light transition-transform duration-150" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-text-light transition-transform duration-150" />
								)}
							</div>
						) : null}
					</div>
					{toolCall.description ? (
						<div className="text-xs text-text-light line-clamp-1">
							{toolCall.description}
						</div>
					) : null}
					{getResultSummary(toolCall) && !isExpanded ? (
						<div className="mt-1 text-xs text-text-muted">
							{getResultSummary(toolCall)}
						</div>
					) : null}
					{progress !== undefined && toolCall.status === "running" ? (
						<div className="mt-1.5 space-y-1">
							<div className="h-1.5 bg-warm-300 rounded-full overflow-hidden">
								<div
									className="h-full bg-primary transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250"
									style={{
										width: `${Math.min(100, Math.max(0, progress))}%`,
									}}
								/>
							</div>
							{progressMessage ? (
								<div className="text-xs text-text-muted">{progressMessage}</div>
							) : null}
						</div>
					) : null}
					{toolCall.status === "error" && toolCall.error ? (
						<div className="mt-1 text-xs text-error break-words">
							{toolCall.error}
						</div>
					) : null}
					{toolCall.metadata?.message && progress === undefined ? (
						<div className="text-xs text-text-muted line-clamp-1">
							{String(toolCall.metadata.message)}
						</div>
					) : null}
				</div>
			</button>

			{/* 展开的详细内容 */}
			{isExpanded && toolCall.output && (
				<div className="px-3 pb-3 border-t border-border/50">
					{toolCall.type === "kb_search_chunks" ? (
						<div className="mt-2 space-y-2">
							{((toolCall.output as any)?.hits || []).map(
								(hit: any, idx: number) => (
									<div
										key={idx}
										className="text-xs text-text-secondary p-2 rounded-lg bg-warm-50/30"
									>
										<div className="font-medium text-text-secondary mb-1">
											{hit.source_title || "未知"} · #{hit.chunk_index}
											{hit.score ? (
												<span className="ml-2 text-[11px] text-text-light">
													score: {hit.score.toFixed(3)}
												</span>
											) : null}
										</div>
										<div className="line-clamp-3 whitespace-pre-wrap">
											{hit.snippet || ""}
										</div>
									</div>
								),
							)}
						</div>
					) : toolCall.type === "web_search" ? (
						<div className="mt-2 space-y-2">
							{((toolCall.output as any)?.results || [])
								.slice(0, 5)
								.map((result: any, idx: number) => (
									<div
										key={idx}
										className="text-xs text-text-secondary p-2 rounded-lg bg-warm-50/30"
									>
										<div className="font-medium text-text-secondary mb-1">
											{result.title || "无标题"}
										</div>
										<div className="text-[11px] text-text-light mb-1">
											{result.url || ""}
										</div>
										<div className="line-clamp-2">{result.snippet || ""}</div>
									</div>
								))}
						</div>
					) : (
						<div className="mt-2 p-2 rounded-lg bg-warm-50/30">
							<pre className="text-xs text-text-secondary whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
								{typeof toolCall.output === "string"
									? toolCall.output
									: JSON.stringify(toolCall.output, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
});
