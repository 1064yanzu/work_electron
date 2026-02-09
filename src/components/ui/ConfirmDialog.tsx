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
	})();

	const confirmButtonClass = (() => {
		const base =
			"rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
		switch (type) {
			case "danger":
				return `${base} bg-red-600 hover:bg-red-700 focus-visible:ring-red-500`;
			case "warning":
				return `${base} bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500`;
			default:
				return `${base} bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-500`;
		}
	})();

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
			<button
				type="button"
				className={cn(
					"absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity dark:bg-black/55",
					isClosing ? "opacity-0" : "opacity-100",
				)}
				onClick={() => close(false)}
				aria-label="关闭确认框"
			/>

			<FocusTrap
				className={cn(
					"relative mx-4 w-full max-w-md rounded-2xl border border-zinc-200/50 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:border-zinc-700/50 dark:bg-zinc-900",
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
				>
					<div className="p-6 pb-4">
						<div className="flex items-start gap-4">
							<div
								className={cn(
									"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
									iconConfig.bg,
								)}
							>
								{iconConfig.icon}
							</div>
							<div className="flex-1 min-w-0">
								<h3
									id="confirm-title"
									className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
								>
									{title}
								</h3>
								<p
									id="confirm-message"
									className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400"
								>
									{message}
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center justify-end gap-3 p-6 pt-2">
						<button
							type="button"
							onClick={() => close(false)}
							className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
