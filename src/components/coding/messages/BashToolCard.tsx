/**
 * Bash 工具卡片 - 终端命令风格展示（Zed 紧凑风格）
 * 折叠态：$ command + 状态 + 耗时
 * 展开态：紧凑深色终端输出，支持复制
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
			? `${outputLineCount} 行`
			: undefined;

	return (
		<ToolCardShell
			icon={Terminal}
			label={description || undefined}
			title={`$ ${commandDisplay}`}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={summary}
			iconColor="text-emerald-500 dark:text-emerald-400"
		>
			{/* 终端风格输出 */}
			{output && (
				<div className="relative overflow-hidden rounded-md bg-[#1a1a2e] dark:bg-[#0d0d1a]">
					{/* 复制按钮 */}
					<div className="flex items-center justify-end px-2 py-1 border-b border-white/[0.04]">
						<button
							type="button"
							onClick={handleCopy}
							className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-300"
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
					<div className="max-h-48 overflow-y-auto scrollbar-thin">
						<pre className="px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-emerald-300/90">
							{output.length > 8000 ? `${output.slice(0, 8000)}\n\n... (输出已截断)` : output}
						</pre>
					</div>
				</div>
			)}

			{/* 错误输出 */}
			{toolCall.isError && output && (
				<div className="mt-1 rounded-md bg-red-950/30 px-2.5 py-1.5 dark:bg-red-900/10">
					<pre className="font-mono text-[11px] leading-[1.5] text-red-400">
						{output.slice(0, 3000)}
					</pre>
				</div>
			)}
		</ToolCardShell>
	);
}
