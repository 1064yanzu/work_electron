import { AlertTriangle, Info } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { cn } from "../../lib/utils";
import { FocusTrap } from "./FocusTrap";

export interface ConfirmOptions {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	type?: "danger" | "warning" | "info";
	onConfirm?: () => void | Promise<void>;
	onCancel?: () => void | Promise<void>;
}

interface ConfirmDialogProps extends ConfirmOptions {
	onClose: (confirmed: boolean) => void;
}

function ConfirmDialogView({
	title = "确认操作",
	message,
	confirmText = "确认",
	cancelText = "取消",
	type = "info",
	onClose,
}: ConfirmDialogProps) {
	const [isClosing, setIsClosing] = useState(false);
	const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

	useEffect(() => {
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "";
		};
	}, []);

	const close = (confirmed: boolean) => {
		setIsClosing(true);
		window.setTimeout(() => onClose(confirmed), 150);
	};

	const iconConfig = (() => {
		switch (type) {
			case "danger":
				return {
					icon: (
						<AlertTriangle size={20} className="text-error dark:text-error" />
					),
					bg: "bg-[rgba(181,51,51,0.08)] dark:bg-error/10",
				};
			case "warning":
				return {
					icon: (
						<AlertTriangle
							size={20}
							className="text-peach-500 dark:text-amber-400"
						/>
					),
					bg: "bg-peach-100 dark:bg-peach-500/10",
				};
			default:
				return {
					icon: <Info size={20} className="text-focus dark:text-focus" />,
					bg: "bg-focus/8 dark:bg-focus/10",
				};
		}
	})();

	const confirmButtonClass = (() => {
		const base =
			"rounded-xl px-5 py-2.5 text-[14px] font-medium transition-[color,background-color,border-color,opacity,box-shadow,transform] shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";
		switch (type) {
			case "danger":
				return `${base} bg-error text-white hover:bg-error shadow-red-500/20`;
			case "warning":
				return `${base} bg-peach-500 text-white hover:bg-peach-500 shadow-amber-500/20`;
			default:
				return `${base} bg-cream-800 text-white hover:bg-cream-900 shadow-black/10 dark:bg-cream-200 dark:text-cream-900 dark:hover:bg-white dark:shadow-white/10`;
		}
	})();

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
			<button
				type="button"
				className={cn(
					"absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity",
					isClosing ? "opacity-0" : "opacity-100",
				)}
				onClick={() => close(false)}
				aria-label="关闭确认框"
			/>

			<FocusTrap
				className={cn(
					"relative w-full max-w-[440px] rounded-3xl border border-cream-300 dark:border-cream-500 bg-cream-50 dark:bg-cream-900 shadow-bai-pop overflow-hidden",
					"transition-[opacity,transform] duration-150",
					isClosing ? "scale-[0.98] opacity-0" : "opacity-100",
				)}
				onEscape={() => close(false)}
				initialFocusRef={confirmButtonRef}
			>
				<div
					role="alertdialog"
					aria-modal="true"
					aria-labelledby="confirm-title"
					aria-describedby="confirm-message"
					className="p-6"
				>
					<div className="flex items-start gap-4">
						<div
							className={cn(
								"mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
								iconConfig.bg,
							)}
						>
							{iconConfig.icon}
						</div>
						<div className="flex-1 min-w-0 pt-0.5">
							<h3
								id="confirm-title"
								className="text-[17px] font-semibold text-text-primary tracking-tight"
							>
								{title}
							</h3>
							<p
								id="confirm-message"
								className="mt-1.5 whitespace-pre-wrap text-[14px] text-text-secondary leading-relaxed"
							>
								{message}
							</p>
						</div>
					</div>

					<div className="mt-8 flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={() => close(false)}
							className="rounded-xl px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-[color,background-color,border-color,opacity,box-shadow,transform] hover:bg-black/5 dark:hover:bg-white/5"
						>
							{cancelText}
						</button>
						<button
							ref={confirmButtonRef}
							type="button"
							onClick={() => close(true)}
							className={confirmButtonClass}
						>
							{confirmText}
						</button>
					</div>
				</div>
			</FocusTrap>
		</div>
	);
}

class ConfirmAPI {
	show(options: ConfirmOptions): Promise<boolean> {
		return new Promise((resolve) => {
			const container = document.createElement("div");
			document.body.appendChild(container);
			const root = createRoot(container);

			const handleClose = async (confirmed: boolean) => {
				try {
					if (confirmed) {
						await options.onConfirm?.();
					} else {
						await options.onCancel?.();
					}
				} finally {
					root.unmount();
					container.remove();
					resolve(confirmed);
				}
			};

			root.render(<ConfirmDialogView {...options} onClose={handleClose} />);
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
