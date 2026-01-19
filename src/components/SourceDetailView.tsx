import {
	Clock,
	ExternalLink,
	FileText,
	Globe,
	Image as ImageIcon,
	Loader2,
	Mic,
	Tag,
	Type,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getSourceDetail } from "../lib/api";
import { type Source, type SourceDetail, SourceType } from "../types";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";

interface SourceDetailViewProps {
	source: Source;
	onClose: () => void;
}

export function SourceDetailView({ source, onClose }: SourceDetailViewProps) {
	const [detail, setDetail] = useState<SourceDetail | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		getSourceDetail(source.id)
			.then((data) => {
				if (cancelled) return;
				setDetail(data);
			})
			.catch((err) => {
				console.error("加载资料详情失败:", err);
				if (cancelled) return;
				setError("无法加载资料内容");
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [source.id]);

	const getIcon = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return <Globe className="w-5 h-5" />;
			case SourceType.Audio:
				return <Mic className="w-5 h-5" />;
			case SourceType.Document:
				return <FileText className="w-5 h-5" />;
			case SourceType.Text:
				return <Type className="w-5 h-5" />;
			case SourceType.Image:
				return <ImageIcon className="w-5 h-5" />;
			default:
				return <FileText className="w-5 h-5" />;
		}
	};

	const getKindLabel = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return "网页";
			case SourceType.Audio:
				return "音频";
			case SourceType.Document:
				return "文档";
			case SourceType.Text:
				return "文本";
			case SourceType.Image:
				return "图片";
			default:
				return "资料";
		}
	};

	const getKindColor = (kind: SourceType) => {
		switch (kind) {
			case SourceType.Web:
				return "bg-blue-500";
			case SourceType.Audio:
				return "bg-purple-500";
			case SourceType.Document:
				return "bg-orange-500";
			case SourceType.Text:
				return "bg-green-500";
			case SourceType.Image:
				return "bg-pink-500";
			default:
				return "bg-zinc-500";
		}
	};

	return (
		<div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
			{/* Header */}
			<div className="shrink-0 px-8 py-6 border-b border-zinc-100 dark:border-zinc-800">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-4 min-w-0 flex-1">
						<div
							className={`w-12 h-12 rounded-xl ${getKindColor(source.kind)} flex items-center justify-center text-white shadow-sm shrink-0`}
						>
							{getIcon(source.kind)}
						</div>
						<div className="min-w-0 flex-1">
							<h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight mb-2 line-clamp-2">
								{source.title}
							</h1>
							<div className="flex items-center gap-4 text-xs text-zinc-400">
								<span className="flex items-center gap-1.5">
									<span
										className={`w-2 h-2 rounded-full ${getKindColor(source.kind)}`}
									/>
									{getKindLabel(source.kind)}
								</span>
								<span className="flex items-center gap-1">
									<Clock className="w-3 h-3" />
									{new Date(source.created_at).toLocaleDateString("zh-CN", {
										year: "numeric",
										month: "long",
										day: "numeric",
									})}
								</span>
							</div>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Tags */}
				{source.tags && source.tags.length > 0 && (
					<div className="flex items-center gap-2 mt-4">
						<Tag className="w-3.5 h-3.5 text-zinc-400" />
						<div className="flex flex-wrap gap-1.5">
							{source.tags.map((tag, idx) => (
								<span
									key={idx}
									className="px-2 py-0.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md"
								>
									{tag}
								</span>
							))}
						</div>
					</div>
				)}

				{/* URL Link */}
				{source.url && (
					<a
						href={source.url}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
					>
						<ExternalLink className="w-3.5 h-3.5" />
						访问原始链接
					</a>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto scrollbar-hide">
				{isLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="flex items-center gap-3 text-zinc-400">
							<Loader2 className="w-5 h-5 animate-spin" />
							<span className="text-sm">正在加载内容...</span>
						</div>
					</div>
				) : error ? (
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
								<FileText className="w-8 h-8 text-red-400" />
							</div>
							<p className="text-sm text-red-500">{error}</p>
						</div>
					</div>
				) : (
					<div className="px-8 py-6">
						{detail?.note?.content?.trim() ? (
							<article className="prose prose-zinc dark:prose-invert max-w-none">
								{/* 使用 Markdown 渲染器展示内容 */}
								<MarkdownRenderer
									content={detail.note.content.trim()}
									className="text-base leading-[1.9]"
								/>
							</article>
						) : (
							<div className="text-center py-12 text-zinc-400">
								<FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
								<p>暂无内容</p>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
