import { MessageCircle } from "lucide-react";

export function WelcomeScreen() {
	return (
		<div className="flex flex-col h-full items-center justify-center -mt-8 animate-in fade-in duration-700 slide-in-from-bottom-4 relative z-10 transition-all">
			{/* 暖色调氛围光晕 */}
			<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] bg-primary/[0.04] dark:bg-primary/[0.06] rounded-full blur-[80px] pointer-events-none" />

			{/* 欢迎主区域 */}
			<div className="flex flex-col items-center text-center mb-10 z-10">
				{/* 图标容器 — 暖色调 */}
				<div className="w-14 h-14 rounded-2xl bg-surface border border-border shadow-[rgba(0,0,0,0.05)_0px_4px_24px] flex items-center justify-center mb-6">
					<MessageCircle className="w-7 h-7 text-primary" strokeWidth={1.75} />
				</div>
				{/* 标题 — serif 字体，Claude 风格 */}
				<h3 className="text-[1.4rem] font-serif font-medium text-text-primary mb-3 leading-tight tracking-tight">
					有什么可以帮您的？
				</h3>
				{/* 副标题 */}
				<p className="text-[0.875rem] text-text-muted max-w-[260px] leading-relaxed">
					深度研究、分析资料、撰写内容，您的全能 AI 助手。
				</p>
			</div>
		</div>
	);
}
