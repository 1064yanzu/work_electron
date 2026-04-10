import { memo, useMemo } from "react";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { useShikiTokens } from "../../hooks/useShikiHighlight";
import { mapLanguageFromPath } from "../../lib/shiki";
import { convertFileSrc } from "../../lib/tauriCompat";
import { cn } from "../../lib/utils";
import type { EditorDensity } from "./useEditorUiPrefs";

interface FileTypePreviewProps {
	fileName: string;
	content: string;
	density: EditorDensity;
	emptyText?: string;
	filePath?: string;
}

/** 二进制文件占位标记 */
export const BINARY_CONTENT_MARKER = "__binary__";

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

export function isImageFile(fileName: string): boolean {
	return /\.(png|jpg|jpeg|gif|bmp|svg|webp|ico|avif|tiff?)$/i.test(fileName);
}

export function isVideoFile(fileName: string): boolean {
	return /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(fileName);
}

export function isAudioFile(fileName: string): boolean {
	return /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(fileName);
}

export function isCsvFile(fileName: string): boolean {
	return /\.(csv|tsv)$/i.test(fileName);
}

export function isPdfFile(fileName: string): boolean {
	return /\.pdf$/i.test(fileName);
}

export function isExcelFile(fileName: string): boolean {
	return /\.(xlsx?|xls)$/i.test(fileName);
}

/** 可内嵌预览的二进制文件（不需要 utf-8 读取） */
export function isBinaryPreviewFile(fileName: string): boolean {
	return (
		isImageFile(fileName) ||
		isVideoFile(fileName) ||
		isAudioFile(fileName) ||
		isPdfFile(fileName) ||
		isExcelFile(fileName)
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

/* ──────────────── 二进制文件预览组件 ──────────────── */

const ImagePreview = memo(function ImagePreview({
	filePath,
	fileName,
}: { filePath: string; fileName: string }) {
	const src = convertFileSrc(filePath);
	return (
		<div className="flex flex-col items-center justify-center gap-4 p-6">
			<img
				src={src}
				alt={fileName}
				className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
				onError={(e) => {
					(e.target as HTMLImageElement).style.display = "none";
					const parent = (e.target as HTMLImageElement).parentElement;
					if (parent) {
						const fallback = document.createElement("p");
						fallback.className = "text-zinc-500 dark:text-zinc-400 text-sm";
						fallback.textContent = `无法加载图片: ${fileName}`;
						parent.appendChild(fallback);
					}
				}}
			/>
			<span className="text-xs text-zinc-400 dark:text-zinc-500">{fileName}</span>
		</div>
	);
});

const VideoPreview = memo(function VideoPreview({
	filePath,
	fileName,
}: { filePath: string; fileName: string }) {
	const src = convertFileSrc(filePath);
	return (
		<div className="flex flex-col items-center gap-4 p-6">
			<video
				src={src}
				controls
				className="max-w-full max-h-[70vh] rounded-lg shadow-md bg-black"
			>
				您的浏览器不支持视频播放
			</video>
			<span className="text-xs text-zinc-400 dark:text-zinc-500">{fileName}</span>
		</div>
	);
});

const AudioPreview = memo(function AudioPreview({
	filePath,
	fileName,
}: { filePath: string; fileName: string }) {
	const src = convertFileSrc(filePath);
	return (
		<div className="flex flex-col items-center gap-4 p-10">
			<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-500/30 dark:to-pink-500/30 flex items-center justify-center">
				<svg className="w-8 h-8 text-purple-500 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
				</svg>
			</div>
			<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{fileName}</span>
			<audio src={src} controls className="w-full max-w-md">
				您的浏览器不支持音频播放
			</audio>
		</div>
	);
});

const PdfPreview = memo(function PdfPreview({
	filePath,
	fileName,
}: { filePath: string; fileName: string }) {
	const src = convertFileSrc(filePath);
	return (
		<div className="flex flex-col h-[80vh] gap-3 p-4">
			<div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
				<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
				</svg>
				{fileName}
			</div>
			<iframe
				src={src}
				className="flex-1 w-full rounded-lg border border-zinc-200 dark:border-zinc-700"
				title={fileName}
			/>
		</div>
	);
});

const CsvPreview = memo(function CsvPreview({
	content,
	fileName,
}: { content: string; fileName: string }) {
	const rows = useMemo(() => {
		const separator = /\.tsv$/i.test(fileName) ? "\t" : ",";
		return content
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => {
				const result: string[] = [];
				let current = "";
				let inQuotes = false;
				for (const char of line) {
					if (char === '"') {
						inQuotes = !inQuotes;
					} else if (char === separator && !inQuotes) {
						result.push(current.trim());
						current = "";
					} else {
						current += char;
					}
				}
				result.push(current.trim());
				return result;
			});
	}, [content, fileName]);

	const header = rows[0] || [];
	const body = rows.slice(1);

	return (
		<div className="overflow-auto rounded-xl border border-zinc-200/80 dark:border-zinc-800/80">
			<table className="w-full text-sm">
				<thead className="bg-zinc-100 dark:bg-zinc-800/80 sticky top-0">
					<tr>
						{header.map((cell, i) => (
							<th
								key={`h-${i}`}
								className="px-4 py-2.5 text-left font-medium text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700 whitespace-nowrap"
							>
								{cell}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{body.map((row, i) => (
						<tr
							key={`r-${i}`}
							className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
						>
							{row.map((cell, j) => (
								<td
									key={`c-${i}-${j}`}
									className="px-4 py-2 text-zinc-600 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/50 whitespace-nowrap"
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{body.length > 0 && (
				<div className="px-4 py-2 text-xs text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800/50">
					共 {body.length} 行 · {header.length} 列
				</div>
			)}
		</div>
	);
});

const ExcelPlaceholder = memo(function ExcelPlaceholder({
	fileName,
}: { fileName: string }) {
	return (
		<div className="flex flex-col items-center gap-4 p-10 text-center">
			<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 dark:from-emerald-500/30 dark:to-teal-500/30 flex items-center justify-center">
				<svg className="w-8 h-8 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M12 17.25v-5.25" />
				</svg>
			</div>
			<div>
				<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{fileName}</p>
				<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					Excel 文件无法在此预览，请使用 Excel 或 WPS 等工具打开
				</p>
			</div>
		</div>
	);
});

const BinaryNotAvailable = memo(function BinaryNotAvailable({
	fileName,
}: { fileName: string }) {
	return (
		<div className="flex flex-col items-center gap-3 p-10 text-center">
			<div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
				<svg className="w-7 h-7 text-zinc-400 dark:text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
				</svg>
			</div>
			<p className="text-sm text-zinc-500 dark:text-zinc-400">{fileName}</p>
			<p className="text-xs text-zinc-400 dark:text-zinc-500">
				该文件需要指定文件路径才能预览
			</p>
		</div>
	);
});

/* ──────────────── 主预览组件 ──────────────── */

export const FileTypePreview = memo(function FileTypePreview({
	fileName,
	content,
	density,
	emptyText = "文件内容为空。",
	filePath,
}: FileTypePreviewProps) {
	const isBinaryContent = content === BINARY_CONTENT_MARKER;

	// 1. 图片
	if (isImageFile(fileName)) {
		if (filePath) return <ImagePreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 2. 视频
	if (isVideoFile(fileName)) {
		if (filePath) return <VideoPreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 3. 音频
	if (isAudioFile(fileName)) {
		if (filePath) return <AudioPreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 4. PDF
	if (isPdfFile(fileName)) {
		if (filePath) return <PdfPreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 5. Excel
	if (isExcelFile(fileName)) {
		return <ExcelPlaceholder fileName={fileName} />;
	}

	// 6. CSV/TSV
	if (isCsvFile(fileName) && content && !isBinaryContent) {
		return <CsvPreview content={content} fileName={fileName} />;
	}

	// 对二进制占位内容不做文本渲染
	if (isBinaryContent || !content) {
		return <p className="text-zinc-600 dark:text-zinc-300">{emptyText}</p>;
	}

	// 7. Markdown
	if (isMarkdownPreviewFile(fileName)) {
		const textClass =
			density === "compact" ? "text-[14px] leading-[1.65]" : "text-base leading-[1.75]";
		return (
			<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-p:leading-[1.75] prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
				<MarkdownRenderer content={content} className={textClass} />
			</article>
		);
	}

	// 8. 代码
	if (isCodeLikeFile(fileName)) {
		return <CodePreview fileName={fileName} content={content} density={density} />;
	}

	// 9. 纯文本
	return (
		<pre className="whitespace-pre-wrap break-words rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-950/55 px-5 py-4 text-sm leading-7 text-zinc-700 dark:text-zinc-200">
			{content || emptyText}
		</pre>
	);
});
