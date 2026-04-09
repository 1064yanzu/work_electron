import { memo } from "react";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { useShikiTokens } from "../../hooks/useShikiHighlight";
import { mapLanguageFromPath } from "../../lib/shiki";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";

interface FileTypePreviewProps {
	fileName: string;
	content: string;
	density: EditorDensity;
	emptyText?: string;
}

export function isMarkdownPreviewFile(fileName: string): boolean {
	return /\.(md|markdown|mdx)$/i.test(fileName);
}

function isCodeLikeFile(fileName: string): boolean {
	return (
		/\.(ts|tsx|js|jsx|json|jsonc|css|scss|less|html|htm|xml|yml|yaml|toml|ini|sh|bash|zsh|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|swift|vue|svelte|php|sql|graphql|gql|lua|dart|zig|proto|prisma)$/i.test(
			fileName,
		) || /(^|[/\\])(Dockerfile|Makefile)$/i.test(fileName)
	);
}

const CodePreview = memo(function CodePreview({
	fileName,
	content,
	density,
}: {
	fileName: string;
	content: string;
	density: EditorDensity;
}) {
	const language = mapLanguageFromPath(fileName);
	const { tokens, loading } = useShikiTokens(content, language);
	const lineHeightClass =
		density === "compact" ? "text-[12px] leading-6" : "text-[13px] leading-7";

	if (!content) {
		return (
			<p className="text-zinc-500 dark:text-zinc-400">
				文件内容为空。
			</p>
		);
	}

	return (
		<div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden bg-zinc-950 dark:bg-black shadow-[0_12px_50px_-24px_rgba(0,0,0,0.45)]">
			<div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/90">
				<div className="flex gap-1.5">
					<span className="w-3 h-3 rounded-full bg-red-500/75" />
					<span className="w-3 h-3 rounded-full bg-amber-400/75" />
					<span className="w-3 h-3 rounded-full bg-emerald-500/75" />
				</div>
				<span className="text-xs font-medium text-zinc-400 truncate">
					{fileName}
				</span>
			</div>
			<div className={cn("overflow-auto px-0 py-3 font-mono", lineHeightClass)}>
				{loading || !tokens ? (
					<pre className="px-4 whitespace-pre-wrap break-words text-zinc-200">
						{content}
					</pre>
				) : (
					tokens.map((line, index) => (
						<div
							key={`${fileName}-line-${index + 1}`}
							className="grid grid-cols-[3.5rem_minmax(0,1fr)] px-4 hover:bg-white/[0.03] transition-colors"
						>
							<span className="select-none pr-4 text-right text-zinc-500">
								{index + 1}
							</span>
							<span className="whitespace-pre-wrap break-words text-zinc-100">
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

export const FileTypePreview = memo(function FileTypePreview({
	fileName,
	content,
	density,
	emptyText = "文件内容为空。",
}: FileTypePreviewProps) {
	if (!content) {
		return <p className="text-zinc-600 dark:text-zinc-300">{emptyText}</p>;
	}

	if (isMarkdownPreviewFile(fileName)) {
		const textClass =
			density === "compact" ? "text-[14px] leading-[1.65]" : "text-base leading-[1.75]";
		return (
			<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-[1.75] prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
				<MarkdownRenderer content={content} className={textClass} />
			</article>
		);
	}

	if (isCodeLikeFile(fileName)) {
		return <CodePreview fileName={fileName} content={content} density={density} />;
	}

	return (
		<pre className="whitespace-pre-wrap break-words rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-950/55 px-5 py-4 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
			{content || emptyText}
		</pre>
	);
});
