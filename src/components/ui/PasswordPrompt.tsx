/**
 * 密码输入对话框组件
 * 用于加密备份的密码输入
 */
import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { createRoot } from "react-dom/client";

export interface PasswordPromptOptions {
	title?: string;
	message?: string;
	confirmText?: string;
	cancelText?: string;
	placeholder?: string;
	requireConfirmation?: boolean; // 是否需要确认密码
	validateStrength?: boolean; // 是否验证密码强度
}

interface PasswordPromptProps extends PasswordPromptOptions {
	onClose: (password: string | null) => void;
}

const PasswordPrompt = ({
	title = "输入加密密码",
	message = "请输入用于加密备份的密码",
	confirmText = "确认",
	cancelText = "取消",
	placeholder = "输入密码",
	requireConfirmation = false,
	validateStrength = true,
	onClose,
}: PasswordPromptProps) => {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [error, setError] = useState("");

	const validatePassword = (pwd: string): string | null => {
		if (!validateStrength) return null;

		if (pwd.length < 8) {
			return "密码长度至少为 8 个字符";
		}

		if (pwd.length > 128) {
			return "密码长度不能超过 128 个字符";
		}

		const hasUpperCase = /[A-Z]/.test(pwd);
		const hasLowerCase = /[a-z]/.test(pwd);
		const hasNumber = /[0-9]/.test(pwd);
		const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

		const complexityScore = [hasUpperCase, hasLowerCase, hasNumber, hasSpecial].filter(
			Boolean,
		).length;

		if (complexityScore < 2) {
			return "密码建议包含大小写字母、数字和特殊字符中的至少两种";
		}

		return null;
	};

	const handleConfirm = () => {
		setError("");

		if (!password) {
			setError("密码不能为空");
			return;
		}

		const validationError = validatePassword(password);
		if (validationError) {
			setError(validationError);
			return;
		}

		if (requireConfirmation && password !== confirmPassword) {
			setError("两次输入的密码不一致");
			return;
		}

		onClose(password);
	};

	const handleCancel = () => {
		onClose(null);
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleConfirm();
		} else if (e.key === "Escape") {
			handleCancel();
		}
	};

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 animate-fade-in">
			<div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in">
				{/* Header */}
				<div className="p-6 pb-4">
					<div className="flex items-start gap-4">
						<div className="flex-shrink-0 mt-0.5">
							<Lock size={24} className="text-blue-500" />
						</div>
						<div className="flex-1 min-w-0">
							<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
								{title}
							</h3>
							<p className="text-sm text-gray-600 dark:text-gray-400">
								{message}
							</p>
						</div>
					</div>
				</div>

				{/* Content */}
				<div className="px-6 pb-4 space-y-4">
					{/* 密码输入 */}
					<div>
						<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							密码
						</label>
						<div className="relative">
							<input
								type={showPassword ? "text" : "password"}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								onKeyPress={handleKeyPress}
								placeholder={placeholder}
								autoFocus
								className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
							>
								{showPassword ? (
									<EyeOff size={16} className="text-gray-500" />
								) : (
									<Eye size={16} className="text-gray-500" />
								)}
							</button>
						</div>
					</div>

					{/* 确认密码 */}
					{requireConfirmation && (
						<div>
							<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
								确认密码
							</label>
							<div className="relative">
								<input
									type={showConfirm ? "text" : "password"}
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									onKeyPress={handleKeyPress}
									placeholder="再次输入密码"
									className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<button
									type="button"
									onClick={() => setShowConfirm(!showConfirm)}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
								>
									{showConfirm ? (
										<EyeOff size={16} className="text-gray-500" />
									) : (
										<Eye size={16} className="text-gray-500" />
									)}
								</button>
							</div>
						</div>
					)}

					{/* 错误提示 */}
					{error && (
						<div className="text-sm text-red-500 dark:text-red-400">
							{error}
						</div>
					)}

					{/* 密码强度提示 */}
					{validateStrength && password && !error && (
						<div className="text-xs text-gray-500 dark:text-gray-400">
							💡 建议：使用至少 8 个字符，包含大小写字母、数字和特殊字符
						</div>
					)}
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
						disabled={!password || (requireConfirmation && !confirmPassword)}
						className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	);
};

// Password Prompt API
class PasswordPromptAPI {
	show(options: PasswordPromptOptions = {}): Promise<string | null> {
		return new Promise((resolve) => {
			const container = document.createElement("div");
			document.body.appendChild(container);
			const root = createRoot(container);

			const handleClose = (password: string | null) => {
				root.unmount();
				document.body.removeChild(container);
				resolve(password);
			};

			root.render(<PasswordPrompt {...options} onClose={handleClose} />);
		});
	}

	async promptForEncryption(): Promise<string | null> {
		return this.show({
			title: "设置加密密码",
			message: "请设置用于加密备份的密码，此密码将用于保护您的数据安全。",
			requireConfirmation: true,
			validateStrength: true,
		});
	}

	async promptForDecryption(): Promise<string | null> {
		return this.show({
			title: "输入解密密码",
			message: "此备份已加密，请输入密码以解密恢复数据。",
			requireConfirmation: false,
			validateStrength: false,
		});
	}
}

export const passwordPrompt = new PasswordPromptAPI();
