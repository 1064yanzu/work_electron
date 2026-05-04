/**
 * AddressBar - 可编辑地址栏
 * 支持回车跳转、自动补全协议、安全图标显示
 */

import { Lock, Unlock } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface AddressBarProps {
	url: string;
	onNavigate: (url: string) => void;
	disabled?: boolean;
}

/** 补全协议前缀 */
function ensureProtocol(url: string): string {
	const trimmed = url.trim();
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	// 本地预览通常走 http
	return `http://${trimmed}`;
}

/** 判断 URL 是否在预览服务器域内（localhost / 127.0.0.1） */
function isLocalPreview(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "localhost" ||
			parsed.hostname === "127.0.0.1" ||
			parsed.hostname === "::1"
		);
	} catch {
		return false;
	}
}

/** 判断是否使用 HTTPS */
function isSecure(url: string): boolean {
	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}

export function AddressBar({ url, onNavigate, disabled }: AddressBarProps) {
	const [inputValue, setInputValue] = useState(url);
	const [isFocused, setIsFocused] = useState(false);

	// 外部 url 变化时同步到输入框
	const displayUrl = isFocused ? inputValue : url;

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const finalUrl = ensureProtocol(inputValue);
			if (finalUrl) onNavigate(finalUrl);
		},
		[inputValue, onNavigate],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Escape") {
				setInputValue(url);
				(e.target as HTMLInputElement).blur();
			}
		},
		[url],
	);

	const isLocal = isLocalPreview(url);
	const secure = isSecure(url);

	return (
		<form
			onSubmit={handleSubmit}
			className={cn(
				"flex-1 flex items-center gap-1.5 bg-warm-100 dark:bg-cream-800",
				"border border-border rounded-lg px-2.5 py-1.5",
				"transition-colors",
				isFocused && "border-warm-400 dark:border-cream-600 bg-surface",
			)}
		>
			{/* 安全图标 */}
			{url ? (
				isLocal ? (
					<Lock
						className="w-3.5 h-3.5 text-success flex-shrink-0"
						strokeWidth={1.75}
					/>
				) : secure ? (
					<Lock
						className="w-3.5 h-3.5 text-success flex-shrink-0"
						strokeWidth={1.75}
					/>
				) : (
					<Unlock
						className="w-3.5 h-3.5 text-text-muted flex-shrink-0"
						strokeWidth={1.75}
					/>
				)
			) : null}

			<input
				type="text"
				value={displayUrl}
				onChange={(e) => setInputValue(e.target.value)}
				onFocus={() => {
					setIsFocused(true);
					setInputValue(url);
				}}
				onBlur={() => {
					setIsFocused(false);
					setInputValue(url);
				}}
				onKeyDown={handleKeyDown}
				placeholder="输入地址..."
				disabled={disabled}
				spellCheck={false}
				autoComplete="off"
				className={cn(
					"flex-1 bg-transparent border-none outline-none",
					"text-sm font-mono text-text-primary placeholder:text-text-muted",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					"min-w-0",
				)}
				aria-label="地址栏"
			/>
		</form>
	);
}
