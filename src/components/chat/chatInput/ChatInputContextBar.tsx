import type { ContextItem } from "../../../lib/stores/types";
import { AttachmentCard } from "../AttachmentCard";

interface ChatInputContextBarProps {
	contexts: ContextItem[];
	onRemove: (id: string) => void;
}

/** 输入框顶部上下文附件条 — 横向滚动展示已附加的资料 / 选区 / 文件 */
export function ChatInputContextBar({
	contexts,
	onRemove,
}: ChatInputContextBarProps) {
	if (contexts.length === 0) return null;

	return (
		<div className="px-4 pt-3 pb-1">
			<div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
				{contexts.map((ctx) => (
					<div key={ctx.id} className="shrink-0">
						<AttachmentCard
							variant="chip"
							file={{
								title: ctx.title,
								path: ctx.filePath || "",
								type: ctx.type === "source" ? "document" : "file",
								size: ctx.size,
								origin:
									ctx.type === "source"
										? "source"
										: ctx.type === "selection"
											? "selection"
											: "file",
								status:
									ctx.content && ctx.content.trim().length > 0 && !ctx.filePath
										? "preparing"
										: "ready",
							}}
							onRemove={() => onRemove(ctx.id)}
						/>
					</div>
				))}
			</div>
			<div className="mt-2 border-t border-warm-200/40" />
		</div>
	);
}
