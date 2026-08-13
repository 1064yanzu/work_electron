/**
 * ArtifactCard - 产物卡片组件
 * Claude 风格的高级质感 UI，用于展示 Agent 生成的文件产物
 */
import {
	Archive,
	Download,
	Eye,
	File,
	FileAudio,
	FileCode,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileVideo,
	FolderOpen,
	Library,
	Loader2,
	Presentation,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Tooltip } from "../ui/Tooltip";

export type ArtifactFileType =
	| "image"
	| "pdf"
	| "text"
	| "code"
	| "html"
	| "video"
	| "audio"
	| "archive"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "other";

export interface ArtifactCardProps {
	id: string;
	fileName: string;
	filePath: string;
	fileType: ArtifactFileType;
	fileSize: number;
	mimeType?: string;
	createdAt?: number;
	description?: string;
	isGenerating?: boolean;
	onPreview?: () => void;
	onDownload?: () => void;
	onReveal?: () => void;
	onImportToLibrary?: () => void;
}

// 文件类型配置
const fileTypeConfig: Record<
	ArtifactFileType,
	{
		icon: React.ComponentType<{ className?: string }>;
		gradient: string;
		iconColor: string;
		label: string;
	}
> = {
	// 文件类型一律中性底 + 中性图标：类型区分交给图标形状与标签文字。
	// 之前的「每种类型一套彩色渐变」是典型的 AI 生成配色分布，与近单色体系冲突。
	image: {
		icon: FileImage,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "图片",
	},
	pdf: {
		icon: FileText,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "PDF",
	},
	text: {
		icon: FileText,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "文本",
	},
	code: {
		icon: FileCode,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "代码",
	},
	html: {
		icon: FileCode,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "HTML",
	},
	video: {
		icon: FileVideo,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "视频",
	},
	audio: {
		icon: FileAudio,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "音频",
	},
	archive: {
		icon: Archive,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "压缩包",
	},
	document: {
		icon: FileText,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "文档",
	},
	spreadsheet: {
		icon: FileSpreadsheet,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "表格",
	},
	presentation: {
		icon: Presentation,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "演示文稿",
	},
	other: {
		icon: File,
		gradient: "from-warm-200/70 to-warm-200/70 border-border/50",
		iconColor: "text-text-secondary",
		label: "文件",
	},
};

// 格式化文件大小
function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// 格式化时间
function formatTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;

	if (diff < 60000) return "刚刚";
	if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
	return new Date(timestamp).toLocaleDateString("zh-CN");
}

// 操作按钮组件
function ActionButton({
	icon: Icon,
	tooltip,
	onClick,
	className,
}: {
	icon: React.ComponentType<{ className?: string }>;
	tooltip: string;
	onClick?: () => void;
	className?: string;
}) {
	return (
		<Tooltip content={tooltip} placement="top">
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onClick?.();
				}}
				className={cn(
					"p-1.5 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
					"text-text-light hover:text-text-secondary dark:hover:text-text-light",
					"hover:bg-warm-200",
					"active:scale-95",
					className,
				)}
			>
				<Icon className="w-4 h-4" />
			</button>
		</Tooltip>
	);
}

export default function ArtifactCard({
	id: _id,
	fileName,
	filePath,
	fileType,
	fileSize,
	createdAt,
	description,
	isGenerating = false,
	onPreview,
	onDownload,
	onReveal,
	onImportToLibrary,
}: ArtifactCardProps) {
	const [isHovered, setIsHovered] = useState(false);
	const config = fileTypeConfig[fileType] || fileTypeConfig.other;
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"group relative flex items-center gap-3",
				"bg-surface/40",
				"border border-border/60",
				"hover:border-border",
				"hover:shadow-md hover:-translate-y-0.5",
				"rounded-xl p-3",
				"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250 ease-out",
				"animate-in fade-in slide-in-from-bottom-2",
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* 图标容器 - 渐变背景 */}
			<div
				className={cn(
					"relative flex items-center justify-center",
					"w-10 h-10 rounded-xl border",
					"bg-gradient-to-br shadow-sm",
					"transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
					config.gradient,
					isGenerating && "animate-pulse",
				)}
			>
				{isGenerating ? (
					<Loader2 className={cn("w-5 h-5 animate-spin", config.iconColor)} />
				) : (
					<Icon className={cn("w-5 h-5", config.iconColor)} />
				)}
			</div>

			{/* 文件信息 */}
			<div className="flex-1 min-w-0">
				<h4
					className="text-sm font-medium text-text-primary truncate"
					title={fileName}
				>
					{fileName}
				</h4>
				<p className="text-xs text-text-light mt-0.5 flex items-center gap-1.5">
					<span>{config.label}</span>
					<span className="w-0.5 h-0.5 rounded-full bg-text-light" />
					<span>{formatFileSize(fileSize)}</span>
					{createdAt && (
						<>
							<span className="w-0.5 h-0.5 rounded-full bg-text-light" />
							<span>{formatTime(createdAt)}</span>
						</>
					)}
				</p>
				{description && (
					<p className="text-2xs text-text-light mt-1 line-clamp-1">
						{description}
					</p>
				)}
			</div>

			{/* 操作按钮 - 悬浮显示 */}
			<div
				className={cn(
					"flex items-center gap-0.5",
					"opacity-0 group-hover:opacity-100",
					"transition-opacity duration-150",
				)}
			>
				{onPreview && (
					<ActionButton icon={Eye} tooltip="预览" onClick={onPreview} />
				)}
				{onDownload && (
					<ActionButton
						icon={Download}
						tooltip="下载到本地"
						onClick={onDownload}
					/>
				)}
				{onImportToLibrary && (
					<ActionButton
						icon={Library}
						tooltip="存入资料库"
						onClick={onImportToLibrary}
					/>
				)}
				{onReveal && (
					<ActionButton
						icon={FolderOpen}
						tooltip="打开文件夹"
						onClick={onReveal}
					/>
				)}
			</div>

			{/* 文件路径提示 - 悬浮显示 */}
			{isHovered && filePath && (
				<div
					className={cn(
						"absolute left-0 right-0 -bottom-8 z-10",
						"px-3 py-1.5",
						"bg-surface/90",
						"text-2xs text-text-light font-mono truncate",
						"rounded-lg shadow-lg",
						"animate-in fade-in slide-in-from-top-1 duration-150",
					)}
				>
					{filePath}
				</div>
			)}
		</div>
	);
}

// 产物卡片列表组件
export function ArtifactCardList({
	artifacts,
	onPreview,
	onDownload,
	onReveal,
	onImportToLibrary,
}: {
	artifacts: Array<{
		id: string;
		file_name: string;
		file_path: string;
		file_type: ArtifactFileType;
		file_size: number;
		created_at: number;
		description?: string;
	}>;
	onPreview?: (id: string) => void;
	onDownload?: (id: string) => void;
	onReveal?: (id: string) => void;
	onImportToLibrary?: (id: string) => void;
}) {
	if (artifacts.length === 0) return null;

	return (
		<div className="space-y-2 mt-3">
			<div className="text-2xs font-semibold text-text-light uppercase tracking-wider px-1">
				产物文件 ({artifacts.length})
			</div>
			<div className="space-y-2">
				{artifacts.map((artifact) => (
					<ArtifactCard
						key={artifact.id}
						id={artifact.id}
						fileName={artifact.file_name}
						filePath={artifact.file_path}
						fileType={artifact.file_type}
						fileSize={artifact.file_size}
						createdAt={artifact.created_at}
						description={artifact.description}
						onPreview={onPreview ? () => onPreview(artifact.id) : undefined}
						onDownload={onDownload ? () => onDownload(artifact.id) : undefined}
						onReveal={onReveal ? () => onReveal(artifact.id) : undefined}
						onImportToLibrary={
							onImportToLibrary
								? () => onImportToLibrary(artifact.id)
								: undefined
						}
					/>
				))}
			</div>
		</div>
	);
}
