/**
 * Toast 通知组件
 * 提供优雅的通知提示，替代原始的 alert()
 */
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
	type?: ToastType;
	duration?: number; // 毫秒，0 表示不自动关闭
	closable?: boolean;
}

interface ToastItem {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	closable: boolean;
}

const ToastContainer = () => {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	useEffect(() => {
		// 监听全局 toast 事件
		const handleToast = (event: CustomEvent<ToastItem>) => {
			const toast = event.detail;
			setToasts((prev) => [...prev, toast]);

			// 自动移除
			if (toast.duration > 0) {
				setTimeout(() => {
					setToasts((prev) => prev.filter((t) => t.id !== toast.id));
				}, toast.duration);
			}
		};

		window.addEventListener("show-toast" as any, handleToast);
		return () => {
			window.removeEventListener("show-toast" as any, handleToast);
		};
	}, []);

	const handleClose = (id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	};

	if (toasts.length === 0) return null;

	return (
		<div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
			{toasts.map((toast) => (
				<ToastItem
					key={toast.id}
					toast={toast}
					onClose={() => handleClose(toast.id)}
				/>
			))}
		</div>
	);
};

interface ToastItemProps {
	toast: ToastItem;
	onClose: () => void;
}

const ToastItem = ({ toast, onClose }: ToastItemProps) => {
	const [isExiting, setIsExiting] = useState(false);
	const [progress, setProgress] = useState(100);

	// 进度条动画
	useEffect(() => {
		if (toast.duration <= 0) return;

		const startTime = Date.now();
		const interval = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
			setProgress(remaining);
			if (remaining <= 0) {
				clearInterval(interval);
			}
		}, 50);

		return () => clearInterval(interval);
	}, [toast.duration]);

	const handleClose = () => {
		setIsExiting(true);
		setTimeout(onClose, 200); // 等待动画完成
	};

	const getIcon = () => {
		switch (toast.type) {
			case "success":
				return <CheckCircle2 size={18} className="text-emerald-500" />;
			case "error":
				return <XCircle size={18} className="text-red-500" />;
			case "warning":
				return <Info size={18} className="text-amber-500" />;
			default:
				return <Info size={18} className="text-blue-500" />;
		}
	};

	const getStyles = () => {
		switch (toast.type) {
			case "success":
				return {
					bg: "bg-white dark:bg-zinc-900",
					border: "border-emerald-200 dark:border-emerald-800/50",
					iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
					progress: "bg-emerald-500",
				};
			case "error":
				return {
					bg: "bg-white dark:bg-zinc-900",
					border: "border-red-200 dark:border-red-800/50",
					iconBg: "bg-red-50 dark:bg-red-900/30",
					progress: "bg-red-500",
				};
			case "warning":
				return {
					bg: "bg-white dark:bg-zinc-900",
					border: "border-amber-200 dark:border-amber-800/50",
					iconBg: "bg-amber-50 dark:bg-amber-900/30",
					progress: "bg-amber-500",
				};
			default:
				return {
					bg: "bg-white dark:bg-zinc-900",
					border: "border-blue-200 dark:border-blue-800/50",
					iconBg: "bg-blue-50 dark:bg-blue-900/30",
					progress: "bg-blue-500",
				};
		}
	};

	const styles = getStyles();

	return (
		<div
			className={`
				pointer-events-auto relative overflow-hidden
				flex items-start gap-3 p-4 rounded-xl border
				min-w-[320px] max-w-md
				shadow-[0_4px_24px_-8px_rgba(0,0,0,0.15)]
				transition-all duration-200 ease-out
				${styles.bg} ${styles.border}
				${isExiting ? "opacity-0 translate-x-8 scale-95" : "opacity-100 translate-x-0 scale-100 animate-slide-in-right"}
			`}
		>
			{/* 图标 */}
			<div
				className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${styles.iconBg}`}
			>
				{getIcon()}
			</div>

			{/* 内容 */}
			<div className="flex-1 text-sm text-zinc-800 dark:text-zinc-100 break-words pt-1">
				{toast.message}
			</div>

			{/* 关闭按钮 */}
			{toast.closable && (
				<button
					type="button"
					onClick={handleClose}
					className="flex-shrink-0 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all duration-150 hover:scale-110 active:scale-95"
				>
					<X size={14} className="text-zinc-400 dark:text-zinc-500" />
				</button>
			)}

			{/* 进度条 */}
			{toast.duration > 0 && (
				<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-100 dark:bg-zinc-800">
					<div
						className={`h-full transition-all duration-100 ease-linear ${styles.progress}`}
						style={{ width: `${progress}%` }}
					/>
				</div>
			)}
		</div>
	);
};

// Toast API
class ToastAPI {
	private container: HTMLDivElement | null = null;
	private root: any = null;

	private ensureContainer() {
		if (!this.container) {
			this.container = document.createElement("div");
			this.container.id = "toast-container";
			document.body.appendChild(this.container);
			this.root = createRoot(this.container);
			this.root.render(<ToastContainer />);
		}
	}

	show(message: string, options: ToastOptions = {}) {
		this.ensureContainer();

		const toast: ToastItem = {
			id: `toast-${Date.now()}-${Math.random()}`,
			message,
			type: options.type || "info",
			duration: options.duration ?? 3000,
			closable: options.closable ?? true,
		};

		window.dispatchEvent(new CustomEvent("show-toast", { detail: toast }));
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
