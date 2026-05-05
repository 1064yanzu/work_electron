import {
	ChevronRight,
	FileText,
	Folder,
	MessageSquare,
	Sparkles,
} from "lucide-react";

/**
 * 首屏空状态 — Jordan persona 30 秒"第一个 wow 时刻"
 * 三个引导卡片：创建项目 / 上传资料 / 与 AI 对话
 * 不强引导，只是展示"产品能为你做什么"，CTA 文案克制
 */
export function EmptyOnboarding({
	onCreateProject,
}: {
	onCreateProject: () => void;
}) {
	const items = [
		{
			icon: Folder,
			title: "创建项目",
			desc: "把研究、写作、对话集中起来管理",
			cta: "立即创建",
			onClick: onCreateProject,
			accent: "text-text-primary",
		},
		{
			icon: FileText,
			title: "导入资料",
			desc: "PDF / Word / Markdown，AI 自动整理",
			desc2: "进入项目后从「资料」标签上传",
			accent: "text-text-secondary",
		},
		{
			icon: MessageSquare,
			title: "与 AI 对话",
			desc: "直接提问，引用你的资料库",
			desc2: "进入项目后从「对话」标签开始",
			accent: "text-text-secondary",
		},
	] as const;

	return (
		<div className="flex flex-col items-center gap-8 py-8">
			<div className="flex items-center gap-2 text-text-secondary">
				<Sparkles className="w-4 h-4" strokeWidth={1.5} />
				<p className="text-sm font-medium">从这里开始</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl">
				{items.map((item) => {
					const Icon = item.icon;
					const interactive = "onClick" in item && item.onClick;
					return (
						<button
							key={item.title}
							type="button"
							onClick={interactive ? item.onClick : undefined}
							disabled={!interactive}
							className={`
								group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 text-left
								transition-all duration-200 ease-out
								${
									interactive
										? "cursor-pointer hover:border-warm-400 hover:-translate-y-[1px] hover:shadow-[0_4px_12px_0_rgb(26_26_25/0.06)] active:scale-[0.99]"
										: "cursor-default opacity-90"
								}
							`}
						>
							<div className="w-9 h-9 rounded-xl bg-warm-200 flex items-center justify-center text-text-secondary group-hover:bg-warm-300 transition-colors">
								<Icon className="w-4 h-4" strokeWidth={1.5} />
							</div>
							<div className="space-y-1">
								<h4 className={`text-sm font-semibold ${item.accent}`}>
									{item.title}
								</h4>
								<p className="text-xs text-text-muted leading-relaxed">
									{item.desc}
								</p>
								{"desc2" in item && item.desc2 && (
									<p className="text-[11px] text-text-light leading-relaxed pt-0.5">
										{item.desc2}
									</p>
								)}
							</div>
							{interactive && "cta" in item && item.cta && (
								<div className="flex items-center gap-1 text-xs font-medium text-text-primary mt-1">
									{item.cta}
									<ChevronRight
										className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform"
										strokeWidth={1.5}
									/>
								</div>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
