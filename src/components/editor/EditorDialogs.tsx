import { FileText, LayoutTemplate, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { OutputAsset } from "../../types";

export interface EditorTemplate {
	title: string;
	icon: LucideIcon;
	color: string;
	content: string;
}

export const editorTemplates: EditorTemplate[] = [
	{
		title: "空白文档",
		icon: FileText,
		color: "from-zinc-400 to-zinc-500",
		content: "",
	},
	{
		title: "日报",
		icon: LayoutTemplate,
		color: "from-blue-400 to-blue-600",
		content:
			"# 今日工作日报\n\n## ✅ 已完成工作\n- \n\n## 🚧 进行中工作\n- \n\n## 📅 明日计划\n- ",
	},
	{
		title: "会议纪要",
		icon: LayoutTemplate,
		color: "from-zinc-500 to-zinc-700",
		content:
			"# 会议纪要\n\n**时间**：\n**参会人**：\n\n## 📝 会议内容\n\n## ⚡️ 待办事项\n- [ ] ",
	},
	{
		title: "研究报告",
		icon: LayoutTemplate,
		color: "from-orange-400 to-orange-600",
		content:
			"# 研究报告\n\n## 摘要\n\n## 背景\n\n## 研究方法\n\n## 发现\n\n## 结论\n",
	},
];

interface EditorDialogsProps {
	showBulkDeleteConfirm: boolean;
	selectedForManageCount: number;
	isBulkDeleting: boolean;
	onCloseBulkDeleteConfirm: () => void;
	onConfirmBulkDelete: () => void | Promise<void>;
	showTemplates: boolean;
	templates: EditorTemplate[];
	onCloseTemplates: () => void;
	onCreateFromTemplate: (template: EditorTemplate) => void | Promise<void>;
	deleteConfirm: OutputAsset | null;
	onCloseDeleteConfirm: () => void;
	onConfirmDelete: (target: OutputAsset) => void | Promise<void>;
}

export function EditorDialogs({
	showBulkDeleteConfirm,
	selectedForManageCount,
	isBulkDeleting,
	onCloseBulkDeleteConfirm,
	onConfirmBulkDelete,
	showTemplates,
	templates,
	onCloseTemplates,
	onCreateFromTemplate,
	deleteConfirm,
	onCloseDeleteConfirm,
	onConfirmDelete,
}: EditorDialogsProps) {
	return (
		<>
			{showBulkDeleteConfirm ? (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 mb-2">
							确认批量删除
						</h3>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
							确定要删除选中的 {selectedForManageCount}{" "}
							篇文档吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={onCloseBulkDeleteConfirm}
								className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={() => void onConfirmBulkDelete()}
								disabled={isBulkDeleting}
								className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
							>
								{isBulkDeleting ? "删除中…" : "确认删除"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{showTemplates ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 max-w-lg w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
						<div className="flex items-center justify-between mb-6">
							<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">
								选择模板
							</h3>
							<button
								onClick={onCloseTemplates}
								className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
						<div className="grid grid-cols-2 gap-3">
							{templates.map((tpl) => (
								<button
									key={tpl.title}
									onClick={() => void onCreateFromTemplate(tpl)}
									className="flex flex-col items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl text-left transition-colors group"
								>
									<div
										className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tpl.color} flex items-center justify-center text-white`}
									>
										<tpl.icon className="w-5 h-5" />
									</div>
									<span className="font-medium text-sm text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
										{tpl.title}
									</span>
								</button>
							))}
						</div>
					</div>
				</div>
			) : null}

			{deleteConfirm ? (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 mb-2">
							确认删除
						</h3>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
							确定要删除「{deleteConfirm.title || "未命名文档"}
							」吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={onCloseDeleteConfirm}
								className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={() => void onConfirmDelete(deleteConfirm)}
								className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
