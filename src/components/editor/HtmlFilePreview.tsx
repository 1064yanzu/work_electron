import { RefreshCw } from "lucide-react";
import { memo, useCallback, useRef } from "react";
import {
	IframePreview,
	type IframePreviewHandle,
} from "../sandbox/preview/IframePreview";

interface HtmlFilePreviewProps {
	fileName: string;
	content: string;
}

/**
 * HtmlFilePreview - HTML 文件预览
 * 用 iframe srcDoc 真正渲染网页（sandbox 隔离），与"产物预览"路径共用底层 IframePreview
 */
export const HtmlFilePreview = memo(function HtmlFilePreview({
	fileName,
	content,
}: HtmlFilePreviewProps) {
	const iframeRef = useRef<IframePreviewHandle>(null);

	const handleRefresh = useCallback(() => {
		iframeRef.current?.refresh();
	}, []);

	if (!content) {
		return <p className="text-text-muted">文件内容为空。</p>;
	}

	return (
		<div className="rounded-2xl border border-border/80 overflow-hidden bg-surface shadow-[0_12px_50px_-24px_rgba(0,0,0,0.18)]">
			<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-warm-50/80">
				<div className="flex items-center gap-2 min-w-0">
					<div className="flex gap-1.5 mr-1">
						<span className="w-2.5 h-2.5 rounded-full bg-error/75" />
						<span className="w-2.5 h-2.5 rounded-full bg-peach-500/75" />
						<span className="w-2.5 h-2.5 rounded-full bg-success/75" />
					</div>
					<span className="text-xs font-medium text-text-secondary truncate">
						{fileName}
					</span>
				</div>
				<button
					type="button"
					onClick={handleRefresh}
					className="p-1.5 inline-flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-warm-200 rounded-md transition-colors"
					title="刷新"
					aria-label="刷新预览"
				>
					<RefreshCw className="w-3.5 h-3.5" />
				</button>
			</div>

			<div className="h-[70vh] min-h-[420px] bg-white dark:bg-zinc-900">
				<IframePreview
					ref={iframeRef}
					srcDoc={content}
					className="h-full"
					showEmptyOverlay={false}
				/>
			</div>
		</div>
	);
});
