import { Plus } from "lucide-react";
import { Button } from "../ui/Button";

interface NewProjectCardProps {
	expanded: boolean;
	onExpand: () => void;
	onCancel: () => void;
	newProjectName: string;
	onChangeName: (value: string) => void;
	onCreate: () => void;
}

export function NewProjectCard({
	expanded,
	onExpand,
	onCancel,
	newProjectName,
	onChangeName,
	onCreate,
}: NewProjectCardProps) {
	return (
		<div
			className={`group relative w-full bg-surface rounded-2xl border ${expanded ? "border-warm-400" : "border-border"} mb-14 overflow-hidden transition-all duration-200 shadow-[0_1px_2px_0_rgb(26_26_25/0.04)] hover:shadow-[0_4px_12px_0_rgb(26_26_25/0.06)]`}
		>
			{!expanded ? (
				<button
					type="button"
					onClick={onExpand}
					className="w-full text-left cursor-pointer active:scale-[0.995] transition-transform duration-150"
				>
					<div className="px-8 py-9 flex items-center justify-between">
						<div>
							<h2 className="text-[1.25rem] font-semibold leading-[1.25] tracking-[-0.015em] text-text-primary mb-1.5 group-hover:translate-x-0.5 transition-transform duration-200">
								开始新项目
							</h2>
							<p className="text-text-secondary text-[13px] leading-relaxed">
								创建空白文档或选择模板
							</p>
						</div>
						<div className="w-10 h-10 rounded-full bg-cream-900 dark:bg-cream-100 flex items-center justify-center text-cream-100 dark:text-cream-900 group-hover:scale-105 transition-all duration-200">
							<Plus className="w-4 h-4" strokeWidth={1.5} />
						</div>
					</div>
				</button>
			) : (
				<div className="px-8 py-7 animate-in fade-in slide-in-from-top-1 duration-200">
					<h2 className="text-[1.05rem] font-semibold leading-[1.25] tracking-[-0.012em] text-text-primary mb-3">
						新建项目
					</h2>
					<input
						// biome-ignore lint/a11y/noAutofocus: 用户主动展开输入区,自动聚焦符合预期
						autoFocus
						type="text"
						placeholder="项目名称"
						value={newProjectName}
						onChange={(e) => onChangeName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") onCreate();
							if (e.key === "Escape") onCancel();
						}}
						className="w-full px-4 py-3 rounded-full border border-border bg-surface text-text-primary mb-4 focus:outline-none focus:border-warm-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)]"
					/>
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={onCancel}>
							取消
						</Button>
						<Button
							variant="primary"
							onClick={onCreate}
							disabled={!newProjectName.trim()}
						>
							创建
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
