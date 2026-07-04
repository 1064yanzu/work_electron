// ShikiCodeBlock - 通用高亮代码块组件
// 带语言标签、复制按钮、行号（可选）

import { Check, Copy } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { useShikiHighlight } from "../../hooks/useShikiHighlight";
import { cn } from "../../lib/utils";

interface ShikiCodeBlockProps {
	code: string;
	language: string;
	showLineNumbers?: boolean;
	maxHeight?: number | string;
	className?: string;
}

function ShikiCodeBlockInner({
	code,
	language,
	showLineNumbers = false,
	maxHeight,
	className,
}: ShikiCodeBlockProps) {
	const { tokens, loading, theme } = useShikiHighlight(code, language);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		});
	}, [code]);

	const isDark = theme === "github-dark";
	// 画布色与 shiki 高亮主题绑定（github-dark 的画布），不随应用主题走
	const bgColor = isDark ? "#0d1117" : "#ffffff";
	const lines = code.split("\n");

	return (
		<div
			className={cn(
				"relative group my-3 rounded-xl overflow-hidden ring-1",
				isDark ? "ring-zinc-800" : "ring-zinc-200 bg-surface",
				className,
			)}
			style={isDark ? { backgroundColor: bgColor } : undefined}
		>
			{/* 顶部栏：语言标签 + 复制按钮 */}
			<div
				className={cn(
					"flex items-center justify-between px-4 py-2 text-xs border-b",
					isDark
						? "border-dark-border text-text-muted"
						: "border-border text-text-light",
				)}
			>
				<span className="font-mono">{language || "text"}</span>
				<button
					type="button"
					onClick={handleCopy}
					className={cn(
						"flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
						isDark
							? "hover:bg-dark-surface hover:text-text-light"
							: "hover:bg-warm-200 hover:text-text-secondary",
						copied && "text-success",
					)}
				>
					{copied ? (
						<>
							<Check className="h-3 w-3" />
							<span>已复制</span>
						</>
					) : (
						<>
							<Copy className="h-3 w-3" />
							<span>复制</span>
						</>
					)}
				</button>
			</div>

			{/* 代码区域 */}
			<div
				className="overflow-auto"
				style={{
					maxHeight: maxHeight ?? "none",
					backgroundColor: bgColor,
				}}
			>
				{loading || !tokens ? (
					// loading 降级：纯文本
					<pre
						className={cn(
							"p-4 text-sm font-mono leading-6",
							isDark ? "text-text-light" : "text-text-secondary",
						)}
					>
						<code>{code}</code>
					</pre>
				) : (
					<div className="p-4">
						{tokens.map((lineTokens, lineIdx) => (
							<div
								key={lineIdx}
								className={cn(
									"flex text-sm font-mono leading-6",
									showLineNumbers && "gap-0",
								)}
							>
								{showLineNumbers && (
									<span
										className={cn(
											"inline-block w-10 flex-shrink-0 select-none pr-4 text-right",
											isDark ? "text-text-secondary" : "text-text-light",
										)}
									>
										{lineIdx + 1}
									</span>
								)}
								<span className="flex-1 whitespace-pre-wrap break-all">
									{lineTokens.length > 0
										? lineTokens.map((token, tokenIdx) => (
												<span key={tokenIdx} style={{ color: token.color }}>
													{token.content}
												</span>
											))
										: // 空行
											"\n"}
								</span>
							</div>
						))}
						{/* 如果原文最后没有换行但 tokens 少了一行，补一个空行 */}
						{tokens.length < lines.length && (
							<div className="flex text-sm font-mono leading-6">
								{showLineNumbers && (
									<span
										className={cn(
											"inline-block w-10 flex-shrink-0 select-none pr-4 text-right",
											isDark ? "text-text-secondary" : "text-text-light",
										)}
									>
										{tokens.length + 1}
									</span>
								)}
								<span className="flex-1"> </span>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export const ShikiCodeBlock = memo(ShikiCodeBlockInner);
