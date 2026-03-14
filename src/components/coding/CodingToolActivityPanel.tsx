import { Activity, Clock3, TerminalSquare, Wrench } from "lucide-react";
import { useMemo } from "react";
import { useCodingSessionSelector } from "../../lib/stores/codingSessionStore";

export function CodingToolActivityPanel() {
	const messages = useCodingSessionSelector((state) => state.messages);
	const toolCalls = useMemo(
		() =>
			messages
				.flatMap((message) =>
					message.toolCalls.map((toolCall) => ({
						...toolCall,
						timestamp: message.timestamp,
					})),
				)
				.sort((a, b) => b.timestamp - a.timestamp),
		[messages],
	);

	if (toolCalls.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-4 py-12">
				<Activity className="mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" />
				<p className="text-center text-xs text-zinc-400">
					当前线程还没有工具活动
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto py-2">
			{toolCalls.map((toolCall) => {
				const isBash = toolCall.name === "Bash";
				return (
					<div
						key={toolCall.id}
						className="mx-2 mb-2 rounded-xl border border-zinc-200/80 bg-white/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/70"
					>
						<div className="flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
								{isBash ? (
									<TerminalSquare className="h-4 w-4" />
								) : (
									<Wrench className="h-4 w-4" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
									{toolCall.name}
								</div>
								<div className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-400">
									<Clock3 className="h-3 w-3" />
									<span>
										{new Date(toolCall.timestamp).toLocaleTimeString([], {
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
								</div>
							</div>
							<span
								className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${toolCall.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : toolCall.status === "error" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"}`}
							>
								{toolCall.status === "completed"
									? "完成"
									: toolCall.status === "error"
										? "失败"
										: "运行中"}
							</span>
						</div>
						{isBash &&
							typeof (toolCall.input as { command?: string }).command ===
								"string" && (
								<pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 text-[11px] text-zinc-100">
									{String((toolCall.input as { command?: string }).command)}
								</pre>
							)}
					</div>
				);
			})}
		</div>
	);
}
