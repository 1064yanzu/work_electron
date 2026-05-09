import { Loader2, Sparkles, X } from "lucide-react";

interface ReaderCardGenIndicatorProps {
	visible: boolean;
	count: number;
	onCancel?: () => void;
	onOpen?: () => void;
}

/**
 * 阅读器右下角的卡片生成进度浮窗。
 * 用户在生成期间不会被打断阅读，仍能感知进度并主动取消。
 */
export function ReaderCardGenIndicator({
	visible,
	count,
	onCancel,
	onOpen,
}: ReaderCardGenIndicatorProps) {
	if (!visible) return null;
	return (
		<div className="reader-card-gen-indicator" role="status">
			<button
				type="button"
				className="reader-card-gen-indicator__main"
				onClick={onOpen}
				title="打开卡片侧栏"
			>
				<span className="reader-card-gen-indicator__icon">
					{count > 0 ? (
						<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					) : (
						<Loader2
							className="w-3.5 h-3.5 animate-spin"
							strokeWidth={1.5}
						/>
					)}
				</span>
				<span className="reader-card-gen-indicator__text">
					{count > 0 ? `已生成 ${count} 张` : "正在生成知识卡片…"}
				</span>
			</button>
			{onCancel ? (
				<button
					type="button"
					className="reader-card-gen-indicator__cancel"
					onClick={onCancel}
					aria-label="取消生成"
					title="取消"
				>
					<X className="w-3 h-3" strokeWidth={1.5} />
				</button>
			) : null}
		</div>
	);
}
