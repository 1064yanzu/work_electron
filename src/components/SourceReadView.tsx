// 资料阅读视图 - 在中间栏展示资料内容
import { BookOpen, X } from "lucide-react";
import DocumentViewer, { extractDocumentInfo } from "./ui/DocumentViewer";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";
import { RichContentWithStyles } from "./ui/RichContentRenderer";

interface SourceReadViewProps {
	title: string;
	note?: {
		content: string;
		content_html?: string;
	};
	onClose: () => void;
}

export default function SourceReadView({
	title,
	note,
	onClose,
}: SourceReadViewProps) {
	const contentHtml = note?.content_html;
	const content = note?.content;

	// 检测内容类型
	const isImageExtraction = contentHtml?.includes('data-has-markdown="true"');
	const docInfo = contentHtml ? extractDocumentInfo(contentHtml) : null;

	// 渲染内容
	const renderContent = () => {
		// 文档类型：使用内嵌阅读器
		if (docInfo && docInfo.src) {
			return (
				<DocumentViewer
					src={docInfo.src}
					type={docInfo.type}
					className="min-h-[70vh]"
				/>
			);
		}

		// 图片抽取结果：先渲染 Markdown 内容，再显示原图
		if (isImageExtraction && content && contentHtml) {
			return (
				<div className="space-y-8">
					<article className="prose prose-zinc dark:prose-invert max-w-none select-text prose-lg">
						<MarkdownRenderer
							content={content}
							className="text-base leading-relaxed"
						/>
					</article>
					<RichContentWithStyles
						html={contentHtml}
						className="text-base leading-relaxed select-text"
					/>
				</div>
			);
		}

		// 普通富文本内容
		if (contentHtml) {
			return (
				<RichContentWithStyles
					html={contentHtml}
					className="text-base leading-relaxed select-text prose-lg"
				/>
			);
		}

		// 纯 Markdown 内容
		if (content) {
			return (
				<article className="prose prose-zinc dark:prose-invert max-w-none select-text prose-lg">
					<MarkdownRenderer
						content={content}
						className="text-base leading-relaxed"
					/>
				</article>
			);
		}

		// 无内容
		return (
			<div className="flex flex-col items-center justify-center py-20 text-text-light">
				<BookOpen className="w-12 h-12 mb-4 opacity-50" />
				<p className="text-lg">暂无内容</p>
			</div>
		);
	};

	return (
		<div className="flex flex-col h-full bg-surface">
			{/* 顶部标题栏 */}
			<div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
				<div className="flex items-center gap-3 min-w-0">
					<BookOpen className="w-5 h-5 text-text-light shrink-0" />
					<h1 className="text-lg font-semibold text-text-primary truncate">
						{title}
					</h1>
				</div>
				<button
					onClick={onClose}
					className="p-2 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
					title="关闭"
				>
					<X className="w-5 h-5" />
				</button>
			</div>

			{/* 内容区 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide">
				<div className="max-w-3xl mx-auto px-8 py-8">{renderContent()}</div>
			</div>
		</div>
	);
}
