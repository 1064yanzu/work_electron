/**
 * Comment 浮动 overlay。
 *
 * 第一期:内存列表(designPreviewStore.comments) + 输入框,提交时调
 * design_apply_annotation 让 Agent 注入 follow-up。
 * 后续若加 design_list_annotations 再切换到落库列表。
 */
import { MessageSquare, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import { designApplyAnnotation } from "../../../lib/api/design";
import { designPreviewStore } from "../../../lib/stores/designPreviewStore";
import { useDesignPreviewStoreSelector } from "../../../lib/stores/designPreviewStore";
import { toast } from "../../ui/Toast";

interface DesignCommentOverlayProps {
	sessionId: string;
	runId: string | null;
	onClose: () => void;
}

export function DesignCommentOverlay({
	sessionId,
	runId,
	onClose,
}: DesignCommentOverlayProps) {
	const comments = useDesignPreviewStoreSelector((s) => s.comments);
	const inspected = useDesignPreviewStoreSelector((s) => s.inspected);
	const [selector, setSelector] = useState("");
	const [note, setNote] = useState("");
	const [sending, setSending] = useState(false);

	const effectiveSelector =
		selector.trim() ||
		(inspected
			? buildSelectorFromInspected(
					inspected.tagName,
					inspected.id,
					inspected.classes,
				)
			: "");

	const handleSubmit = async () => {
		if (!note.trim()) return;
		const finalSelector = effectiveSelector || "body";
		if (!runId) {
			toast.warning("当前没有运行中的 Agent 会话,无法提交评论");
			return;
		}
		try {
			setSending(true);
			const r = await designApplyAnnotation({
				session_id: sessionId,
				run_id: runId,
				selector: finalSelector,
				note: note.trim(),
			});
			if (!r.success) {
				toast.error(r.error ?? "提交评论失败");
				return;
			}
			designPreviewStore.addComment({
				selector: finalSelector,
				note: note.trim(),
			});
			setNote("");
			setSelector("");
			toast.success("已提交评论给 Agent");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : String(err));
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="absolute top-3.5 right-3.5 z-[5] w-80 max-h-[calc(100%-28px)] rounded-xl bg-background border border-border shadow-bai-pop overflow-hidden flex flex-col">
			<header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-surface">
				<div className="flex items-center gap-1.5 min-w-0">
					<MessageSquare
						className="w-3.5 h-3.5 text-primary shrink-0"
						strokeWidth={1.5}
					/>
					<span className="text-[11px] uppercase tracking-wider text-text-muted">
						评论
					</span>
					<span className="text-xs text-text-muted">· {comments.length}</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
					title="关闭"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2">
				{comments.length === 0 ? (
					<div className="text-[11.5px] text-text-muted leading-relaxed py-4 text-center">
						还没有评论。下面填写选择器(留空则用 Inspect 选中的元素或
						body)和评论内容, Agent 会按评论 follow-up 调整。
					</div>
				) : (
					comments
						.slice()
						.reverse()
						.map((c) => (
							<div
								key={c.id}
								className="rounded-lg border border-border bg-cream-200/40 px-2.5 py-1.5"
							>
								<div className="flex items-center justify-between gap-2">
									<code className="text-[10.5px] text-primary truncate">
										{c.selector}
									</code>
									<button
										type="button"
										onClick={() => designPreviewStore.removeComment(c.id)}
										className="p-0.5 rounded hover:bg-warm-200 text-text-muted hover:text-text-primary"
										aria-label="删除"
									>
										<Trash2 className="w-3 h-3" strokeWidth={1.6} />
									</button>
								</div>
								<div className="text-[12px] text-text-primary mt-0.5 leading-relaxed">
									{c.note}
								</div>
							</div>
						))
				)}
			</div>

			<div className="px-3 py-2 border-t border-border bg-bg-surface space-y-1.5">
				<input
					value={selector}
					onChange={(e) => setSelector(e.target.value)}
					placeholder={
						inspected
							? `留空使用选中元素 (${effectiveSelector})`
							: "选择器(可选,默认 body)"
					}
					className="w-full h-7 px-2 rounded-md border border-border bg-background text-[11.5px] text-text-primary placeholder:text-text-light focus:outline-none focus:border-primary/40 font-mono"
				/>
				<div className="flex items-end gap-1.5">
					<textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						placeholder="评论内容,例如「这里间距太紧」"
						rows={2}
						className="flex-1 min-h-[44px] max-h-24 px-2 py-1.5 rounded-md border border-border bg-background text-[12px] text-text-primary placeholder:text-text-light focus:outline-none focus:border-primary/40 resize-none"
					/>
					<button
						type="button"
						onClick={() => void handleSubmit()}
						disabled={!note.trim() || sending}
						className="h-7 px-2 rounded-md bg-primary text-white text-[11.5px] inline-flex items-center gap-1 disabled:opacity-50 hover:bg-primary/90 transition-colors"
						title="提交评论"
					>
						<Send className="w-3 h-3" strokeWidth={1.8} />
						提交
					</button>
				</div>
			</div>
		</div>
	);
}

function buildSelectorFromInspected(
	tag: string,
	id: string,
	classes: string[],
): string {
	if (id) return `#${id}`;
	if (classes.length > 0) return `${tag}.${classes.slice(0, 2).join(".")}`;
	return tag;
}
