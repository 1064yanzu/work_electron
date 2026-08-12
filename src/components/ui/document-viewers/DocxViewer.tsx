import { Download, FileWarning, Loader2 } from "lucide-react";
import mammoth from "mammoth";
import { useEffect, useState } from "react";
import { safeInvoke } from "../../../lib/tauriBridge";

interface DocxViewerProps {
	src: string;
	className?: string;
}

export default function DocxViewer({ src, className }: DocxViewerProps) {
	const [htmlContent, setHtmlContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const loadDocx = async () => {
			try {
				setLoading(true);
				setError(null);

				try {
					const result = await safeInvoke<{ html: string }>(
						"convert_docx_to_html",
						{
							payload: { path: src },
						},
					);
					setHtmlContent(result.html || "");
					return;
				} catch (err) {
					console.warn(
						"[DOCXViewer] Backend conversion failed, fallback:",
						err,
					);
				}

				const response = await fetch(src);
				if (!response.ok) throw new Error("无法加载文档");

				const arrayBuffer = await response.arrayBuffer();
				const result = await mammoth.convertToHtml({ arrayBuffer });
				setHtmlContent(result.value);
			} catch (err) {
				console.error("DOCX 加载失败:", err);
				setError("DOCX 加载失败");
			} finally {
				setLoading(false);
			}
		};

		loadDocx();
	}, [src]);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-8 h-8 animate-spin text-text-light" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-text-light">
				<FileWarning className="w-12 h-12 mb-3 opacity-50" />
				<p className="text-sm">{error}</p>
				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-4 px-4 py-2 bg-dark-muted text-white rounded-lg text-sm hover:opacity-90"
				>
					在外部应用中打开
				</a>
			</div>
		);
	}

	return (
		<div className={`flex flex-col ${className || ""}`}>
			<div className="flex items-center justify-end px-4 py-2 bg-warm-200 rounded-t-xl border-b border-border">
				<a
					href={src}
					download
					className="p-1.5 rounded-lg hover:bg-warm-300 dark:hover:bg-cream-700 transition-colors"
					title="下载"
				>
					<Download className="w-4 h-4" />
				</a>
			</div>

			<div className="flex-1 overflow-auto bg-surface rounded-b-xl">
				<article
					className="prose prose-zinc dark:prose-invert max-w-none p-6 
            prose-headings:font-semibold
            prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-4
            prose-h2:text-xl prose-h2:mt-5 prose-h2:mb-3
            prose-p:text-base prose-p:leading-7 prose-p:my-3
            prose-table:my-4 prose-table:w-full
            prose-th:bg-warm-200 dark:prose-th:bg-dark-surface prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm
            prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border dark:prose-td:border-dark-border
            prose-img:rounded-lg prose-img:shadow-md prose-img:my-4"
					dangerouslySetInnerHTML={{ __html: htmlContent }}
				/>
			</div>
		</div>
	);
}
