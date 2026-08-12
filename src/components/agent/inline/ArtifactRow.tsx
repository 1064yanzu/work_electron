import {
	BookOpen,
	ChevronDown,
	ChevronRight,
	Code2,
	Globe,
	Loader2,
	MessageSquare,
} from "lucide-react";
import { memo, useState } from "react";
import type { ToolArtifact } from "../../../lib/agent/types";
import { safeInvoke } from "../../../lib/tauriBridge";
import { cn } from "../../../lib/utils";
import { WebPreviewCard } from "../../chat/WebPreviewCard";
import { InlineImage } from "../../ui/InlineImage";

interface ArtifactRowProps {
	artifact: ToolArtifact;
}

const CODE_EXTS = [
	"js",
	"jsx",
	"ts",
	"tsx",
	"css",
	"json",
	"md",
	"py",
	"rs",
	"go",
];
const VIDEO_EXTS = ["mp4", "webm", "avi", "mov", "mkv"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];

function toFileUrl(p: string): string {
	const raw = String(p || "").trim();
	if (!raw) return "";
	if (raw.startsWith("file://")) return raw;
	const normalized = raw.replace(/\\/g, "/");
	const isWindowsDrive = /^[a-zA-Z]:\//.test(normalized);
	const encoded = encodeURI(normalized);
	return `${isWindowsDrive ? "file:///" : "file://"}${encoded}`;
}

/** 工具调用产物预览行：按扩展名分派 HTML / 代码 / PDF / 视频 / 音频预览 */
export const ArtifactRow = memo(function ArtifactRow({
	artifact,
}: ArtifactRowProps) {
	const [showPreview, setShowPreview] = useState(false);
	const [fileContent, setFileContent] = useState<string | null>(null);
	const [loadingContent, setLoadingContent] = useState(false);

	const fileName = artifact.url?.split("/").pop() || artifact.title;
	const ext = fileName.split(".").pop()?.toLowerCase() || "";
	const isHtmlFile = ext === "html" || ext === "htm";
	const isCodeFile = CODE_EXTS.includes(ext);
	const isPdfFile = ext === "pdf";
	const isVideoFile = VIDEO_EXTS.includes(ext);
	const isAudioFile = AUDIO_EXTS.includes(ext);
	const isPreviewable =
		isHtmlFile ||
		isCodeFile ||
		isPdfFile ||
		isVideoFile ||
		isAudioFile ||
		artifact.type === "code" ||
		!!artifact.content;

	const Icon =
		artifact.type === "url"
			? Globe
			: artifact.type === "text"
				? BookOpen
				: artifact.type === "code" || isCodeFile
					? Code2
					: MessageSquare;

	const loadContentForPreview = async () => {
		if (artifact.content) {
			setFileContent(artifact.content);
			setShowPreview(true);
			return;
		}
		if (artifact.url && (isHtmlFile || isCodeFile)) {
			setLoadingContent(true);
			try {
				const content = await safeInvoke<string>("read_file", {
					path: artifact.url,
				});
				if (content) {
					setFileContent(content);
					setShowPreview(true);
				}
			} catch (e) {
				console.error("[ArtifactRow] Failed to load file:", e);
			}
			setLoadingContent(false);
		}
	};

	const togglePreview = () => {
		if (showPreview) {
			setShowPreview(false);
		} else {
			loadContentForPreview();
		}
	};

	return (
		<div className="rounded-xl bg-surface/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			{/* 头部信息 */}
			<div
				className={cn(
					"flex items-start gap-2 px-3 py-2",
					isPreviewable &&
						"cursor-pointer hover:bg-black/[0.02] dark:hover:bg-surface/[0.02] transition-colors",
				)}
				onClick={isPreviewable ? togglePreview : undefined}
			>
				<div className="mt-0.5 p-1.5 rounded-lg bg-surface ring-1 ring-black/5 dark:ring-white/10">
					{loadingContent ? (
						<Loader2 className="w-3.5 h-3.5 text-text-light animate-spin" />
					) : (
						<Icon className="w-3.5 h-3.5 text-text-muted" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<div className="text-xs font-medium text-text-secondary truncate">
							{artifact.title}
						</div>
						{isPreviewable && (
							<div className="flex items-center gap-1 text-[11px] text-text-light">
								{showPreview ? (
									<>
										<ChevronDown className="w-3 h-3" />
										收起
									</>
								) : (
									<>
										<ChevronRight className="w-3 h-3" />
										预览
									</>
								)}
							</div>
						)}
					</div>
					{artifact.url ? (
						<div className="text-xs text-text-light truncate">
							{artifact.url}
						</div>
					) : artifact.content && !showPreview ? (
						<div className="text-xs text-text-light line-clamp-2 whitespace-pre-wrap">
							{artifact.content.slice(0, 100)}
							{artifact.content.length > 100 ? "..." : ""}
						</div>
					) : null}
				</div>
			</div>

			{/* 图片预览 */}
			{artifact.type === "image" && artifact.url && (
				<div className="px-3 pb-2">
					<InlineImage path={artifact.url} title={artifact.title} />
				</div>
			)}

			{/* HTML 预览 */}
			{showPreview && isHtmlFile && fileContent && (
				<div className="border-t border-border">
					<WebPreviewCard kind="html" html={fileContent} title={fileName} />
				</div>
			)}

			{/* 代码/文本预览 */}
			{showPreview && !isHtmlFile && (fileContent || artifact.content) && (
				<div className="border-t border-border max-h-60 overflow-y-auto">
					<pre className="px-3 py-2 text-xs text-text-secondary whitespace-pre-wrap break-words font-mono">
						{(fileContent || artifact.content || "").slice(0, 3000)}
						{(fileContent || artifact.content || "").length > 3000 &&
							"\n... (内容过长已截断)"}
					</pre>
				</div>
			)}

			{/* PDF 预览 */}
			{isPdfFile && artifact.url && showPreview && (
				<div className="border-t border-border h-80">
					<iframe
						src={toFileUrl(artifact.url)}
						title="PDF Preview"
						className="w-full h-full"
					/>
				</div>
			)}

			{/* 视频预览 */}
			{isVideoFile && artifact.url && showPreview && (
				<div className="border-t border-border">
					<video
						controls
						src={toFileUrl(artifact.url)}
						className="w-full max-h-[360px] bg-black"
					/>
				</div>
			)}

			{/* 音频预览 */}
			{isAudioFile && artifact.url && showPreview && (
				<div className="border-t border-border p-3">
					<audio controls src={toFileUrl(artifact.url)} className="w-full" />
				</div>
			)}
		</div>
	);
});
