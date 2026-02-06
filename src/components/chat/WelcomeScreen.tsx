import { Sparkles } from "lucide-react";

export interface QuickAction {
	id: string;
	label: string;
	icon: React.ElementType; // Lucide icon
	prompt: string;
	isResearch?: boolean;
}

export function WelcomeScreen() {
	return (
		<div className="flex flex-col h-full items-center justify-center -mt-8 animate-in fade-in duration-700 slide-in-from-bottom-4 relative z-10 transition-all">
			{/* Ambient Glow Effects */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-gradient-to-tr from-violet-200/30 to-blue-200/30 dark:from-violet-900/10 dark:to-blue-900/10 rounded-full blur-[80px] pointer-events-none" />

			{/* Welcome Hero */}
			<div className="flex flex-col items-center text-center mb-10 z-10">
				<div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white to-zinc-100 dark:from-zinc-800 dark:to-zinc-900 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 flex items-center justify-center mb-6 ring-1 ring-white/50 dark:ring-white/10">
					<Sparkles className="w-8 h-8 text-zinc-800 dark:text-zinc-100" />
				</div>
				<h3 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-br from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 mb-3 tracking-tight">
					有什么可以帮您的？
				</h3>
				<p className="text-base text-zinc-500 dark:text-zinc-400 max-w-[280px] leading-relaxed">
					我可以帮您深度研究、分析资料、撰写内容，也是您的全能 AI 助手。
				</p>
			</div>
		</div>
	);
}
