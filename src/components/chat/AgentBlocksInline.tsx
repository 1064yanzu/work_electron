import type { ReactNode } from "react";
import type { ChatMessageBlock } from "../../lib/chat/types";
import { TaskListInline } from "../agent/TaskListInline";
import { ThoughtInline } from "../agent/ThoughtInline";
import { InlineImage } from "../ui/InlineImage";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { FileUpdatesGroup } from "./FileUpdatesGroup";
import ToolCallInline from "../agent/ToolCallInline";
import { ToolCallsStack } from "./ToolCallsStack";
import type { ToolCall } from "../../lib/agent/types";
import { ProcessingCard } from "./ProcessingCard";
import { DiffSummary } from "../CodeView/DiffSummary";
import { useDiffStoreSelector } from "../../lib/stores/diffStore";

export function AgentBlocksInline({
	blocks,
	isStreaming = false,
	summaryTaskId,
}: {
	blocks: ChatMessageBlock[];
	isStreaming?: boolean;
	summaryTaskId?: string;
}) {
	const nodes: ReactNode[] = [];
	const activeStreamingThoughtIndex = getActiveStreamingThoughtIndex(
		blocks,
		isStreaming,
	);
	const matchingDiffCount = useDiffStoreSelector(
		(s) =>
			Object.values(s.diffs).filter(
				(diff) => !summaryTaskId || diff.taskId === summaryTaskId,
			).length,
	);

	const replaceProtocolWithMarker = (
		raw: string,
		marker: ":::update-doc" | ":::create-doc",
		placeholder: "<<<AI_UPDATE_PENDING>>>" | "<<<AI_CREATE_PENDING>>>",
	): string => {
		let s = String(raw || "");
		while (true) {
			const start = s.indexOf(marker);
			if (start < 0) break;
			const after = s.slice(start + marker.length);
			const endRel = after.indexOf(":::");
			const end = endRel >= 0 ? start + marker.length + endRel + 3 : s.length;
			s = `${s.slice(0, start)}\n${placeholder}\n${s.slice(end)}`;
		}
		return s;
	};

	const renderText = (text: string, keyBase: string) => {
		const withUpdate = replaceProtocolWithMarker(
			text,
			":::update-doc",
			"<<<AI_UPDATE_PENDING>>>",
		);
		const withCreate = replaceProtocolWithMarker(
			withUpdate,
			":::create-doc",
			"<<<AI_CREATE_PENDING>>>",
		);

		const parts = withCreate.split(
			/(<<<AI_UPDATE_PENDING>>>|<<<AI_CREATE_PENDING>>>)/,
		);

		return parts
			.map((part, idx) => {
				if (!part || !part.trim()) return null;
				if (part === "<<<AI_UPDATE_PENDING>>>") {
					return <ProcessingCard key={`${keyBase}-p-${idx}`} type="update" />;
				}
				if (part === "<<<AI_CREATE_PENDING>>>") {
					return <ProcessingCard key={`${keyBase}-p-${idx}`} type="create" />;
				}
				return (
					<div
						key={`${keyBase}-md-${idx}`}
						className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors my-1.5"
					>
						<MarkdownRenderer content={part} />
					</div>
				);
			})
			.filter(Boolean);
	};

	for (let i = 0; i < blocks.length; i++) {
		const b = blocks[i];

		if (b.type === "file_update") {
			const updates = [b.update];
			while (i + 1 < blocks.length && blocks[i + 1]?.type === "file_update") {
				i++;
				const next = blocks[i];
				if (next.type === "file_update") updates.push(next.update);
			}
			if (!isStreaming && summaryTaskId && matchingDiffCount > 0) {
				continue;
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
					className="text-sm text-text-primary dark:text-zinc-200 leading-7 w-full overflow-hidden"
				>
					{renderText(b.text, `text-${i}`)}
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
					source={b.source}
					truncated={b.truncated}
					isStreaming={i === activeStreamingThoughtIndex}
				/>,
			);
			continue;
		}

		if (b.type === "task_list") {
			nodes.push(<TaskListInline key={i} taskId={b.taskId} />);
			continue;
		}

		if (b.type === "tool_call") {
			const calls: Array<Extract<ChatMessageBlock, { type: "tool_call" }>> = [
				b,
			];
			while (i + 1 < blocks.length && blocks[i + 1]?.type === "tool_call") {
				i++;
				const next = blocks[i] as Extract<
					ChatMessageBlock,
					{ type: "tool_call" }
				>;
				if (next.type === "tool_call") {
					calls.push(next);
				}
			}
			if (calls.length === 1) {
				const c = calls[0]!;
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
				nodes.push(
					<ToolCallInline
						key={`tool-call-${c.taskId}-${c.toolCallId}`}
						taskId={c.taskId}
						toolCallId={c.toolCallId}
						initialData={fallbackData}
					/>,
				);
			} else {
				nodes.push(<ToolCallsStack key={`tool-calls-${i}`} calls={calls} />);
			}
			continue;
		}

		// skill_execution 已在 ToolCallsGroup 中作为 skill_call 统一渲染，这里跳过避免重复
		if (b.type === "skill_execution") {
			continue;
		}

		nodes.push(null);
	}

	return (
		<div className="flex flex-col gap-2 w-full">
			{nodes}
			{/* 当消息非流式输出时，显示 diff 汇总（如果有） */}
			{!isStreaming && summaryTaskId ? (
				<DiffSummary taskId={summaryTaskId} />
			) : null}
		</div>
	);
}

function getActiveStreamingThoughtIndex(
	blocks: ChatMessageBlock[],
	isStreaming: boolean,
): number | null {
	if (!isStreaming) return null;

	for (let i = blocks.length - 1; i >= 0; i--) {
		const block = blocks[i];
		if (!block) continue;
		if (block.type === "text" && !block.text.trim()) continue;
		if (block.type === "thought") {
			return block.content.trim() ? i : null;
		}
		return null;
	}

	return null;
}
