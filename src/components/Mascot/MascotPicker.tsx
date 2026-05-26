import { useState } from "react";
import {
	Check,
	FolderOpen,
	Loader2,
	Pencil,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
	BUILTIN_MASCOT_LIST,
	BUILTIN_MASCOT_META,
	useMascot,
	type CustomMascotMeta,
	type MascotId,
	type MascotSelection,
} from "../../lib/mascotStore";
import { getMascotAsset } from "../../lib/mascot/manifest";

export interface MascotPickerProps {
	value: MascotSelection;
	onChange: (id: MascotSelection) => void;
	className?: string;
	allowOff?: boolean;
	/** 触发自定义桌宠编辑面板（外层弹出 dialog 由父组件管） */
	onEditCustom?: (mascot: CustomMascotMeta) => void;
}

/**
 * MascotPicker — 桌宠选择器（内置 + 自定义）
 *
 * 视觉：每张卡片 hero 头像 + 名字 + tagline + 选中态高亮。
 * - "内置形象" 区段展示 efficiency / cloud / leisure
 * - "我的桌宠" 区段展示用户上传的自定义桌宠 + "+ 添加"卡片
 * - 自定义桌宠卡片悬浮显示编辑 / 删除菜单
 * - "+ 添加"卡片提供两种入口：上传 zip / 从目录导入（兼容 codex hatch-pet）
 */
export function MascotPicker({
	value,
	onChange,
	className,
	allowOff = true,
	onEditCustom,
}: MascotPickerProps) {
	const { customMascots, importCustom, importCustomDir, deleteCustom } =
		useMascot();
	const [importing, setImporting] = useState(false);
	const [importMessage, setImportMessage] = useState<string | null>(null);

	const handleImportResult = (result: {
		success: boolean;
		mascot?: CustomMascotMeta;
		finalId?: string;
		renamed?: boolean;
		error?: string;
	}) => {
		if (result.success && result.mascot) {
			if (result.renamed && result.finalId) {
				setImportMessage(
					`导入成功：id 冲突，已自动重命名为 "${result.finalId}"`,
				);
			} else {
				setImportMessage(`导入成功：${result.mascot.label}`);
			}
			if (result.mascot.id) {
				onChange(result.mascot.id as MascotSelection);
			}
		} else if (result.error && result.error !== "用户取消选择") {
			setImportMessage(`导入失败：${result.error}`);
		}
	};

	const handleImportZip = async () => {
		if (importing) return;
		setImporting(true);
		setImportMessage(null);
		try {
			const result = await importCustom();
			handleImportResult(result);
		} finally {
			setImporting(false);
			setTimeout(() => setImportMessage(null), 5000);
		}
	};

	const handleImportDir = async () => {
		if (importing) return;
		setImporting(true);
		setImportMessage(null);
		try {
			const result = await importCustomDir();
			handleImportResult(result);
		} finally {
			setImporting(false);
			setTimeout(() => setImportMessage(null), 5000);
		}
	};

	// 拖拽导入：根据后缀路由到 zip / 目录 handler。
	// importCustomDir 的后端会再次校验是否目录，所以这里只看后缀就够了。
	const handleImportPath = async (filePath: string) => {
		if (importing) return;
		setImporting(true);
		setImportMessage(null);
		try {
			const result = filePath.toLowerCase().endsWith(".zip")
				? await importCustom(filePath)
				: await importCustomDir(filePath);
			handleImportResult(result);
		} finally {
			setImporting(false);
			setTimeout(() => setImportMessage(null), 5000);
		}
	};

	const handleDelete = async (id: string, label: string) => {
		if (
			typeof window !== "undefined" &&
			!window.confirm(`确认删除自定义桌宠 "${label}"？此操作不可恢复。`)
		) {
			return;
		}
		const result = await deleteCustom(id);
		if (!result.success) {
			setImportMessage(`删除失败：${result.error ?? "未知错误"}`);
			setTimeout(() => setImportMessage(null), 5000);
		}
	};

	return (
		<div className={cn("space-y-6", className)}>
			{/* 内置形象 */}
			<div>
				<SectionLabel>内置形象</SectionLabel>
				<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
					{BUILTIN_MASCOT_LIST.map((id) => (
						<BuiltinMascotCard
							key={id}
							id={id}
							selected={value === id}
							onSelect={() => onChange(id)}
						/>
					))}
					{allowOff && (
						<OffCard
							selected={value === "off"}
							onSelect={() => onChange("off")}
						/>
					)}
				</div>
			</div>

			{/* 我的桌宠 */}
			<div>
				<div className="flex items-baseline justify-between mb-3">
					<SectionLabel>我的桌宠</SectionLabel>
					<span className="text-[11px] text-text-light">
						{customMascots.length} 个 · 兼容 codex hatch-pet 包
					</span>
				</div>
				<div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
					{customMascots.map((mascot) => (
						<CustomMascotCard
							key={mascot.id}
							mascot={mascot}
							selected={value === mascot.id}
							onSelect={() => onChange(mascot.id as MascotSelection)}
							onEdit={onEditCustom ? () => onEditCustom(mascot) : undefined}
							onDelete={() => handleDelete(mascot.id, mascot.label)}
						/>
					))}
					<AddMascotCard
						importing={importing}
						onZip={handleImportZip}
						onDir={handleImportDir}
						onDropPath={handleImportPath}
					/>
				</div>
				{importMessage && (
					<div
						className={cn(
							"mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed",
							importMessage.startsWith("导入失败") ||
								importMessage.startsWith("删除失败")
								? "bg-red-50 text-red-700"
								: "bg-emerald-50 text-emerald-700",
						)}
					>
						{importMessage}
					</div>
				)}
			</div>
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3">
			{children}
		</div>
	);
}

interface BuiltinMascotCardProps {
	id: MascotId;
	selected: boolean;
	onSelect: () => void;
}

function BuiltinMascotCard({ id, selected, onSelect }: BuiltinMascotCardProps) {
	const meta = BUILTIN_MASCOT_META[id as keyof typeof BUILTIN_MASCOT_META];
	const heroSrc = getMascotAsset(id, "hero");

	if (!meta) return null;

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all",
				"hover:shadow-bai-card",
				selected
					? "border-primary bg-primary/5 shadow-bai-card"
					: "border-border bg-surface hover:border-primary/40",
			)}
			style={
				selected ? { boxShadow: `0 8px 24px ${meta.accentColor}1A` } : undefined
			}
		>
			{selected && <SelectedBadge accentColor={meta.accentColor} />}
			<div
				className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform group-hover:scale-105"
				style={{ backgroundColor: `${meta.accentColor}14` }}
			>
				{heroSrc && (
					<img
						src={heroSrc}
						alt={meta.label}
						draggable={false}
						className="h-full w-full object-contain p-1"
					/>
				)}
			</div>
			<CardTitle title={meta.label} tagline={meta.tagline} />
		</button>
	);
}

interface CustomMascotCardProps {
	mascot: CustomMascotMeta;
	selected: boolean;
	onSelect: () => void;
	onEdit?: () => void;
	onDelete: () => void;
}

function CustomMascotCard({
	mascot,
	selected,
	onSelect,
	onEdit,
	onDelete,
}: CustomMascotCardProps) {
	const heroSrc = getMascotAsset(mascot.id, "hero");
	const accentColor = mascot.accentColor;

	return (
		<div
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all",
				"hover:shadow-bai-card",
				selected
					? "border-primary bg-primary/5 shadow-bai-card"
					: "border-border bg-surface hover:border-primary/40",
			)}
			style={
				selected ? { boxShadow: `0 8px 24px ${accentColor}1A` } : undefined
			}
		>
			{selected && <SelectedBadge accentColor={accentColor} />}

			{/* 悬浮显示的右上角操作菜单 */}
			<div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				{onEdit && (
					<IconButton onClick={onEdit} ariaLabel="编辑">
						<Pencil className="h-3 w-3" strokeWidth={2.2} />
					</IconButton>
				)}
				<IconButton onClick={onDelete} ariaLabel="删除" danger>
					<Trash2 className="h-3 w-3" strokeWidth={2.2} />
				</IconButton>
			</div>

			<button
				type="button"
				onClick={onSelect}
				className="flex flex-col items-center gap-2 w-full"
			>
				<div
					className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform group-hover:scale-105"
					style={{ backgroundColor: `${accentColor}14` }}
				>
					{heroSrc ? (
						<img
							src={heroSrc}
							alt={mascot.label}
							draggable={false}
							className="h-full w-full object-contain p-1"
						/>
					) : (
						<span className="text-[20px] font-bold opacity-40">
							{mascot.label.slice(0, 2)}
						</span>
					)}
					{/* badge：是否带 atlas / loading */}
					{(mascot.hasAtlas || mascot.hasLoading) && (
						<span
							className="absolute -bottom-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold shadow-sm"
							style={{ color: accentColor }}
						>
							{mascot.hasAtlas && "atlas"}
							{mascot.hasAtlas && mascot.hasLoading && "·"}
							{mascot.hasLoading && "loading"}
						</span>
					)}
				</div>
				<CardTitle title={mascot.label} tagline={mascot.tagline} />
			</button>
		</div>
	);
}

function CardTitle({ title, tagline }: { title: string; tagline: string }) {
	return (
		<div className="mt-1 space-y-1 w-full">
			<div className="text-[14px] font-semibold tracking-tight text-text-primary line-clamp-1">
				{title}
			</div>
			<div className="text-[11.5px] leading-snug text-text-light line-clamp-2">
				{tagline}
			</div>
		</div>
	);
}

function SelectedBadge({ accentColor }: { accentColor: string }) {
	return (
		<span
			className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm z-10"
			style={{ backgroundColor: accentColor }}
			aria-label="已选"
		>
			<Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
		</span>
	);
}

interface IconButtonProps {
	onClick: () => void;
	ariaLabel: string;
	danger?: boolean;
	children: React.ReactNode;
}

function IconButton({ onClick, ariaLabel, danger, children }: IconButtonProps) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			aria-label={ariaLabel}
			className={cn(
				"inline-flex h-6 w-6 items-center justify-center rounded-full transition",
				danger
					? "bg-white text-red-500 hover:bg-red-50 shadow-sm"
					: "bg-white text-text-secondary hover:bg-warm-100 shadow-sm",
			)}
		>
			{children}
		</button>
	);
}

interface AddMascotCardProps {
	importing: boolean;
	onZip: () => void;
	onDir: () => void;
	/** 拖入 .zip 文件或目录时回调，参数为本地绝对路径。 */
	onDropPath: (filePath: string) => void;
}

function AddMascotCard({
	importing,
	onZip,
	onDir,
	onDropPath,
}: AddMascotCardProps) {
	const [dragOver, setDragOver] = useState(false);

	const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
		// 必须 preventDefault 才能触发 drop；否则浏览器会接管文件
		event.preventDefault();
		event.stopPropagation();
		if (importing) {
			event.dataTransfer.dropEffect = "none";
			return;
		}
		event.dataTransfer.dropEffect = "copy";
		if (!dragOver) setDragOver(true);
	};

	const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
		// 子元素之间互相 drag 也会冒泡 leave，过滤掉
		if (
			event.relatedTarget &&
			event.currentTarget.contains(event.relatedTarget as Node)
		) {
			return;
		}
		setDragOver(false);
	};

	const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setDragOver(false);
		if (importing) return;

		const file = event.dataTransfer.files?.[0];
		if (!file) return;

		// Electron 32+ 移除了 File.path，必须走 preload 暴露的 webUtils.getPathForFile
		const getPath = window.electronAPI?.getPathForFile;
		const filePath = typeof getPath === "function" ? getPath(file) : "";
		if (!filePath) return;

		onDropPath(filePath);
	};

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center transition-all",
				"min-h-[180px]",
				dragOver
					? "border-primary bg-primary/10 scale-[1.01] shadow-bai-card"
					: "border-border hover:border-primary/60 hover:bg-primary/5",
			)}
		>
			<div
				className={cn(
					"flex h-14 w-14 items-center justify-center rounded-full transition-colors",
					dragOver ? "bg-primary/15" : "bg-warm-100 group-hover:bg-primary/10",
				)}
			>
				{importing ? (
					<Loader2 className="h-5 w-5 animate-spin text-primary" />
				) : (
					<Plus
						className={cn(
							"h-5 w-5 transition-colors",
							dragOver
								? "text-primary"
								: "text-text-light group-hover:text-primary",
						)}
						strokeWidth={2}
					/>
				)}
			</div>
			<div className="mt-1 space-y-0.5">
				<div className="text-[13px] font-semibold tracking-tight text-text-primary">
					{importing
						? "正在导入…"
						: dragOver
							? "松开即可导入"
							: "添加自定义桌宠"}
				</div>
				<div className="text-[10.5px] leading-snug text-text-light px-2">
					{dragOver
						? "支持 .zip 包或目录"
						: "可拖入 zip / 目录，也兼容 codex hatch-pet"}
				</div>
			</div>
			<div className="mt-2 flex w-full gap-1.5 px-1">
				<button
					type="button"
					onClick={onZip}
					disabled={importing}
					className={cn(
						"flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition",
						"border-border bg-surface text-text-secondary",
						"hover:border-primary/40 hover:text-primary hover:bg-primary/5",
						"disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					<Upload className="h-3 w-3" strokeWidth={2.2} />
					zip 包
				</button>
				<button
					type="button"
					onClick={onDir}
					disabled={importing}
					className={cn(
						"flex-1 inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition",
						"border-border bg-surface text-text-secondary",
						"hover:border-primary/40 hover:text-primary hover:bg-primary/5",
						"disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					<FolderOpen className="h-3 w-3" strokeWidth={2.2} />
					目录
				</button>
			</div>
		</div>
	);
}

interface OffCardProps {
	selected: boolean;
	onSelect: () => void;
}

function OffCard({ selected, onSelect }: OffCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all",
				selected
					? "border-text-secondary/50 bg-warm-100"
					: "border-border bg-surface hover:border-text-secondary/30",
			)}
		>
			{selected && (
				<span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-text-secondary text-surface shadow-sm">
					<Check className="h-3.5 w-3.5" strokeWidth={3} />
				</span>
			)}
			<div className="flex h-24 w-24 items-center justify-center rounded-full bg-warm-200/60">
				<X className="h-8 w-8 text-text-light" strokeWidth={1.5} />
			</div>
			<div className="mt-1 space-y-1">
				<div className="text-[14px] font-semibold tracking-tight text-text-primary">
					关闭桌面宠物
				</div>
				<div className="text-[11.5px] leading-snug text-text-light">
					回到极简的图标 / SVG 风格
				</div>
			</div>
		</button>
	);
}
