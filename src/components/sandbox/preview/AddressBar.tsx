/**
 * AddressBar - 可编辑地址栏
 * 支持回车跳转、自动补全协议、安全状态图标、hostname / path 视觉分层、复制 URL
 */

import { Check, Copy, Globe, Lock, Unlock } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	if (/^file:\/\//i.test(trimmed)) return trimmed;
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

/** 拆解 URL 为 protocol / hostname / path 三部分供分层展示 */
function splitUrl(url: string): {
	protocol: string;
	hostname: string;
	rest: string;
} {
	try {
		const parsed = new URL(url);
		const protocol = `${parsed.protocol}//`;
		const hostname = parsed.host;
		const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`;
		return { protocol, hostname, rest };
	} catch {
		return { protocol: "", hostname: url, rest: "" };
	}
}

export function AddressBar({ url, onNavigate, disabled }: AddressBarProps) {
	const [inputValue, setInputValue] = useState(url);
	const [isFocused, setIsFocused] = useState(false);
	const [copied, setCopied] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// 外部 url 变化时同步到输入框（仅未聚焦时）
	useEffect(() => {
		if (!isFocused) setInputValue(url);
	}, [isFocused, url]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 1400);
		return () => clearTimeout(t);
	}, [copied]);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			const finalUrl = ensureProtocol(inputValue);
			if (finalUrl) onNavigate(finalUrl);
			inputRef.current?.blur();
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

	const handleCopy = useCallback(async () => {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
		} catch {
			// 静默失败
		}
	}, [url]);

	const isLocal = isLocalPreview(url);
	const secure = isSecure(url);
	const parts = useMemo(() => splitUrl(url), [url]);

	// 安全图标三态：本地（mint 锁）/ HTTPS（mint 锁）/ HTTP（unlock 灰）/ 空（globe 灰）
	let securityIcon: React.ReactNode;
	let securityTitle: string;
	if (!url) {
		securityIcon = (
			<Globe
				className="w-3.5 h-3.5 text-text-light flex-shrink-0"
				strokeWidth={1.75}
			/>
		);
		securityTitle = "无地址";
	} else if (isLocal) {
		securityIcon = (
			<Lock
				className="w-3.5 h-3.5 text-[#6FBF99] flex-shrink-0"
				strokeWidth={1.75}
			/>
		);
		securityTitle = "本地预览（受信任沙盒）";
	} else if (secure) {
		securityIcon = (
			<Lock
				className="w-3.5 h-3.5 text-[#6FBF99] flex-shrink-0"
				strokeWidth={1.75}
			/>
		);
		securityTitle = "HTTPS 加密连接";
	} else {
		securityIcon = (
			<Unlock
				className="w-3.5 h-3.5 text-text-muted flex-shrink-0"
				strokeWidth={1.75}
			/>
		);
		securityTitle = "未加密连接";
	}

	return (
		<form
			onSubmit={handleSubmit}
			className={cn(
				"group relative flex-1 flex items-center gap-2 min-w-0",
				"bg-cream-100 dark:bg-cream-800",
				"border border-border rounded-full",
				"h-8 px-3",
				"transition-all duration-150",
				"hover:border-cream-500/70 dark:hover:border-cream-700",
				isFocused &&
					"border-text-secondary dark:border-cream-500 bg-surface shadow-[0_0_0_3px_var(--t-primary-muted,rgba(26,26,25,0.06))]",
			)}
		>
			{/* 安全图标 */}
			<span
				className="flex-shrink-0 inline-flex items-center"
				title={securityTitle}
				aria-label={securityTitle}
			>
				{securityIcon}
			</span>

			{/* 真实输入框 + 视觉层（视觉层在未聚焦时显示，聚焦时让位） */}
			<div className="relative flex-1 min-w-0">
				{/* 视觉层 — hostname 高亮 */}
				{!isFocused && url ? (
					<div
						className={cn(
							"absolute inset-0 flex items-center pointer-events-none",
							"text-sm font-mono whitespace-nowrap overflow-hidden",
						)}
						aria-hidden="true"
					>
						{parts.protocol ? (
							<span className="text-text-light">{parts.protocol}</span>
						) : null}
						<span className="text-text-primary font-medium">
							{parts.hostname}
						</span>
						{parts.rest ? (
							<span className="text-text-muted truncate">{parts.rest}</span>
						) : null}
					</div>
				) : null}

				<input
					ref={inputRef}
					type="text"
					value={isFocused ? inputValue : url}
					onChange={(e) => setInputValue(e.target.value)}
					onFocus={(e) => {
						setIsFocused(true);
						setInputValue(url);
						// 聚焦后全选，方便整段替换（仿浏览器原生）
						requestAnimationFrame(() => e.target.select());
					}}
					onBlur={() => {
						setIsFocused(false);
						setInputValue(url);
					}}
					onKeyDown={handleKeyDown}
					placeholder="输入网址或路径..."
					disabled={disabled}
					spellCheck={false}
					autoComplete="off"
					className={cn(
						"w-full bg-transparent border-none outline-none",
						"text-sm font-mono text-text-primary placeholder:text-text-muted",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						// 未聚焦时让真实文字"透明"，由视觉层呈现高亮分色
						!isFocused && url ? "text-transparent caret-transparent" : "",
					)}
					aria-label="地址栏"
				/>
			</div>

			{/* 复制 URL 按钮 — hover 时浮现 */}
			{url ? (
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"flex-shrink-0 inline-flex items-center justify-center",
						"w-6 h-6 rounded-full",
						"text-text-light hover:text-text-primary",
						"hover:bg-cream-200/80 dark:hover:bg-cream-700/80",
						"transition-all duration-150",
						"opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
						isFocused && "opacity-100",
					)}
					title={copied ? "已复制" : "复制网址"}
					aria-label="复制网址"
					tabIndex={-1}
				>
					{copied ? (
						<Check className="w-3.5 h-3.5 text-[#6FBF99]" strokeWidth={2} />
					) : (
						<Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
					)}
				</button>
			) : null}
		</form>
	);
}
