/**
 * 分享菜单 — 替代旧 ExportDialog 在预览页的入口。
 * popover 风格，常用导出动作 1 click 完成；点"更多选项"才打开旧 ExportDialog。
 */
import {
	Archive,
	ChevronDown,
	Download,
	FileText,
	FolderOpen,
	Image as ImageIcon,
	Send,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
	designExport,
	type DesignSession,
} from "../../../lib/api/design";
import type { DesignExportFormat } from "../../../../electron/shared/types";
import { toast } from "../../ui/Toast";

interface ShareMenuProps {
	session: DesignSession;
	currentThreadPath?: string;
	currentThreadTitle?: string;
	onAdvancedExport: () => void;
}

interface QuickFormat {
	value: DesignExportFormat;
	label: string;
	description: string;
	Icon: LucideIcon;
}

const QUICK_FORMATS: QuickFormat[] = [
	{
		value: "html-inline",
		label: "HTML 单文件",
		description: "data URI 资源 inline，可邮件分享",
		Icon: FileText,
	},
	{
		value: "html-project",
		label: "HTML 工程",
		description: "保留 index.html + assets/",
		Icon: FolderOpen,
	},
	{
		value: "pdf",
		label: "PDF",
		description: "BrowserWindow.printToPDF",
		Icon: FileText,
	},
	{
		value: "screenshots",
		label: "截图 PNG",
		description: "三断点 desktop/tablet/mobile",
		Icon: ImageIcon,
	},
	{
		value: "zip",
		label: "工程目录",
		description: "工程 + 截图 + 元数据",
		Icon: Archive,
	},
];

export function ShareMenu({
	session,
	currentThreadPath,
	currentThreadTitle,
	onAdvancedExport,
}: ShareMenuProps) {
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (
				!popoverRef.current?.contains(e.target as Node) &&
				!triggerRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		const onEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onEsc);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onEsc);
		};
	}, [open]);

	const handleQuickExport = async (format: DesignExportFormat) => {
		try {
			setSubmitting(true);
			const r = await designExport({
				session_id: session.id,
				format,
				target: { kind: "save-dialog" },
				options:
					format === "screenshots" || format === "zip"
						? { breakpoints: ["desktop", "tablet", "mobile"] }
						: format === "pdf"
							? { page_size: session.mode === "pitch-deck" ? "16:9" : "A4" }
							: undefined,
			});
			toast.success(`已导出: ${r.target_label}`);
			setOpen(false);
		} catch (err) {
			if (err instanceof Error && err.message.includes("已取消")) {
				setOpen(false);
				return;
			}
			toast.error(
				`导出失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSubmitting(false);
		}
	};

	const handleQuickToThread = async () => {
		if (!currentThreadPath) {
			toast.warning("当前没有打开的线程");
			return;
		}
		try {
			setSubmitting(true);
			const r = await designExport({
				session_id: session.id,
				format: "html-project",
				target: { kind: "current-thread", thread_path: currentThreadPath },
			});
			toast.success(`已收纳到线程: ${r.target_label}`);
			setOpen(false);
		} catch (err) {
			toast.error(
				`导出失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="relative">
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				disabled={submitting}
				className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-primary border border-border bg-bg-surface rounded-full hover:bg-warm-200/60 transition-colors disabled:opacity-60"
			>
				<Download className="w-3.5 h-3.5" strokeWidth={1.5} />
				分享
				<ChevronDown
					className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
					strokeWidth={1.8}
				/>
			</button>
			{open ? (
				<div
					ref={popoverRef}
					className="absolute right-0 top-full mt-1.5 w-80 rounded-2xl bg-background border border-border shadow-xl overflow-hidden z-50 animate-thumbnail-fade-in"
				>
					{currentThreadPath ? (
						<button
							type="button"
							disabled={submitting}
							onClick={() => void handleQuickToThread()}
							className="w-full text-left px-3.5 py-2.5 hover:bg-warm-200/60 transition-colors flex items-center gap-2.5 border-b border-border disabled:opacity-50"
						>
							<div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
								<Send
									className="w-3.5 h-3.5 text-primary"
									strokeWidth={1.6}
								/>
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-[12.5px] font-medium text-text-primary">
									收纳到当前线程
								</div>
								<div className="text-[10.5px] text-text-muted truncate">
									{currentThreadTitle ?? currentThreadPath}
								</div>
							</div>
						</button>
					) : null}
					<div className="py-1">
						{QUICK_FORMATS.map(({ value, label, description, Icon }) => (
							<button
								key={value}
								type="button"
								disabled={submitting}
								onClick={() => void handleQuickExport(value)}
								className="w-full text-left px-3.5 py-2 hover:bg-warm-200/60 transition-colors flex items-center gap-2.5 disabled:opacity-50"
							>
								<Icon
									className="w-3.5 h-3.5 text-text-muted shrink-0"
									strokeWidth={1.5}
								/>
								<div className="flex-1 min-w-0">
									<div className="text-[12.5px] text-text-primary">
										{label}
									</div>
									<div className="text-[10.5px] text-text-muted">
										{description}
									</div>
								</div>
							</button>
						))}
					</div>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onAdvancedExport();
						}}
						className="w-full text-left px-3.5 py-2.5 hover:bg-warm-200/60 transition-colors flex items-center gap-2.5 border-t border-border text-[12px] text-primary font-medium"
					>
						<Download className="w-3.5 h-3.5" strokeWidth={1.5} />
						更多选项 / 多目标导出…
					</button>
				</div>
			) : null}
		</div>
	);
}

// 兼容 React Fast Refresh，保持 ref 类型可推断
export type ShareMenuRef = RefObject<HTMLButtonElement>;
