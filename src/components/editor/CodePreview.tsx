import { memo } from "react";
import { useShikiTokens } from "../../hooks/useShikiHighlight";
import { mapLanguageFromPath } from "../../lib/shiki";
import { cn } from "../../lib/utils";
import { TrafficLights } from "../sandbox/preview/TrafficLights";
type EditorDensity = "comfortable" | "compact";

interface CodePreviewProps {
	fileName: string;
	content: string;
	density: EditorDensity;
	/** 自定义语言（覆盖根据文件名推断的结果），HTML 源码切换时用于 srcDoc 显示 */
	languageOverride?: string;
	/** 是否显示 macOS 风装饰条（含交通灯 + 文件名），默认 true */
	showHeader?: boolean;
}

/**
 * CodePreview - 通用代码预览组件
 * Shiki 语法高亮 + 行号 + macOS 风装饰条
 */
export const CodePreview = memo(function CodePreview({
	fileName,
	content,
	density,
	languageOverride,
	showHeader = true,
}: CodePreviewProps) {
	const language = languageOverride ?? mapLanguageFromPath(fileName);
	const { tokens, loading } = useShikiTokens(content, language);
	const lineHeightClass =
		density === "compact" ? "text-xs leading-6" : "text-sm leading-7";

	if (!content) {
		return <p className="text-text-muted">文件内容为空。</p>;
	}

	return (
		<div className="rounded-2xl border border-border/80 overflow-hidden bg-console-night shadow-bai-pop">
			{showHeader ? (
				<div className="flex items-center gap-2 px-4 py-3 border-b border-console-bar bg-console-bar/90">
					<TrafficLights />
					<span className="text-xs font-medium text-console-night-fg/70 truncate">
						{fileName}
					</span>
				</div>
			) : null}
			<div className={cn("overflow-auto px-0 py-3 font-mono", lineHeightClass)}>
				{loading || !tokens ? (
					<pre className="px-4 whitespace-pre-wrap break-words text-console-night-fg/70">
						{content}
					</pre>
				) : (
					tokens.map((line, index) => (
						<div
							key={`${fileName}-line-${index + 1}`}
							className="grid grid-cols-[3.5rem_minmax(0,1fr)] px-4 hover:bg-surface/[0.03] transition-colors"
						>
							<span className="select-none pr-4 text-right text-console-night-fg/40">
								{index + 1}
							</span>
							<span className="whitespace-pre-wrap break-words text-console-night-fg">
								{line.length > 0
									? line.map((token, tokenIndex) => (
											<span key={tokenIndex} style={{ color: token.color }}>
												{token.content}
											</span>
										))
									: " "}
							</span>
						</div>
					))
				)}
			</div>
		</div>
	);
});
