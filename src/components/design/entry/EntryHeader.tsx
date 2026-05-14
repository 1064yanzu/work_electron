import { Palette } from "lucide-react";

export function EntryHeader() {
	return (
		<header className="flex flex-col items-start gap-3">
			<div className="flex items-center gap-3">
				<div className="w-10 h-10 rounded-2xl bg-primary/12 text-primary flex items-center justify-center">
					<Palette className="w-5 h-5" strokeWidth={1.6} />
				</div>
				<h1 className="text-2xl font-semibold text-text-primary tracking-tight">
					设计
				</h1>
			</div>
			<p className="text-sm text-text-muted leading-relaxed max-w-2xl">
				从一句简介到 hi-fi HTML 设计稿。选一个内置设计系统、挑一个 Skill，或者直接新建空白设计。
				完成后会自动跑 5 维自检，并可一键导出到当前线程让 Copilot 接着写代码。
			</p>
		</header>
	);
}
