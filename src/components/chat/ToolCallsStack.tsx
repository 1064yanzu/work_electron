import { ChevronDown, ChevronRight, Sparkles, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatMessageBlock } from "../../lib/chat/types";
import { cn } from "../../lib/utils";
import type { ToolCall } from "../../lib/agent/types";
import ToolCallInline from "../agent/ToolCallInline";

export function ToolCallsStack({
	calls,
}: {
	calls: Array<Extract<ChatMessageBlock, { type: "tool_call" }>>;
}) {
	const [open, setOpen] = useState(false);

	const summary = useMemo(() => {
		const total = calls.length;
		const running = calls.filter((c) => c.status === "running").length;
		const errored = calls.filter((c) => c.status === "error").length;
		const completed = calls.filter((c) => c.status === "completed").length;
		const pending = calls.filter((c) => c.status === "pending").length;
		const names = calls
			.map((c) => c.name)
			.filter((s): s is string => typeof s === "string" && !!s.trim())
			.slice(0, 3);
		return {
			total,
			running,
			errored,
			completed,
			pending,
			namePreview: names.join(" · "),
		};
	}, [calls]);

	const defaultOpen = summary.running > 0 || summary.errored > 0;
	const isOpen = open || defaultOpen;

	return (
		<div
			className={cn(
				"rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60",
				"bg-white/70 dark:bg-zinc-900/40 shadow-sm",
				"overflow-hidden",
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-full px-3 py-2.5 flex items-start gap-3 text-left",
					"hover:bg-white/80 dark:hover:bg-zinc-900/55 transition-colors",
				)}
			>
				<div className="mt-0.5 w-8 h-8 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-fuchsia-500/10 flex items-center justify-center">
					<Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate tracking-tight">
							工具调用
						</div>
						<div className="text-[11px] text-zinc-400 font-medium">
							{summary.total}
						</div>
						{summary.errored > 0 ? (
							<div className="flex items-center gap-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
								<XCircle className="w-3 h-3" />
								{summary.errored}
							</div>
						) : null}
						{summary.running > 0 ? (
							<div className="flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
								<span className="relative inline-flex h-2 w-2">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
									<span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
								</span>
								{summary.running}
							</div>
						) : null}
					</div>
					<div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">
						{summary.namePreview || "查看详情"}
					</div>
				</div>
				<div className="mt-1.5 text-zinc-400">
					{isOpen ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
			</button>

			{isOpen ? (
				<div className="px-3 pb-3 pt-0">
					<div className="h-px w-full bg-zinc-100 dark:bg-zinc-800/50" />
					<div className="mt-3 flex flex-col gap-2">
						{calls.map((c) => {
							const fallbackData: ToolCall | undefined = c.toolCallId
								? {
										id: c.toolCallId,
										type: (c.toolType as any) || ("custom" as any),
										name: c.name || (c.toolType as string) || "Tool",
										status: (c.status as any) || "pending",
										input: c.input || {},
										output: c.output,
										error: c.error,
									}
								: undefined;

							return (
								<ToolCallInline
									key={c.toolCallId}
									taskId={c.taskId}
									toolCallId={c.toolCallId}
									initialData={fallbackData}
									density="compact"
								/>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}
