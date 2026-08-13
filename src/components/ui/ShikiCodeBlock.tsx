// ShikiCodeBlock - 通用高亮代码块组件
// 带语言标签、复制按钮、行号（可选）

import { Check, Copy } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";
import { useShikiHighlight } from "../../hooks/useShikiHighlight";
import { cn } from "../../lib/utils";

/** 折叠阈值：超过这么多行时默认只渲染前这些行 */
const COLLAPSED_LINE_LIMIT = 300;

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
	const [expanded, setExpanded] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

	// 每个 token 都是一个 <span>，几百行代码轻松产出上万个 DOM 节点。
	// AI 经常一次吐出整份文件，超长代码块会明显拖慢整条消息的挂载。
	// 默认只渲染前 COLLAPSED_LINE_LIMIT 行，其余按需展开。
	// 注意：截断只作用于**渲染**，复制按钮始终复制完整的 code。
	const totalLines = tokens?.length ?? lines.length;
	const isTruncatable = totalLines > COLLAPSED_LINE_LIMIT;
	const isCollapsed = isTruncatable && !expanded;
	const visibleTokens =
		isCollapsed && tokens ? tokens.slice(0, COLLAPSED_LINE_LIMIT) : tokens;
	const hiddenLineCount = totalLines - COLLAPSED_LINE_LIMIT;

	return (
		<div
			className={cn(
				"relative group my-3 rounded-xl overflow-hidden ring-1",
				isDark ? "ring-border" : "ring-border bg-surface",
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
						{visibleTokens?.map((lineTokens, lineIdx) => (
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
						{/* 如果原文最后没有换行但 tokens 少了一行，补一个空行（折叠时不补） */}
						{!isCollapsed && tokens.length < lines.length && (
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

						{isTruncatable && (
							<button
								type="button"
								onClick={() => setExpanded((v) => !v)}
								className={cn(
									"mt-2 w-full rounded-lg border py-1.5 text-xs font-medium transition-colors",
									isDark
										? "border-border text-text-secondary hover:bg-white/5"
										: "border-border text-text-muted hover:bg-warm-100",
								)}
							>
								{isCollapsed
									? `展开剩余 ${hiddenLineCount} 行`
									: `收起（共 ${totalLines} 行）`}
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export const ShikiCodeBlock = memo(ShikiCodeBlockInner);
