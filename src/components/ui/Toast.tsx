import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";
export type ToastActionVariant = "default" | "primary" | "danger";

export interface ToastOptions {
	type?: ToastType;
	duration?: number;
	closable?: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant?: ToastActionVariant;
}

interface ToastItem {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	closable: boolean;
	actionLabel?: string;
	onAction?: () => void | Promise<void>;
	actionVariant: ToastActionVariant;
}

const TOAST_EVENT_NAME = "show-toast";

function getToastStyles(type: ToastType) {
	switch (type) {
		case "success":
			return {
				border: "border-emerald-200 dark:border-emerald-800/50",
				iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
				icon: <CheckCircle2 size={18} className="text-emerald-500" />,
				progress: "bg-emerald-500",
			};
		case "error":
			return {
				border: "border-red-200 dark:border-red-800/50",
				iconBg: "bg-red-50 dark:bg-red-900/30",
				icon: <XCircle size={18} className="text-red-500" />,
				progress: "bg-red-500",
			};
		case "warning":
			return {
				border: "border-amber-200 dark:border-amber-800/50",
				iconBg: "bg-amber-50 dark:bg-amber-900/30",
				icon: <Info size={18} className="text-amber-500" />,
				progress: "bg-amber-500",
			};
		default:
			return {
				border: "border-blue-200 dark:border-blue-800/50",
				iconBg: "bg-blue-50 dark:bg-blue-900/30",
				icon: <Info size={18} className="text-blue-500" />,
				progress: "bg-blue-500",
			};
	}
}

function getActionClass(variant: ToastActionVariant) {
	switch (variant) {
		case "primary":
			return "bg-blue-500 text-white hover:bg-blue-600";
		case "danger":
			return "bg-red-500 text-white hover:bg-red-600";
		default:
			return "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";
	}
}

function ToastContainer() {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const timersRef = useRef<Map<string, number>>(new Map());

	useEffect(() => {
		const handleToast = (event: Event) => {
			const custom = event as CustomEvent<ToastItem>;
			const nextToast = custom.detail;
			setToasts((prev) => [...prev, nextToast]);

			if (nextToast.duration > 0) {
				const timer = window.setTimeout(() => {
					setToasts((prev) => prev.filter((item) => item.id !== nextToast.id));
					timersRef.current.delete(nextToast.id);
				}, nextToast.duration);
				timersRef.current.set(nextToast.id, timer);
			}
		};

		window.addEventListener(TOAST_EVENT_NAME, handleToast);
		return () => {
			window.removeEventListener(TOAST_EVENT_NAME, handleToast);
			for (const timer of timersRef.current.values()) {
				window.clearTimeout(timer);
			}
			timersRef.current.clear();
		};
	}, []);

	const handleClose = (id: string) => {
		const timer = timersRef.current.get(id);
		if (timer) {
			window.clearTimeout(timer);
			timersRef.current.delete(id);
		}
		setToasts((prev) => prev.filter((item) => item.id !== id));
	};

	if (toasts.length === 0) return null;

	return (
		<div
			className="pointer-events-none fixed right-4 top-4 z-[9999] flex max-w-[min(92vw,420px)] flex-col gap-2"
			aria-live="polite"
			aria-atomic="false"
		>
			{toasts.map((item) => (
				<ToastItemView
					key={item.id}
					toast={item}
					onClose={() => handleClose(item.id)}
				/>
			))}
		</div>
	);
}

function ToastItemView({
	toast: item,
	onClose,
}: {
	toast: ToastItem;
	onClose: () => void;
}) {
	const [isExiting, setIsExiting] = useState(false);
	const [progress, setProgress] = useState(100);

	useEffect(() => {
		if (item.duration <= 0) return;
		const start = Date.now();
		const timer = window.setInterval(() => {
			const elapsed = Date.now() - start;
			const percentage = Math.max(0, 100 - (elapsed / item.duration) * 100);
			setProgress(percentage);
			if (percentage <= 0) {
				window.clearInterval(timer);
			}
		}, 50);
		return () => window.clearInterval(timer);
	}, [item.duration]);

	const styles = getToastStyles(item.type);

	const closeWithMotion = () => {
		setIsExiting(true);
		window.setTimeout(onClose, 180);
	};

	return (
		<div
			role="status"
			className={cn(
				"pointer-events-auto relative overflow-hidden rounded-xl border bg-white p-4 shadow-[0_6px_28px_-10px_rgba(0,0,0,0.2)] dark:bg-zinc-900",
				"transition-[opacity,transform] duration-200 ease-out",
				isExiting ? "translate-x-4 scale-[0.98] opacity-0" : "opacity-100",
				styles.border,
			)}
		>
			<div className="flex items-start gap-3">
				<div
					className={cn(
						"mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
						styles.iconBg,
					)}
				>
					{styles.icon}
				</div>

				<div className="min-w-0 flex-1">
					<div className="break-words pt-0.5 text-sm text-zinc-800 dark:text-zinc-100">
						{item.message}
					</div>
					{item.actionLabel && item.onAction ? (
						<div className="mt-2">
							<button
								type="button"
								onClick={async () => {
									await item.onAction?.();
									closeWithMotion();
								}}
								className={cn(
									"rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
									getActionClass(item.actionVariant),
								)}
							>
								{item.actionLabel}
							</button>
						</div>
					) : null}
				</div>

				{item.closable ? (
					<button
						type="button"
						onClick={closeWithMotion}
						aria-label="关闭通知"
						className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
					>
						<X size={14} />
					</button>
				) : null}
			</div>

			{item.duration > 0 ? (
				<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-100 dark:bg-zinc-800">
					<div
						className={cn("h-full transition-[width] duration-75", styles.progress)}
						style={{ width: `${progress}%` }}
					/>
				</div>
			) : null}
		</div>
	);
}

class ToastAPI {
	private container: HTMLDivElement | null = null;
	private root: ReturnType<typeof createRoot> | null = null;

	private ensureContainer() {
		if (this.container) return;
		this.container = document.createElement("div");
		this.container.id = "toast-container";
		document.body.appendChild(this.container);
		this.root = createRoot(this.container);
		this.root.render(<ToastContainer />);
	}

	show(message: string, options: ToastOptions = {}) {
		this.ensureContainer();
		const id =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const payload: ToastItem = {
			id,
			message,
			type: options.type || "info",
			duration: options.duration ?? 3000,
			closable: options.closable ?? true,
			actionLabel: options.actionLabel,
			onAction: options.onAction,
			actionVariant: options.actionVariant ?? "default",
		};
		window.dispatchEvent(new CustomEvent(TOAST_EVENT_NAME, { detail: payload }));
	}

	success(message: string, duration = 3000) {
		this.show(message, { type: "success", duration });
	}

	error(message: string, duration = 5000) {
		this.show(message, { type: "error", duration });
	}

	info(message: string, duration = 3000) {
		this.show(message, { type: "info", duration });
	}

	warning(message: string, duration = 4000) {
		this.show(message, { type: "warning", duration });
	}
}

export const toast = new ToastAPI();
