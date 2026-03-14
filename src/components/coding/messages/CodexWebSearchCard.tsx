/**
 * Codex Web 搜索卡片 - 使用统一 ToolCardShell（Zed 风格）
 */
import { Globe } from "lucide-react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";

interface CodexWebSearchCardProps {
	toolCall: SessionToolCall;
}

export function CodexWebSearchCard({ toolCall }: CodexWebSearchCardProps) {
	const output = toolCall.output as { query?: string } | undefined;
	const query = output?.query ?? (toolCall.input.query as string) ?? "";

	return (
		<ToolCardShell
			icon={Globe}
			label="Web 搜索"
			title={query || "搜索中..."}
			status={toolCall.status}
			isError={toolCall.isError}
			iconColor="text-blue-500"
		>
			{query && (
				<div>
					<div className="text-[10px] text-zinc-400 mb-1">搜索查询</div>
					<p className="text-xs text-zinc-600 dark:text-zinc-400">{query}</p>
				</div>
			)}
		</ToolCardShell>
	);
}
