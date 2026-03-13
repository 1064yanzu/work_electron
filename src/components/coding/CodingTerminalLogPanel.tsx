/**
 * 终端日志面板 - 汇总展示 AI 执行过的所有 Bash 命令及输出
 */
import { Terminal, ChevronDown, Copy, Check } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";

export function CodingTerminalLogPanel() {
	const messages = useCodingSessionSelector((s) => s.messages);

	// 从所有消息中提取 Bash 工具调用
	const bashCalls = useMemo(() => {
		const calls: Array<{
			id: string;
			command: string;
			description: string;
			output: string;
			status: string;
			isError?: boolean;
			durationMs?: number;
		}> = [];

		for (const msg of messages) {
			if (msg.role !== "assistant") continue;
			for (const tc of msg.toolCalls) {
				if (tc.name !== "Bash") continue;
				const command = String(tc.input.command || "");
				const description = String(tc.input.description || "");
				const output =
					typeof tc.output === "string"
						? tc.output
						: tc.output != null
							? JSON.stringify(tc.output, null, 2)
							: "";
				calls.push({
					id: tc.id,
					command,
					description,
					output,
					status: tc.status,
					isError: tc.isError,
					durationMs: tc.durationMs,
				});
			}
		}

		return calls;
	}, [messages]);

	if (bashCalls.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 text-center">
				<div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
					<Terminal className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
				</div>
				<div className="text-sm font-medium text-zinc-500 dark:text-zinc-300">
					暂无终端输出
				</div>
				<div className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500 max-w-[200px]">
					AI 执行的命令输出将汇总在这里
				</div>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto scrollbar-thin">
			<div className="p-2 space-y-1">
				{bashCalls.map((call) => (
					<TerminalLogEntry key={call.id} call={call} />
				))}
			</div>
		</div>
	);
}

function TerminalLogEntry({
	call,
}: {
	call: {
		id: string;
		command: string;
		description: string;
		output: string;
		status: string;
		isError?: boolean;
		durationMs?: number;
	};
}) {
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		void navigator.clipboard.writeText(call.output);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [call.output]);

	const durationLabel =
		call.durationMs != null && call.durationMs > 0
			? call.durationMs >= 1000
				? `${(call.durationMs / 1000).toFixed(1)}s`
				: `${call.durationMs}ms`
			: null;

	const commandDisplay =
		call.command.length > 80
			? `${call.command.slice(0, 80)}...`
			: call.command;

	const outputLineCount = call.output ? call.output.split("\n").length : 0;

	return (
		<div className="rounded-lg transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
			>
				{/* 状态点 */}
				<div
					className={`w-2 h-2 rounded-full shrink-0 ${
						call.status === "running"
							? "bg-[#D96C46] animate-pulse"
							: call.isError
								? "bg-red-500"
								: "bg-emerald-500"
					}`}
				/>
				{/* 命令 */}
				<span className="flex-1 min-w-0 truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
					$ {commandDisplay}
				</span>
				{/* 耗时 */}
				{durationLabel && call.status !== "running" && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400/70">
						{durationLabel}
					</span>
				)}
				{/* 输出行数 */}
				{outputLineCount > 0 && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
						{outputLineCount} 行
					</span>
				)}
				{/* 展开箭头 */}
				{call.output && (
					<ChevronDown
						className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${
							expanded ? "rotate-180" : ""
						}`}
					/>
				)}
			</button>

			{/* 展开的输出 */}
			{expanded && call.output && (
				<div className="mx-2 mb-2 overflow-hidden rounded-lg border border-zinc-200/60 bg-[#1a1a2e] dark:border-zinc-700/40">
					<div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1">
						{call.description && (
							<span className="text-[10px] text-zinc-500 truncate mr-2">
								{call.description}
							</span>
						)}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								handleCopy();
							}}
							className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-300"
						>
							{copied ? (
								<Check className="h-3 w-3" />
							) : (
								<Copy className="h-3 w-3" />
							)}
						</button>
					</div>
					<pre className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.6] text-emerald-300/90 scrollbar-thin">
						{call.output.length > 5000
							? `${call.output.slice(0, 5000)}\n\n... (输出已截断)`
							: call.output}
					</pre>
				</div>
			)}
		</div>
	);
}
