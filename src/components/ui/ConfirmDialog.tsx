/**
 * 确认对话框组件
 * 提供优雅的确认提示，替代原始的 confirm()
 */
import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { cn } from "../../lib/utils";

export interface ConfirmOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	type?: "danger" | "warning" | "info";
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void;
}

interface ConfirmDialogProps extends ConfirmOptions {
	onClose: (confirmed: boolean) => void;
}

const ConfirmDialog = ({
	title = "确认操作",
	message,
	confirmText = "确认",
	cancelText = "取消",
	type = "info",
	onClose,
}: ConfirmDialogProps) => {
	// ESC 键关闭
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose(false);
			}
		},
		[onClose],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
		};
	}, [handleKeyDown]);

	const handleConfirm = async () => {
		onClose(true);
	};

	const handleCancel = () => {
		onClose(false);
	};

	const getIconConfig = () => {
		switch (type) {
			case "danger":
				return {
					icon: <AlertTriangle size={20} className="text-red-500" />,
					bg: "bg-red-50 dark:bg-red-900/30",
				};
			case "warning":
				return {
					icon: <AlertTriangle size={20} className="text-amber-500" />,
					bg: "bg-amber-50 dark:bg-amber-900/30",
				};
			default:
				return {
					icon: <Info size={20} className="text-blue-500" />,
					bg: "bg-blue-50 dark:bg-blue-900/30",
				};
		}
	};

	const getConfirmButtonClass = () => {
		const base =
			"px-4 py-2 text-sm font-medium text-white rounded-xl transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
		switch (type) {
			case "danger":
				return `${base} bg-red-500 hover:bg-red-600 focus-visible:ring-red-500`;
			case "warning":
				return `${base} bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500`;
			default:
				return `${base} bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-500`;
		}
	};

	const iconConfig = getIconConfig();

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			aria-describedby="confirm-message"
		>
			{/* 遮罩层 */}
			<div
				className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm animate-fade-in"
				onClick={handleCancel}
				onKeyDown={() => { }}
			/>

			{/* 对话框 */}
			<div
				className={cn(
					"relative bg-white dark:bg-zinc-900 rounded-2xl",
					"shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
					"border border-zinc-200/50 dark:border-zinc-700/50",
					"max-w-md w-full mx-4",
					"animate-scale-in",
				)}
			>
				{/* Header */}
				<div className="p-6 pb-4">
					<div className="flex items-start gap-4">
						{/* 图标容器 */}
						<div
							className={cn(
								"flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
								iconConfig.bg,
							)}
						>
							{iconConfig.icon}
						</div>

						{/* 内容 */}
						<div className="flex-1 min-w-0">
							<h3
								id="confirm-title"
								className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2"
							>
								{title}
							</h3>
							<p
								id="confirm-message"
								className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap"
							>
								{message}
							</p>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="p-6 pt-2 flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={handleCancel}
						className={cn(
							"px-4 py-2 text-sm font-medium rounded-xl",
							"text-zinc-700 dark:text-zinc-300",
							"bg-zinc-100 dark:bg-zinc-800",
							"hover:bg-zinc-200 dark:hover:bg-zinc-700",
							"transition-all duration-150",
							"hover:scale-[1.02] active:scale-[0.98]",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
						)}
					>
						{cancelText}
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						className={getConfirmButtonClass()}
						autoFocus
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	);
};

// Confirm API
class ConfirmAPI {
	show(options: ConfirmOptions): Promise<boolean> {
		return new Promise((resolve) => {
			const container = document.createElement("div");
			document.body.appendChild(container);
			const root = createRoot(container);

			const handleClose = (confirmed: boolean) => {
				root.unmount();
				document.body.removeChild(container);
				resolve(confirmed);
			};

			root.render(<ConfirmDialog {...options} onClose={handleClose} />);
		});
	}

	async danger(message: string, title = "危险操作"): Promise<boolean> {
		return this.show({
			title,
			message,
			type: "danger",
			confirmText: "确认删除",
			cancelText: "取消",
		});
	}

	async warning(message: string, title = "警告"): Promise<boolean> {
		return this.show({
			title,
			message,
			type: "warning",
		});
	}
}

export const confirmDialog = new ConfirmAPI();
