/**
 * Bash 工具卡片 - 终端命令风格展示（Zed 精致风格）
 *
 * 兼容多种 command 字段来源：
 * - input.command (字符串 or 数组)
 * - input.cmd / input.args
 * - output.command (tool_end 时完整命令)
 * - 空命令时 fallback 到工具名或 description
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

	// 1. input.command — 可能是 string 或 string[]
	if (input.command) {
		if (typeof input.command === "string") return input.command;
		if (Array.isArray(input.command)) return (input.command as string[]).join(" ");
	}

	// 2. input.cmd — 某些后端使用
	if (typeof input.cmd === "string" && input.cmd) return input.cmd;

	// 3. input.args — 某些后端使用
	if (Array.isArray(input.args)) return (input.args as string[]).join(" ");

	// 4. output.command — Codex tool_end 时在 output 中带完整命令
	if (output && typeof output === "object" && !Array.isArray(output)) {
		const out = output as Record<string, unknown>;
		if (typeof out.command === "string" && out.command) return out.command;
		if (Array.isArray(out.command)) return (out.command as string[]).join(" ");
	}

	// 5. Fallback: description 或空
	if (typeof input.description === "string" && input.description) return input.description;

	return "";
}

/** 从多种来源提取输出文本 */
function extractOutput(toolCall: SessionToolCall): string {
	const output = toolCall.output;
	if (!output) return "";

	if (typeof output === "string") return output;

	if (typeof output === "object" && !Array.isArray(output)) {
		const out = output as Record<string, unknown>;
		// Codex 格式：output.output 或 output.aggregated_output
		if (typeof out.output === "string") return out.output;
		if (typeof out.aggregated_output === "string") return out.aggregated_output;
		// 通用 fallback
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

	// 命令摘要：截断过长的命令
	const commandDisplay = command.length > 120 ? `${command.slice(0, 120)}…` : command;

	// Zed 风格标题：显示命令内容
	const title = commandDisplay ? `$ ${commandDisplay}` : "$ (执行命令)";

	const summary =
		toolCall.status === "completed" && outputLineCount > 0
			? `${outputLineCount} 行`
			: undefined;

	return (
		<ToolCardShell
			icon={Terminal}
			title={title}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={summary}
			iconColor="text-emerald-500 dark:text-emerald-400"
		>
			{/* 终端风格输出 */}
			{output && (
				<div className="relative overflow-hidden rounded-md bg-[#1a1a2e] dark:bg-[#0d0d1a]">
					{/* 顶栏：终端标题 + 复制按钮 */}
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
