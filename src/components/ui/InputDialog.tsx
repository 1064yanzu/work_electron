import { AlertCircle, PencilLine } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { cn } from "../../lib/utils";
import { FocusTrap } from "./FocusTrap";

export type InputDialogVariant = "default" | "danger";

export interface InputDialogOptions {
	title?: string;
	message?: string;
	placeholder?: string;
	defaultValue?: string;
	confirmText?: string;
	cancelText?: string;
	inputType?: "text" | "url" | "password";
	multiline?: boolean;
	rows?: number;
	trim?: boolean;
	variant?: InputDialogVariant;
	validate?: (value: string) => string | null | Promise<string | null>;
}

interface InputDialogProps extends InputDialogOptions {
	onClose: (value: string | null) => void;
}

function InputDialogView({
	title = "请输入内容",
	message,
	placeholder,
	defaultValue = "",
	confirmText = "确认",
	cancelText = "取消",
	inputType = "text",
	multiline = false,
	rows = 4,
	trim = true,
	variant = "default",
	validate,
	onClose,
}: InputDialogProps) {
	const [value, setValue] = useState(defaultValue);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select?.();
	}, []);

	const closeWithValue = useCallback(
		(nextValue: string | null) => {
			onClose(nextValue);
		},
		[onClose],
	);

	const handleCancel = useCallback(() => {
		closeWithValue(null);
	}, [closeWithValue]);

	const handleConfirm = useCallback(async () => {
		if (isSubmitting) return;

		const output = trim ? value.trim() : value;
		if (validate) {
			setIsSubmitting(true);
			try {
				const validationMessage = await validate(output);
				if (validationMessage) {
					setError(validationMessage);
					return;
				}
			} finally {
				setIsSubmitting(false);
			}
		}

		closeWithValue(output);
	}, [closeWithValue, isSubmitting, trim, validate, value]);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				handleCancel();
				return;
			}
			if (event.key !== "Enter") return;
			if (multiline && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				void handleConfirm();
				return;
			}
			if (multiline) return;
			event.preventDefault();
			void handleConfirm();
		},
		[handleCancel, handleConfirm, multiline],
	);

	return (
		<div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
			<button
				type="button"
				className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
				onClick={handleCancel}
				aria-label="关闭输入对话框"
			/>
			<FocusTrap
				className="relative w-full max-w-[440px] rounded-[24px] border border-cream-300 dark:border-cream-500 bg-cream-50 dark:bg-cream-900 shadow-bai-pop overflow-hidden"
				onEscape={handleCancel}
				initialFocusRef={inputRef as any}
			>
				<div className="p-6">
					<div className="flex items-start gap-4">
						<div
							className={cn(
								"mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
								variant === "danger"
									? "bg-[rgba(181,51,51,0.08)] text-error dark:bg-error/10 dark:text-error"
									: "bg-focus/8 text-focus dark:bg-focus/10 dark:text-focus",
							)}
						>
							{variant === "danger" ? (
								<AlertCircle className="h-5 w-5" />
							) : (
								<PencilLine className="h-5 w-5" />
							)}
						</div>
						<div className="min-w-0 flex-1 pt-0.5">
							<h3 className="text-[17px] font-semibold text-text-primary tracking-tight">
								{title}
							</h3>
							{message ? (
								<p className="mt-1.5 text-[13px] text-text-muted leading-relaxed">
									{message}
								</p>
							) : null}
						</div>
					</div>

					<div className="mt-6">
						{multiline ? (
							<textarea
								ref={inputRef as React.RefObject<HTMLTextAreaElement>}
								value={value}
								rows={rows}
								onChange={(event) => {
									setValue(event.target.value);
									setError(null);
								}}
								onKeyDown={onKeyDown}
								placeholder={placeholder}
								className="w-full resize-none rounded-xl border border-cream-300 dark:border-cream-500 bg-cream-100/60 dark:bg-cream-800/40 px-4 py-3 text-[14px] text-text-primary outline-none transition-all placeholder:text-text-light hover:border-cream-400 dark:hover:border-cream-500 focus:border-cream-500 focus:bg-cream-50 dark:focus:bg-cream-900 focus:shadow-[0_0_0_3px_var(--t-primary-muted)]"
							/>
						) : (
							<input
								ref={inputRef as React.RefObject<HTMLInputElement>}
								value={value}
								type={inputType}
								onChange={(event) => {
									setValue(event.target.value);
									setError(null);
								}}
								onKeyDown={onKeyDown}
								placeholder={placeholder}
								className="w-full rounded-xl border border-cream-300 dark:border-cream-500 bg-cream-100/60 dark:bg-cream-800/40 px-4 py-3 text-[14px] text-text-primary outline-none transition-all placeholder:text-text-light hover:border-cream-400 dark:hover:border-cream-500 focus:border-cream-500 focus:bg-cream-50 dark:focus:bg-cream-900 focus:shadow-[0_0_0_3px_var(--t-primary-muted)]"
							/>
						)}

						{error ? (
							<p className="mt-2.5 text-[13px] font-medium text-error flex items-center gap-1.5">
								<AlertCircle className="w-3.5 h-3.5" />
								{error}
							</p>
						) : null}
					</div>

					<div className="mt-8 flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={handleCancel}
							className="rounded-xl px-5 py-2.5 text-[14px] font-medium text-text-secondary transition-all hover:bg-black/5 dark:hover:bg-white/5"
						>
							{cancelText}
						</button>
						<button
							type="button"
							onClick={() => void handleConfirm()}
							disabled={isSubmitting}
							className={cn(
								"rounded-xl px-5 py-2.5 text-[14px] font-medium transition-all shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
								variant === "danger"
									? "bg-error text-white hover:bg-error shadow-red-500/20"
									: "bg-cream-800 text-white hover:bg-cream-900 shadow-black/10 dark:bg-cream-200 dark:text-zinc-900 dark:hover:bg-white dark:shadow-white/10",
							)}
						>
							{isSubmitting ? "处理中..." : confirmText}
						</button>
					</div>
				</div>
			</FocusTrap>
		</div>
	);
}

class InputDialogAPI {
	show(options: InputDialogOptions): Promise<string | null> {
		return new Promise((resolve) => {
			const container = document.createElement("div");
			document.body.appendChild(container);
			const root = createRoot(container);

			const handleClose = (value: string | null) => {
				root.unmount();
				container.remove();
				resolve(value);
			};

			root.render(<InputDialogView {...options} onClose={handleClose} />);
		});
	}
}

export const inputDialog = new InputDialogAPI();
