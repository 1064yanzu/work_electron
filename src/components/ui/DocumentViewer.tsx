import { Suspense, lazy } from "react";
import { BookOpen, FileWarning, Loader2 } from "lucide-react";

interface DocumentViewerProps {
	src: string;
	type: "pdf" | "docx" | "epub";
	className?: string;
	onOpenReader?: () => void;
}

const PdfViewer = lazy(() => import("./document-viewers/PdfViewer"));
const DocxViewer = lazy(() => import("./document-viewers/DocxViewer"));

function DocumentLoadingFallback() {
	return (
		<div className="flex items-center justify-center py-12">
			<Loader2 className="w-8 h-8 animate-spin text-text-light" />
		</div>
	);
}

// 主组件
export default function DocumentViewer({
	src,
	type,
	className = "",
	onOpenReader,
}: DocumentViewerProps) {
	if (type === "pdf") {
		return (
			<Suspense fallback={<DocumentLoadingFallback />}>
				<PdfViewer src={src} className={className} />
			</Suspense>
		);
	} else if (type === "docx") {
		return (
			<Suspense fallback={<DocumentLoadingFallback />}>
				<DocxViewer src={src} className={className} />
			</Suspense>
		);
	} else if (type === "epub") {
		return (
			<div className={`flex flex-col items-center justify-center py-16 ${className}`}>
				<BookOpen className="w-12 h-12 mb-4 text-text-light opacity-60" />
				<p className="text-sm text-text-secondary mb-4">
					EPUB 图书请使用阅读器打开以获得最佳体验
				</p>
				{onOpenReader && (
					<button
						onClick={onOpenReader}
						className="flex items-center gap-2 px-5 py-2.5 bg-dark-muted text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
					>
						<BookOpen className="w-4 h-4" />
						打开阅读器
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center py-12 text-text-light">
			<FileWarning className="w-12 h-12 mb-3 opacity-50" />
			<p className="text-sm">不支持的文档类型</p>
		</div>
	);
}

// 辅助函数：从 HTML 中提取文档信息
export function extractDocumentInfo(
	html: string,
): { type: "pdf" | "docx" | "epub"; src: string } | null {
	const match = html.match(/data-type="(pdf|docx|epub)"\s+data-src="([^"]+)"/);
	if (match) {
		return {
			type: match[1] as "pdf" | "docx" | "epub",
			src: match[2],
		};
	}
	return null;
}
