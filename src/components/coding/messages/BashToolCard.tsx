/**
 * Bash 工具卡片 - 终端命令风格展示
 * 折叠态：$ command + 状态 + 耗时
 * 展开态：深色终端风格输出，支持复制
 */
import { Terminal, Copy, Check } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";

interface BashToolCardProps {
	toolCall: SessionToolCall;
}

export function BashToolCard({ toolCall }: BashToolCardProps) {
	const [copied, setCopied] = useState(false);
	const command = (toolCall.input.command as string) || "";
	const description = (toolCall.input.description as string) || "";

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null) return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const outputLineCount = useMemo(
		() => (output ? output.split("\n").length : 0),
		[output],
	);

	const handleCopy = useCallback(() => {
		void navigator.clipboard.writeText(output);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [output]);

	// 命令摘要：截断过长的命令
	const commandDisplay = command.length > 120 ? `${command.slice(0, 120)}…` : command;

	const summary =
		toolCall.status === "completed" && outputLineCount > 0
			? `${outputLineCount} 行输出`
			: undefined;

	return (
		<ToolCardShell
			icon={Terminal}
			title={`$ ${commandDisplay}`}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={summary}
		>
			{/* 命令描述（如有） */}
			{description && (
				<p className="mb-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
					{description}
				</p>
			)}

			{/* 终端风格输出 */}
			{output && (
				<div className="relative overflow-hidden rounded-lg border border-zinc-200/60 bg-[#1a1a2e] dark:border-zinc-700/40">
					{/* 终端标题栏 */}
					<div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
						<div className="flex items-center gap-1.5">
							<span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
							<span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
							<span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
						</div>
						<button
							type="button"
							onClick={handleCopy}
							className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-300"
						>
							{copied ? (
								<>
									<Check className="h-3 w-3" />
									<span>已复制</span>
								</>
							) : (
								<>
									<Copy className="h-3 w-3" />
									<span>复制</span>
								</>
							)}
						</button>
					</div>

					{/* 输出内容 */}
					<div className="max-h-64 overflow-y-auto scrollbar-thin">
						<pre className="px-3 py-2 font-mono text-[11px] leading-[1.6] text-emerald-300/90">
							{output.length > 8000 ? `${output.slice(0, 8000)}\n\n... (输出已截断)` : output}
						</pre>
					</div>
				</div>
			)}

			{/* 错误输出 */}
			{toolCall.isError && output && (
				<div className="mt-1 rounded-lg border border-red-200/50 bg-red-50/50 px-3 py-2 dark:border-red-800/30 dark:bg-red-900/10">
					<pre className="font-mono text-[11px] leading-[1.6] text-red-600 dark:text-red-400">
						{output.slice(0, 3000)}
					</pre>
				</div>
			)}
		</ToolCardShell>
	);
}
