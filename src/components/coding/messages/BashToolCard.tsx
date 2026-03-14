/**
 * Bash 工具卡片 - 紧凑内联终端命令展示
 *
 * 折叠态：Terminal icon + Bash + $ command
 * 展开态：终端风格输出
 */
import { Terminal, Copy, Check } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";

interface BashToolCardProps {
	toolCall: SessionToolCall;
}

/** 从多种可能的来源提取命令文本 */
function extractCommand(toolCall: SessionToolCall): string {
	const input = toolCall.input;
	const output = toolCall.output;

	if (input.command) {
		if (typeof input.command === "string") return input.command;
		if (Array.isArray(input.command))
			return (input.command as string[]).join(" ");
	}

	if (typeof input.cmd === "string" && input.cmd) return input.cmd;
	if (Array.isArray(input.args)) return (input.args as string[]).join(" ");

	if (output && typeof output === "object" && !Array.isArray(output)) {
		const out = output as Record<string, unknown>;
		if (typeof out.command === "string" && out.command) return out.command;
		if (Array.isArray(out.command)) return (out.command as string[]).join(" ");
	}

	if (typeof input.description === "string" && input.description)
		return input.description;

	return "";
}

/** 从多种来源提取输出文本 */
function extractOutput(toolCall: SessionToolCall): string {
	const output = toolCall.output;
	if (!output) return "";

	if (typeof output === "string") return output;

	if (typeof output === "object" && !Array.isArray(output)) {
		const out = output as Record<string, unknown>;
		if (typeof out.output === "string") return out.output;
		if (typeof out.aggregated_output === "string") return out.aggregated_output;
		return JSON.stringify(output, null, 2);
	}

	return String(output);
}

export function BashToolCard({ toolCall }: BashToolCardProps) {
	const [copied, setCopied] = useState(false);
	const command = useMemo(() => extractCommand(toolCall), [toolCall]);
	const output = useMemo(() => extractOutput(toolCall), [toolCall]);

	const outputLineCount = useMemo(
		() => (output ? output.split("\n").length : 0),
		[output],
	);

	const handleCopy = useCallback(() => {
		void navigator.clipboard.writeText(output);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [output]);

	const commandDisplay =
		command.length > 120 ? `${command.slice(0, 120)}…` : command;

	const summary =
		toolCall.status === "completed" && outputLineCount > 0
			? `${outputLineCount} 行`
			: undefined;

	return (
		<ToolCardShell
			icon={Terminal}
			label="Bash"
			title={commandDisplay ? `$ ${commandDisplay}` : "$ (执行命令)"}
			status={toolCall.status}
			isError={toolCall.isError}
			summary={summary}
			iconColor="text-emerald-500 dark:text-emerald-400"
		>
			{output && (
				<div className="relative overflow-hidden rounded-md bg-[#1a1a2e] dark:bg-[#0d0d1a]">
					<div className="flex items-center justify-between px-2.5 py-1 border-b border-white/[0.06]">
						<span className="text-[10px] text-zinc-500 font-mono">output</span>
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

					<div className="max-h-48 overflow-y-auto scrollbar-thin">
						<pre className="px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-emerald-300/90">
							{output.length > 8000
								? `${output.slice(0, 8000)}\n\n... (输出已截断)`
								: output}
						</pre>
					</div>
				</div>
			)}

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
