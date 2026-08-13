import { Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listProviders } from "../../lib/api";
import { EVENTS, events } from "../../lib/events";
import { useMascot } from "../../lib/mascotStore";
import { Mascot } from "../Mascot/Mascot";

/**
 * 首条消息前的欢迎页 —— 只做一句问候。
 *
 * 推荐 query 已整体移除（用户明确不要）：输入框的 placeholder 和
 * 斜杠命令已经说清了「怎么开始」，再铺三条按钮只是噪音。
 * 问候语随时段变化（Claude 桌面端同款），比一句静态的
 * 「深度研究、分析资料、撰写内容」营销文案更像一个真实的开场。
 */
function getTimeGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 5) return "夜深了";
	if (hour < 12) return "早上好";
	if (hour < 14) return "中午好";
	if (hour < 18) return "下午好";
	return "晚上好";
}

/**
 * 检测是否存在至少一个已启用且带模型的 Provider。
 * null 表示检测中（不渲染提示，避免闪烁）。
 */
function useHasAvailableModel(): boolean | null {
	const [hasModel, setHasModel] = useState<boolean | null>(null);

	useEffect(() => {
		let cancelled = false;
		void listProviders()
			.then((providers) => {
				if (cancelled) return;
				setHasModel(
					providers.some((p) => p.is_enabled !== false && p.models.length > 0),
				);
			})
			.catch(() => {
				// 检测失败时不打扰用户（可能是启动早期 IPC 未就绪）
				if (!cancelled) setHasModel(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return hasModel;
}

export function WelcomeScreen() {
	const { enabled } = useMascot();
	const hasModel = useHasAvailableModel();
	// 挂载时取一次即可：欢迎页停留期间跨时段的概率可以忽略
	const [greeting] = useState(getTimeGreeting);

	return (
		// 光学居中用上下 spacer 的 flex 比例（2:3）实现，替代原先的 -mt-8 魔法偏移
		<div className="flex flex-col h-full items-center animate-in fade-in duration-700 slide-in-from-bottom-4 relative z-10">
			<div className="flex-[2]" aria-hidden />
			<div className="flex flex-col items-center text-center z-10">
				{/* 吉祥物克制在 96px —— 它是问候，不是主角；2xl(176px) 会统治整个面板 */}
				{enabled ? (
					<Mascot slot="state-greet" size="lg" float wrapperClassName="mb-5" />
				) : (
					<div
						className="w-12 h-12 rounded-full bai-avatar-glow mb-6"
						aria-hidden
					/>
				)}

				<h3
					className="text-[1.5rem] font-semibold text-text-primary leading-tight"
					style={{ letterSpacing: "-0.02em" }}
				>
					{greeting}
				</h3>

				<p className="mt-2 text-sm text-text-muted">有什么可以帮你的？</p>
			</div>

			{hasModel === false && (
				<button
					type="button"
					onClick={() =>
						events.emit(EVENTS.OPEN_SETTINGS, { tab: "ai.models" })
					}
					className="group mt-7 flex w-full max-w-[280px] items-start gap-2.5 rounded-xl border border-warm-400/60 bg-warm-50 px-3.5 py-3 text-left shadow-bai-card transition-[border-color,box-shadow] duration-150 hover:border-warm-400 hover:shadow-bai-pop dark:bg-warm-400/10"
				>
					<Settings2
						className="mt-0.5 h-4 w-4 shrink-0 text-primary"
						strokeWidth={1.5}
					/>
					<span className="flex flex-col gap-0.5">
						<span className="text-xs font-medium text-text-primary">
							还没有可用的模型
						</span>
						<span className="text-xs leading-relaxed text-text-secondary">
							配置一个 AI 服务商后即可开始对话，点击前往设置
						</span>
					</span>
				</button>
			)}
			<div className="flex-[3]" aria-hidden />
		</div>
	);
}
