import { X, Download } from "lucide-react";
import { useState } from "react";
import { designExport } from "../../lib/api/design";
import { designStore } from "../../lib/stores";
import { toast } from "../ui/Toast";
import type {
	DesignExportFormat,
	DesignExportTarget,
	DesignSession,
} from "../../../electron/shared/types";

interface ExportDialogProps {
	session: DesignSession;
	currentThreadPath?: string;
	currentThreadTitle?: string;
	onClose: () => void;
}

const FORMAT_OPTIONS: Array<{
	value: DesignExportFormat;
	label: string;
	description: string;
}> = [
	{
		value: "html-inline",
		label: "HTML 内联（单文件）",
		description: "所有资源 inline 成 data URI；可直接邮件 / 分享",
	},
	{
		value: "html-project",
		label: "HTML 工程（目录）",
		description: "保留 index.html + assets/ 结构；适合二次开发",
	},
	{
		value: "pdf",
		label: "PDF",
		description: "用 BrowserWindow.printToPDF 渲染；演示稿走 16:9",
	},
	{
		value: "screenshots",
		label: "截图集（PNG）",
		description: "按 desktop / tablet / mobile 三个断点各导一张",
	},
	{
		value: "zip",
		label: "ZIP 包（目录形态）",
		description: "工程文件 + 截图 + 元数据；用户可手动压缩成 .zip",
	},
	{
		value: "markdown",
		label: "Markdown 简报",
		description: "设计简报 + 方向 + 系统 + 自检分；不含 HTML",
	},
];

type TargetKind = "save-dialog" | "current-thread" | "folder";

export function ExportDialog({
	session,
	currentThreadPath,
	currentThreadTitle,
	onClose,
}: ExportDialogProps) {
	const [format, setFormat] = useState<DesignExportFormat>("html-inline");
	const [targetKind, setTargetKind] = useState<TargetKind>("save-dialog");
	const [submitting, setSubmitting] = useState(false);

	const handleExport = async () => {
		try {
			setSubmitting(true);
			designStore.setExporting(true);
			let target: DesignExportTarget;
			if (targetKind === "current-thread") {
				if (!currentThreadPath) {
					toast.warning("当前没有打开的线程，请先在 Threads 选一个线程");
					return;
				}
				target = { kind: "current-thread", thread_path: currentThreadPath };
			} else if (targetKind === "folder") {
				target = { kind: "save-dialog" };
			} else {
				target = { kind: "save-dialog" };
			}
			const result = await designExport({
				session_id: session.id,
				format,
				target,
				options:
					format === "screenshots" || format === "zip"
						? { breakpoints: ["desktop", "tablet", "mobile"] }
						: format === "pdf"
							? { page_size: session.mode === "pitch-deck" ? "16:9" : "A4" }
							: undefined,
			});
			toast.success(`已导出到: ${result.target_label}`);
			onClose();
		} catch (err) {
			if (err instanceof Error && err.message.includes("已取消")) {
				// user cancelled save dialog
				onClose();
				return;
			}
			console.error("[ExportDialog] export failed", err);
			toast.error(`导出失败: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setSubmitting(false);
			designStore.setExporting(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
			onClick={onClose}
		>
			<div
				className="w-full max-w-2xl rounded-2xl bg-background border border-border shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
					<div className="flex items-center gap-2">
						<Download className="w-4 h-4 text-primary" strokeWidth={1.5} />
						<h3 className="text-base font-semibold text-text-primary">
							导出设计
						</h3>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</header>

				<div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
					<section>
						<div className="text-xs uppercase tracking-wider text-text-muted mb-2">
							格式
						</div>
						<div className="flex flex-col gap-1.5">
							{FORMAT_OPTIONS.map((opt) => {
								const active = format === opt.value;
								return (
									<button
										type="button"
										key={opt.value}
										onClick={() => setFormat(opt.value)}
										className={[
											"text-left px-3 py-2.5 rounded-lg border transition-colors",
											active
												? "border-primary bg-primary/5"
												: "border-border bg-bg-surface hover:border-primary/30",
										].join(" ")}
									>
										<div className="text-sm font-medium text-text-primary">
											{opt.label}
										</div>
										<div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
											{opt.description}
										</div>
									</button>
								);
							})}
						</div>
					</section>

					<section>
						<div className="text-xs uppercase tracking-wider text-text-muted mb-2">
							目标
						</div>
						<div className="flex flex-col gap-1.5">
							<TargetOption
								active={targetKind === "save-dialog"}
								onClick={() => setTargetKind("save-dialog")}
								label="另存为…"
								description="弹出系统对话框选择文件夹"
							/>
							<TargetOption
								active={targetKind === "current-thread"}
								onClick={() => setTargetKind("current-thread")}
								label={
									currentThreadPath
										? `当前线程（${currentThreadTitle || "未命名"}）`
										: "当前线程（未选择）"
								}
								description={
									currentThreadPath
										? `${currentThreadPath}/designs/`
										: "在 Threads 列表里选一个线程后再来导出"
								}
								disabled={!currentThreadPath}
							/>
							<TargetOption
								active={targetKind === "folder"}
								onClick={() => setTargetKind("folder")}
								label="选择文件夹…"
								description="弹出系统对话框选择目标目录"
							/>
						</div>
					</section>
				</div>

				<footer className="px-5 py-3.5 border-t border-border flex items-center justify-end gap-3 bg-bg-surface">
					<button
						type="button"
						onClick={onClose}
						className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary rounded-lg transition-colors"
					>
						取消
					</button>
					<button
						type="button"
						onClick={() => void handleExport()}
						disabled={submitting}
						className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
					>
						{submitting ? "导出中..." : "导出"}
					</button>
				</footer>
			</div>
		</div>
	);
}

function TargetOption({
	active,
	disabled,
	label,
	description,
	onClick,
}: {
	active: boolean;
	disabled?: boolean;
	label: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={[
				"text-left px-3 py-2.5 rounded-lg border transition-colors",
				active
					? "border-primary bg-primary/5"
					: disabled
						? "border-border bg-bg-surface opacity-50 cursor-not-allowed"
						: "border-border bg-bg-surface hover:border-primary/30",
			].join(" ")}
		>
			<div className="text-sm font-medium text-text-primary">{label}</div>
			<div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
				{description}
			</div>
		</button>
	);
}
