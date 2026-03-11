import { lazy, memo, Suspense, useMemo } from "react";
import type { ChatMessage as ChatMessageType } from "../../lib/chat/types";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { AgentBlocksInline } from "./AgentBlocksInline";
import { FileChangeCard } from "./FileChangeCard";
import { ProcessingCard } from "./ProcessingCard";
import type { ChatWebPreviewData } from "./chatMessageDerivations";
import { splitAssistantMessageContent } from "./chatMessageDerivations";

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
	<div className="mb-3 rounded-2xl border border-zinc-200/70 dark:border-zinc-700/60 bg-zinc-50/70 dark:bg-zinc-800/40 p-4 text-xs text-zinc-400 dark:text-zinc-500">
		正在准备预览...
	</div>
);

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

	return (
		<div className="w-full pr-2">
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

			<div className="text-sm text-zinc-800 dark:text-zinc-200 leading-7 w-full overflow-hidden select-text">
				{canRenderAssistantByBlocks ? (
					<AgentBlocksInline
						blocks={message.metadata?.blocks ?? []}
						isStreaming={isStreaming}
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
									className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors my-1.5"
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
					<span className="inline-block w-1.5 h-4 ml-1 bg-zinc-400 animate-pulse rounded-full align-middle" />
				) : null}
			</div>
		</div>
	);
}

export const ChatMessageAssistantContent = memo(
	ChatMessageAssistantContentImpl,
	(prev, next) =>
		prev.message === next.message &&
		prev.canRenderAssistantByBlocks === next.canRenderAssistantByBlocks &&
		prev.isStreaming === next.isStreaming &&
		prev.streamingWebPreview === next.streamingWebPreview,
);
