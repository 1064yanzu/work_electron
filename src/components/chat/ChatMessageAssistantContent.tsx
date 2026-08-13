import { lazy, memo, Suspense, useMemo } from "react";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { AgentBlocksInline } from "./AgentBlocksInline";
import { FileChangeCard } from "./FileChangeCard";
import { ProcessingCard } from "./ProcessingCard";
import type { ChatWebPreviewData } from "./chatMessageDerivations";
import { splitAssistantMessageContent } from "./chatMessageDerivations";
import {
	usePlanModeSelector,
	confirmPlan,
	rejectPlan,
} from "../../lib/agent/planModeStore";
import { emitPlanModifyFeedback } from "../../lib/agent/planModifyEvent";
import { PlanCard } from "../agent/PlanCard";

const LazyWebPreviewCard = lazy(async () => {
	const mod = await import("./WebPreviewCard");
	return { default: mod.WebPreviewCard };
});

interface ChatMessageAssistantContentProps {
	message: ChatMessageType;
	canRenderAssistantByBlocks: boolean;
	isStreaming: boolean;
	streamingWebPreview: ChatWebPreviewData | null;
}

const PREVIEW_LOADING_FALLBACK = (
	<div className="mb-3 rounded-2xl border border-border/70 bg-warm-50/70 p-4 text-xs text-text-light">
		正在准备预览...
	</div>
);

/**
 * Plan 卡片挂载点：把 planModeStore 的订阅限制在「确实含 ```plan 代码块」的
 * 消息上，避免整条会话的助手消息集体订阅同一个 store。
 */
function PlanCardSlot() {
	const currentPlan = usePlanModeSelector((s) => s.currentPlan);
	if (!currentPlan) return null;

	return (
		<div className="mb-3">
			<PlanCard
				plan={currentPlan}
				onConfirm={() => confirmPlan()}
				onReject={() => rejectPlan()}
				onModify={(feedback) => emitPlanModifyFeedback(feedback)}
			/>
		</div>
	);
}

function ChatMessageAssistantContentImpl({
	message,
	canRenderAssistantByBlocks,
	isStreaming,
	streamingWebPreview,
}: ChatMessageAssistantContentProps) {
	const messageSegments = useMemo(
		() => splitAssistantMessageContent(message.content),
		[message.content],
	);
	const sandboxDir =
		typeof (message.metadata as Record<string, unknown> | undefined)
			?.sandboxDir === "string"
			? ((message.metadata as Record<string, unknown>).sandboxDir as string)
			: undefined;
	const hasInlineFileUpdateMarker =
		message.content.includes("<<<<AI_UPDATE_DONE>>>>") ||
		message.content.includes("<<<<AI_CREATE_DONE>>>>");
	const fallbackFileUpdates = useMemo(() => {
		if (canRenderAssistantByBlocks || hasInlineFileUpdateMarker) {
			return [];
		}

		if (Array.isArray(message.metadata?.fileUpdates)) {
			return message.metadata.fileUpdates;
		}

		if (!Array.isArray(message.metadata?.blocks)) {
			return [];
		}

		return message.metadata.blocks.flatMap((block) =>
			block.type === "file_update" ? [block.update] : [],
		);
	}, [
		canRenderAssistantByBlocks,
		hasInlineFileUpdateMarker,
		message.metadata?.blocks,
		message.metadata?.fileUpdates,
	]);

	// Plan Mode：只有真的含 ```plan 代码块的消息才挂载 PlanCardSlot。
	// 订阅收在 slot 内部——原先这里直接调 usePlanModeSelector，等于会话里**每一条**
	// 助手消息都订阅了 planModeStore，currentPlan 一变全部重渲染（memo 拦不住 Hook 订阅）。
	const hasPlanBlock = message.content.includes("```plan");

	return (
		<div className="w-full pr-2">
			{hasPlanBlock ? <PlanCardSlot /> : null}

			{streamingWebPreview ? (
				<Suspense fallback={PREVIEW_LOADING_FALLBACK}>
					<LazyWebPreviewCard
						kind={streamingWebPreview.kind}
						title={
							streamingWebPreview.kind === "react" ? "React 预览" : "前端预览"
						}
						html={
							streamingWebPreview.kind === "html"
								? streamingWebPreview.html
								: undefined
						}
						jsx={
							streamingWebPreview.kind === "react"
								? streamingWebPreview.jsx
								: undefined
						}
						css={streamingWebPreview.css}
						js={
							streamingWebPreview.kind === "html"
								? streamingWebPreview.js
								: undefined
						}
						isStreaming
					/>
				</Suspense>
			) : null}

			<div className="text-sm text-text-primary leading-7 w-full overflow-hidden select-text">
				{canRenderAssistantByBlocks ? (
					<AgentBlocksInline
						blocks={message.metadata?.blocks ?? []}
						isStreaming={isStreaming}
						summaryTaskId={message.metadata?.taskId}
					/>
				) : (
					<>
						{messageSegments.map((segment, index) => {
							if (segment.kind === "processing") {
								return (
									<ProcessingCard
										key={`processing-${index}`}
										type={segment.action}
									/>
								);
							}
							if (segment.kind === "file_update") {
								const update = message.metadata?.fileUpdates?.find(
									(item) => item.type === segment.updateType,
								);
								return update ? (
									<FileChangeCard key={`update-${index}`} update={update} />
								) : null;
							}
							return (
								<div
									key={`markdown-${index}`}
									className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-primary hover:prose-a:text-primary-hover transition-colors my-1.5"
								>
									<MarkdownRenderer
										content={segment.content}
										isStreaming={isStreaming}
										sandboxDir={sandboxDir}
									/>
								</div>
							);
						})}
					</>
				)}

				{!canRenderAssistantByBlocks
					? fallbackFileUpdates.map((update, index) => (
							<FileChangeCard
								key={`fallback-file-update-${index}`}
								update={update}
							/>
						))
					: null}

				{isStreaming && !message.content.includes("<<<<") ? (
					<span className="inline-block w-1.5 h-4 ml-1 bg-text-muted animate-pulse rounded-full align-middle" />
				) : null}
			</div>
		</div>
	);
}

// 逐字段 `===` 与 memo 默认浅比较等价，去掉这份易腐化的清单。
export const ChatMessageAssistantContent = memo(
	ChatMessageAssistantContentImpl,
);
