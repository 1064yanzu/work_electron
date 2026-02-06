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
	image: {
		icon: FileImage,
		gradient:
			"from-purple-500/20 to-pink-500/20 border-purple-200/50 dark:border-purple-800/30",
		iconColor: "text-purple-600 dark:text-purple-400",
		label: "图片",
	},
	pdf: {
		icon: FileText,
		gradient:
			"from-red-500/20 to-orange-500/20 border-red-200/50 dark:border-red-800/30",
		iconColor: "text-red-600 dark:text-red-400",
		label: "PDF",
	},
	text: {
		icon: FileText,
		gradient:
			"from-zinc-500/20 to-slate-500/20 border-zinc-200/50 dark:border-zinc-800/30",
		iconColor: "text-zinc-600 dark:text-zinc-400",
		label: "文本",
	},
	code: {
		icon: FileCode,
		gradient:
			"from-emerald-500/20 to-teal-500/20 border-emerald-200/50 dark:border-emerald-800/30",
		iconColor: "text-emerald-600 dark:text-emerald-400",
		label: "代码",
	},
	html: {
		icon: FileCode,
		gradient:
			"from-orange-500/20 to-amber-500/20 border-orange-200/50 dark:border-orange-800/30",
		iconColor: "text-orange-600 dark:text-orange-400",
		label: "HTML",
	},
	video: {
		icon: FileVideo,
		gradient:
			"from-blue-500/20 to-indigo-500/20 border-blue-200/50 dark:border-blue-800/30",
		iconColor: "text-blue-600 dark:text-blue-400",
		label: "视频",
	},
	audio: {
		icon: FileAudio,
		gradient:
			"from-violet-500/20 to-purple-500/20 border-violet-200/50 dark:border-violet-800/30",
		iconColor: "text-violet-600 dark:text-violet-400",
		label: "音频",
	},
	archive: {
		icon: Archive,
		gradient:
			"from-amber-500/20 to-yellow-500/20 border-amber-200/50 dark:border-amber-800/30",
		iconColor: "text-amber-600 dark:text-amber-400",
		label: "压缩包",
	},
	document: {
		icon: FileText,
		gradient:
			"from-blue-500/20 to-cyan-500/20 border-blue-200/50 dark:border-blue-800/30",
		iconColor: "text-blue-600 dark:text-blue-400",
		label: "文档",
	},
	spreadsheet: {
		icon: FileSpreadsheet,
		gradient:
			"from-green-500/20 to-emerald-500/20 border-green-200/50 dark:border-green-800/30",
		iconColor: "text-green-600 dark:text-green-400",
		label: "表格",
	},
	presentation: {
		icon: Presentation,
		gradient:
			"from-orange-500/20 to-red-500/20 border-orange-200/50 dark:border-orange-800/30",
		iconColor: "text-orange-600 dark:text-orange-400",
		label: "演示文稿",
	},
	other: {
		icon: File,
		gradient:
			"from-zinc-500/20 to-slate-500/20 border-zinc-200/50 dark:border-zinc-800/30",
		iconColor: "text-zinc-600 dark:text-zinc-400",
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
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick?.();
			}}
			className={cn(
				"p-1.5 rounded-lg transition-all duration-200",
				"text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
				"hover:bg-zinc-100 dark:hover:bg-zinc-800",
				"active:scale-95",
				className,
			)}
			title={tooltip}
		>
			<Icon className="w-4 h-4" />
		</button>
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
				"bg-white dark:bg-zinc-900/40",
				"border border-zinc-200/60 dark:border-zinc-800/60",
				"hover:border-zinc-300 dark:hover:border-zinc-700",
				"hover:shadow-md hover:-translate-y-0.5",
				"rounded-xl p-3",
				"transition-all duration-300 ease-out",
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
					"transition-all duration-300",
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
					className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate"
					title={fileName}
				>
					{fileName}
				</h4>
				<p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1.5">
					<span>{config.label}</span>
					<span className="w-0.5 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
					<span>{formatFileSize(fileSize)}</span>
					{createdAt && (
						<>
							<span className="w-0.5 h-0.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
							<span>{formatTime(createdAt)}</span>
						</>
					)}
				</p>
				{description && (
					<p className="text-[10px] text-zinc-400 mt-1 line-clamp-1">
						{description}
					</p>
				)}
			</div>

			{/* 操作按钮 - 悬浮显示 */}
			<div
				className={cn(
					"flex items-center gap-0.5",
					"opacity-0 group-hover:opacity-100",
					"transition-opacity duration-200",
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
						"bg-zinc-900/90 dark:bg-zinc-800/90 backdrop-blur-sm",
						"text-[10px] text-zinc-300 font-mono truncate",
						"rounded-lg shadow-lg",
						"animate-in fade-in slide-in-from-top-1 duration-200",
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
			<div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
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
