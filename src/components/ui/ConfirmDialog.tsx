/**
 * 确认对话框组件
 * 提供优雅的确认提示，替代原始的 confirm()
 */
import { AlertTriangle } from "lucide-react";
import { createRoot } from "react-dom/client";

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
	const handleConfirm = async () => {
		onClose(true);
	};

	const handleCancel = () => {
		onClose(false);
	};

	const getIcon = () => {
		switch (type) {
			case "danger":
				return <AlertTriangle size={24} className="text-red-500" />;
			case "warning":
				return <AlertTriangle size={24} className="text-yellow-500" />;
			default:
				return <AlertTriangle size={24} className="text-blue-500" />;
		}
	};

	const getConfirmButtonClass = () => {
		switch (type) {
			case "danger":
				return "bg-red-500 hover:bg-red-600 focus:ring-red-500";
			case "warning":
				return "bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-500";
			default:
				return "bg-blue-500 hover:bg-blue-600 focus:ring-blue-500";
		}
	};

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-fade-in">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in">
				{/* Header */}
				<div className="p-6 pb-4">
					<div className="flex items-start gap-4">
						<div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
						<div className="flex-1 min-w-0">
							<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
								{title}
							</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
								{message}
							</p>
						</div>
					</div>
				</div>

				{/* Actions */}
				<div className="p-6 pt-4 flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={handleCancel}
						className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
					>
						{cancelText}
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${getConfirmButtonClass()}`}
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
