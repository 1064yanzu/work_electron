// 文件附件卡片组件
// 在用户消息中显示附加的文件，参考现代AI IDE的设计风格

import { File, FileArchive, FileImage, FileText, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface AttachedFile {
	title: string;
	path: string;
	type?: "file" | "document";
	size?: number;
	origin?: "file" | "source" | "selection";
	status?: "ready" | "preparing";
}

interface AttachmentCardProps {
	file: AttachedFile;
	onRemove?: () => void;
	variant?: "card" | "chip";
}

// 获取文件图标
function getFileIcon(filename: string) {
	const ext = filename.split(".").pop()?.toLowerCase();

	// 压缩文件
	if (["rar", "zip", "7z", "tar", "gz"].includes(ext || "")) {
		return <FileArchive className="w-4 h-4 text-amber-500" />;
	}

	// 文档类型
	if (["doc", "docx", "pdf", "txt", "md", "rtf"].includes(ext || "")) {
		return <FileText className="w-4 h-4 text-blue-500" />;
	}

	// 图片
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext || "")) {
		return <FileImage className="w-4 h-4 text-emerald-500" />;
	}

	// 默认文件图标
	return <File className="w-4 h-4 text-text-light" />;
}

function formatBytes(bytes?: number): string | null {
	if (!bytes || bytes <= 0) return null;
	const units = ["B", "KB", "MB", "GB"] as const;
	let value = bytes;
	let idx = 0;
	while (value >= 1024 && idx < units.length - 1) {
		value /= 1024;
		idx++;
	}
	const digits = idx === 0 ? 0 : value < 10 ? 1 : 0;
	return `${value.toFixed(digits)} ${units[idx]}`;
}

// 获取文件类型标签
function getFileTypeLabel(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase();

	if (["rar", "zip", "7z", "tar", "gz"].includes(ext || "")) {
		return "文件";
	}

	if (["doc", "docx"].includes(ext || "")) {
		return "文档";
	}

	if (ext === "pdf") {
		return "PDF";
	}

	if (["txt", "md"].includes(ext || "")) {
		return "文本";
	}

	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext || "")) {
		return "图片";
	}

	return "文件";
}

function getOriginLabel(
	origin?: AttachedFile["origin"],
	type?: AttachedFile["type"],
) {
	if (origin === "source") return "资料库";
	if (origin === "selection") return "片段";
	if (type === "document") return "文档";
	return "文件";
}

// 单个附件卡片
export function AttachmentCard({
	file,
	onRemove,
	variant = "card",
}: AttachmentCardProps) {
	const icon = getFileIcon(file.title);
	const typeLabel = getFileTypeLabel(file.title);
	const originLabel = getOriginLabel(file.origin, file.type);
	const sizeLabel = formatBytes(file.size);
	const meta = [
		originLabel,
		file.status === "preparing" ? "准备中" : typeLabel,
		sizeLabel,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-xl",
				"bg-surface",
				"border border-border",
				"hover:border-cream-400 dark:hover:border-cream-500",
				"transition-colors duration-200",
				"cursor-default shadow-sm",
				variant === "chip" ? "px-2.5 py-1.5" : "px-3 py-2",
			)}
			title={`${file.title}${meta ? `\n${meta}` : ""}`}
		>
			{/* 图标容器 */}
			<div
				className={cn(
					"flex items-center justify-center rounded-lg bg-warm-200 dark:bg-cream-700",
					variant === "chip" ? "w-6 h-6" : "w-7 h-7",
				)}
			>
				{icon}
			</div>

			{/* 文件信息 - 只显示文件名 */}
			<div className="min-w-0 flex-1 max-w-[180px]">
				<div
					className={cn(
						"font-medium text-text-primary truncate",
						variant === "chip" ? "text-[13px]" : "text-sm",
					)}
				>
					{file.title}
				</div>
			</div>

			{onRemove ? (
				<button
					type="button"
					onClick={onRemove}
					className="p-1 rounded-lg hover:bg-warm-200 dark:hover:bg-cream-700/50 text-text-light hover:text-text-secondary dark:hover:text-zinc-200 transition-colors"
					title="移除"
				>
					<X className="w-4 h-4" />
				</button>
			) : null}
		</div>
	);
}

// 附件列表组件
interface AttachmentListProps {
	files: AttachedFile[];
}

export function AttachmentList({ files }: AttachmentListProps) {
	if (!files || files.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 mb-2">
			{files.map((file, index) => (
				<AttachmentCard key={`${file.path}-${index}`} file={file} />
			))}
		</div>
	);
}
