import { memo, useMemo } from "react";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import DocumentViewer from "../ui/DocumentViewer";
import { convertFileSrc } from "../../lib/tauriCompat";
import { CodePreview } from "./CodePreview";
import { HtmlFilePreview } from "./HtmlFilePreview";
type EditorDensity = "comfortable" | "compact";

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

/* ──────────────── 二进制文件预览组件 ──────────────── */

const ImagePreview = memo(function ImagePreview({
	filePath,
	fileName,
}: {
	filePath: string;
	fileName: string;
}) {
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
						fallback.className = "text-text-muted text-sm";
						fallback.textContent = `无法加载图片: ${fileName}`;
						parent.appendChild(fallback);
					}
				}}
			/>
			<span className="text-xs text-text-light">{fileName}</span>
		</div>
	);
});

const VideoPreview = memo(function VideoPreview({
	filePath,
	fileName,
}: {
	filePath: string;
	fileName: string;
}) {
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
			<span className="text-xs text-text-light">{fileName}</span>
		</div>
	);
});

const AudioPreview = memo(function AudioPreview({
	filePath,
	fileName,
}: {
	filePath: string;
	fileName: string;
}) {
	const src = convertFileSrc(filePath);
	return (
		<div className="flex flex-col items-center gap-4 p-10">
			<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-500/30 dark:to-pink-500/30 flex items-center justify-center">
				<svg
					className="w-8 h-8 bai-icon-violet dark:bai-icon-violet"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
					/>
				</svg>
			</div>
			<span className="text-sm font-medium text-text-secondary">
				{fileName}
			</span>
			<audio src={src} controls className="w-full max-w-md">
				您的浏览器不支持音频播放
			</audio>
		</div>
	);
});

const PdfPreview = memo(function PdfPreview({
	filePath,
	fileName,
}: {
	filePath: string;
	fileName: string;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col gap-2 p-1">
			<div className="flex items-center gap-2 text-sm text-text-muted">
				<svg
					className="w-4 h-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
					/>
				</svg>
				{fileName}
			</div>
			<DocumentViewer
				src={filePath}
				type="pdf"
				className="flex-1 min-h-0 rounded-lg border border-border"
			/>
		</div>
	);
});

const CsvPreview = memo(function CsvPreview({
	content,
	fileName,
}: {
	content: string;
	fileName: string;
}) {
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
		<div className="overflow-auto rounded-xl border border-border/80">
			<table className="w-full text-sm">
				<thead className="bg-warm-200/80 sticky top-0">
					<tr>
						{header.map((cell, i) => (
							<th
								key={`h-${i}`}
								className="px-4 py-2.5 text-left font-medium text-text-secondary border-b border-border whitespace-nowrap"
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
							className="hover:bg-warm-50/40 transition-colors"
						>
							{row.map((cell, j) => (
								<td
									key={`c-${i}-${j}`}
									className="px-4 py-2 text-text-secondary border-b border-border/50 whitespace-nowrap"
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{body.length > 0 && (
				<div className="px-4 py-2 text-xs text-text-light border-t border-border/50">
					共 {body.length} 行 · {header.length} 列
				</div>
			)}
		</div>
	);
});

const ExcelPlaceholder = memo(function ExcelPlaceholder({
	fileName,
}: {
	fileName: string;
}) {
	return (
		<div className="flex flex-col items-center gap-4 p-10 text-center">
			<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 dark:from-emerald-500/30 dark:to-teal-500/30 flex items-center justify-center">
				<svg
					className="w-8 h-8 text-success dark:text-success"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M12 17.25v-5.25"
					/>
				</svg>
			</div>
			<div>
				<p className="text-sm font-medium text-text-secondary">{fileName}</p>
				<p className="text-xs text-text-light mt-1">
					Excel 文件无法在此预览，请使用 Excel 或 WPS 等工具打开
				</p>
			</div>
		</div>
	);
});

const BinaryNotAvailable = memo(function BinaryNotAvailable({
	fileName,
}: {
	fileName: string;
}) {
	return (
		<div className="flex flex-col items-center gap-3 p-10 text-center">
			<div className="w-14 h-14 rounded-2xl bg-warm-200 flex items-center justify-center">
				<svg
					className="w-7 h-7 text-text-light"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.5}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
					/>
				</svg>
			</div>
			<p className="text-sm text-text-muted">{fileName}</p>
			<p className="text-xs text-text-light">该文件需要指定文件路径才能预览</p>
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
		if (filePath)
			return <ImagePreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 2. 视频
	if (isVideoFile(fileName)) {
		if (filePath)
			return <VideoPreview filePath={filePath} fileName={fileName} />;
		return <BinaryNotAvailable fileName={fileName} />;
	}

	// 3. 音频
	if (isAudioFile(fileName)) {
		if (filePath)
			return <AudioPreview filePath={filePath} fileName={fileName} />;
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
		return <p className="text-text-secondary">{emptyText}</p>;
	}

	// 7. Markdown
	if (isMarkdownPreviewFile(fileName)) {
		const textClass =
			density === "compact"
				? "text-sm leading-[1.65]"
				: "text-base leading-[1.75]";
		return (
			<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:text-text-secondary dark:prose-p:text-text-light prose-p:leading-[1.75] prose-li:text-text-secondary dark:prose-li:text-text-light prose-strong:text-text-primary dark:prose-strong:text-surface">
				<MarkdownRenderer content={content} className={textClass} />
			</article>
		);
	}

	// 8. HTML：用 iframe 真渲染网页（与"产物预览"路径共用底层组件）
	if (/\.(html|htm)$/i.test(fileName)) {
		return <HtmlFilePreview fileName={fileName} content={content} />;
	}

	// 9. 代码
	if (isCodeLikeFile(fileName)) {
		return (
			<CodePreview fileName={fileName} content={content} density={density} />
		);
	}

	// 10. 纯文本
	return (
		<pre className="whitespace-pre-wrap break-words rounded-2xl border border-border/80 bg-warm-50/80 px-5 py-4 text-sm leading-7 text-text-secondary dark:text-cream-200">
			{content || emptyText}
		</pre>
	);
});
