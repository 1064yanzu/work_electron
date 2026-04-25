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
				className="absolute inset-0 bg-black/35 dark:bg-black/55 backdrop-blur-sm"
				onClick={handleCancel}
				aria-label="关闭输入对话框"
			/>
			<FocusTrap
				className="relative w-full max-w-lg rounded-2xl border border-border/60/70 bg-surface/95/95 shadow-[0_24px_48px_-18px_rgba(0,0,0,0.3)]"
				onEscape={handleCancel}
				initialFocusRef={inputRef as any}
			>
				<div className="p-6 pb-4">
					<div className="flex items-start gap-3">
						<div
							className={cn(
								"mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
								variant === "danger"
									? "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300"
									: "bg-warm-200 text-text-secondary",
							)}
						>
							{variant === "danger" ? (
								<AlertCircle className="h-4 w-4" />
							) : (
								<PencilLine className="h-4 w-4" />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<h3 className="text-base font-semibold text-text-primary">
								{title}
							</h3>
							{message ? (
								<p className="mt-1 text-sm text-text-muted">{message}</p>
							) : null}
						</div>
					</div>
				</div>

				<div className="px-6 pb-4">
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
							className="w-full resize-none rounded-xl border border-border bg-warm-50 px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-zinc-300 focus:bg-surface focus:ring-2 focus:ring-zinc-300/50/70 dark:focus:border-zinc-600 dark:focus:bg-dark-surface dark:focus:ring-zinc-700"
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
							className="w-full rounded-xl border border-border bg-warm-50 px-3 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-zinc-300 focus:bg-surface focus:ring-2 focus:ring-zinc-300/50/70 dark:focus:border-zinc-600 dark:focus:bg-dark-surface dark:focus:ring-zinc-700"
						/>
					)}

					{error ? (
						<p className="mt-2 text-xs text-red-500 dark:text-red-400">
							{error}
						</p>
					) : null}
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/60 bg-warm-50/70 px-6 py-4/60/70">
					<button
						type="button"
						onClick={handleCancel}
						className="rounded-lg px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-warm-200 hover:text-text-primary"
					>
						{cancelText}
					</button>
					<button
						type="button"
						onClick={() => void handleConfirm()}
						disabled={isSubmitting}
						className={cn(
							"rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60",
							variant === "danger"
								? "bg-red-600 hover:bg-red-700"
								: "bg-dark-muted hover:bg-dark-surface dark:hover:bg-surface",
						)}
					>
						{isSubmitting ? "处理中..." : confirmText}
					</button>
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
