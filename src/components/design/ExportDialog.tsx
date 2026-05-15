import { X, Download } from "lucide-react";
import { useState } from "react";
import type {
	DesignExportFormat,
	DesignExportTarget,
	DesignSession,
} from "../../../electron/shared/types";
import { designExport } from "../../lib/api/design";
import { designStore } from "../../lib/stores";
import { Button } from "../ui/Button";
import { RadioCardGroup } from "../ui/RadioCard";
import { toast } from "../ui/Toast";

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
			toast.error(
				`导出失败: ${err instanceof Error ? err.message : String(err)}`,
			);
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
				className="w-full max-w-2xl rounded-2xl bg-cream-50 border border-cream-300 shadow-bai-pop overflow-hidden dark:border-cream-500/60 dark:bg-cream-900"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="flex items-center justify-between px-5 py-3.5 border-b border-cream-300 dark:border-cream-500/60">
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
						<RadioCardGroup
							value={format}
							onChange={setFormat}
							items={FORMAT_OPTIONS}
							size="md"
							layout="vertical"
							aria-label="导出格式"
						/>
					</section>

					<section>
						<div className="text-xs uppercase tracking-wider text-text-muted mb-2">
							目标
						</div>
						<RadioCardGroup
							value={targetKind}
							onChange={setTargetKind}
							items={[
								{
									value: "save-dialog",
									label: "另存为…",
									description: "弹出系统对话框选择文件夹",
								},
								{
									value: "current-thread",
									label: currentThreadPath
										? `当前线程（${currentThreadTitle || "未命名"}）`
										: "当前线程（未选择）",
									description: currentThreadPath
										? `${currentThreadPath}/designs/`
										: "在 Threads 列表里选一个线程后再来导出",
									disabled: !currentThreadPath,
								},
								{
									value: "folder",
									label: "选择文件夹…",
									description: "弹出系统对话框选择目标目录",
								},
							]}
							size="md"
							layout="vertical"
							aria-label="导出目标"
						/>
					</section>
				</div>

				<footer className="px-5 py-3.5 border-t border-cream-300 flex items-center justify-end gap-3 bg-cream-100/60 dark:border-cream-500/60 dark:bg-cream-800/40">
					<Button type="button" variant="ghost" size="md" onClick={onClose}>
						取消
					</Button>
					<Button
						type="button"
						variant="action"
						size="md"
						onClick={() => void handleExport()}
						disabled={submitting}
					>
						{submitting ? "导出中..." : "导出"}
					</Button>
				</footer>
			</div>
		</div>
	);
}
