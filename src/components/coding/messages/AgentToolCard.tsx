/**
 * Agent 工具卡片 - 紧凑内联样式
 * 折叠态：Bot icon + Agent + agent name
 */
import { Bot } from "lucide-react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";
import { useMemo } from "react";

interface AgentToolCardProps {
	toolCall: SessionToolCall;
}

export function AgentToolCard({ toolCall }: AgentToolCardProps) {
	const input = toolCall.input;

	const agentName = (input.name as string) || "子代理";
	const description = (input.description as string) || "";
	const prompt = (input.prompt as string) || "";
	const subagentType = (input.subagent_type as string) || "";

	const title = subagentType ? `${agentName} (${subagentType})` : agentName;

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null)
			return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	return (
		<ToolCardShell
			icon={Bot}
			label="Agent"
			title={title}
			status={toolCall.status}
			isError={toolCall.isError}
			iconColor="text-violet-500"
		>
			<div className="space-y-1.5">
				{description && (
					<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
						{description}
					</p>
				)}
				{prompt && (
					<pre className="max-h-28 overflow-y-auto rounded-md bg-zinc-50 px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-zinc-600 scrollbar-thin dark:bg-zinc-900/50 dark:text-zinc-400">
						{prompt.length > 500 ? `${prompt.slice(0, 500)}...` : prompt}
					</pre>
				)}
				{output && (
					<div>
						<div className="mb-0.5 text-[10px] text-zinc-400">结果</div>
						<pre className="max-h-24 overflow-y-auto rounded-md bg-zinc-50 px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-zinc-600 scrollbar-thin dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 800)}
						</pre>
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}
