import { Suspense, lazy } from "react";
import { FileWarning, Loader2 } from "lucide-react";

interface DocumentViewerProps {
	src: string;
	type: "pdf" | "docx";
	className?: string;
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
): { type: "pdf" | "docx"; src: string } | null {
	const match = html.match(/data-type="(pdf|docx)"\s+data-src="([^"]+)"/);
	if (match) {
		return {
			type: match[1] as "pdf" | "docx",
			src: match[2],
		};
	}
	return null;
}
