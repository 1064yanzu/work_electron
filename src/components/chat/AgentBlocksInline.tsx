import type { ReactNode } from "react";
import type { ChatMessageBlock } from "../../lib/chat/types";
import { TaskListInline } from "../agent/TaskListInline";
import { ThoughtInline } from "../agent/ThoughtInline";
import { InlineImage } from "../ui/InlineImage";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { FileUpdatesGroup } from "./FileUpdatesGroup";
import { type ToolCallRef, ToolCallsGroup } from "./ToolCallsGroup";

export function AgentBlocksInline({ blocks }: { blocks: ChatMessageBlock[] }) {
	const nodes: ReactNode[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i];

		if (b.type === "file_update") {
			const updates = [b.update];
			while (i + 1 < blocks.length && blocks[i + 1]?.type === "file_update") {
				i++;
				const next = blocks[i];
				if (next.type === "file_update") updates.push(next.update);
			}
			nodes.push(
				<FileUpdatesGroup key={`file-updates-${i}`} updates={updates} />,
			);
			continue;
		}

		if (b.type === "image") {
			if (!b.path || !b.path.trim()) {
				nodes.push(null);
				continue;
			}
			nodes.push(
				<div key={i} className="w-full">
					<InlineImage path={b.path} title={b.title} />
				</div>,
			);
			continue;
		}

		if (b.type === "text") {
			if (!b.text || !b.text.trim()) {
				nodes.push(null);
				continue;
			}
			nodes.push(
				<div
					key={i}
					className="text-sm text-zinc-800 dark:text-zinc-200 leading-7 w-full overflow-hidden"
				>
					<div className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors my-1.5">
						<MarkdownRenderer content={b.text} />
					</div>
				</div>,
			);
			continue;
		}

		if (b.type === "thought") {
			if (!b.content || !b.content.trim()) {
				nodes.push(null);
				continue;
			}
			nodes.push(
				<ThoughtInline
					key={i}
					title={b.title}
					content={b.content}
					phase={b.phase}
					durationMs={b.durationMs}
				/>,
			);
			continue;
		}

		if (b.type === "task_list") {
			nodes.push(<TaskListInline key={i} taskId={b.taskId} />);
			continue;
		}

		if (b.type === "tool_call") {
			const calls: ToolCallRef[] = [
				{
					taskId: b.taskId,
					toolCallId: b.toolCallId,
					name: b.name,
					status: b.status,
					input: b.input,
					output: b.output,
					error: b.error,
				},
			];
			while (i + 1 < blocks.length && blocks[i + 1]?.type === "tool_call") {
				i++;
				const next = blocks[i] as Extract<
					ChatMessageBlock,
					{ type: "tool_call" }
				>;
				if (next.type === "tool_call") {
					calls.push({
						taskId: next.taskId,
						toolCallId: next.toolCallId,
						name: next.name,
						status: next.status,
						input: next.input,
						output: next.output,
						error: next.error,
					});
				}
			}
			nodes.push(<ToolCallsGroup key={`tool-calls-${i}`} calls={calls} />);
			continue;
		}

		// skill_execution 已在 ToolCallsGroup 中作为 skill_call 统一渲染，这里跳过避免重复
		if (b.type === "skill_execution") {
			continue;
		}

		nodes.push(null);
	}

	return <div className="flex flex-col gap-2 w-full">{nodes}</div>;
}
