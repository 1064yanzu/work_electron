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

	const handleClose = () => {
		setIsExiting(true);
		setTimeout(onClose, 200); // 等待动画完成
	};

	const getIcon = () => {
		switch (toast.type) {
			case "success":
				return <CheckCircle2 size={18} className="text-green-500" />;
			case "error":
				return <XCircle size={18} className="text-red-500" />;
			case "warning":
				return <Info size={18} className="text-yellow-500" />;
			default:
				return <Info size={18} className="text-blue-500" />;
		}
	};

	const getBgColor = () => {
		switch (toast.type) {
			case "success":
				return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
			case "error":
				return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
			case "warning":
				return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
			default:
				return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
		}
	};

	return (
		<div
			className={`
				pointer-events-auto
				flex items-start gap-3 p-4 rounded-lg border shadow-lg
				min-w-[320px] max-w-md
				transition-all duration-200 ease-out
				${getBgColor()}
				${isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0 animate-slide-in-right"}
			`}
		>
			<div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
			<div className="flex-1 text-sm text-gray-900 dark:text-gray-100 break-words">
				{toast.message}
			</div>
			{toast.closable && (
				<button
					type="button"
					onClick={handleClose}
					className="flex-shrink-0 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors"
				>
					<X size={14} className="text-gray-500 dark:text-gray-400" />
				</button>
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

		window.dispatchEvent(
			new CustomEvent("show-toast", { detail: toast }),
		);
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
