import { FileText, Settings2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listProviders } from "../../lib/api";
import { EVENTS, events } from "../../lib/events";
import { useMascot } from "../../lib/mascotStore";
import { Mascot } from "../Mascot/Mascot";

interface WelcomeScreenProps {
	/** 点击建议 chip 直接发起对话（由 CopilotMessagePane 注入） */
	onSendMessage?: (content: string) => void;
}

/**
 * 首条消息前的欢迎页。
 * 建议 chip 不是装饰——点击即发送，把空窗变成转化入口。
 * 三条提示对应产品最高频的真实用法：资料总结 / 内容起草 / 文字润色。
 */
const SUGGESTIONS: Array<{
	icon: typeof Sparkles;
	label: string;
	prompt: string;
}> = [
	{
		icon: Sparkles,
		label: "总结资料要点",
		prompt: "帮我总结当前工作目录中资料的核心要点",
	},
	{
		icon: FileText,
		label: "起草文档大纲",
		prompt: "帮我起草一份文档大纲",
	},
	{
		icon: Wand2,
		label: "润色一段文字",
		prompt: "帮我润色一段文字：",
	},
];

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

export function WelcomeScreen({ onSendMessage }: WelcomeScreenProps) {
	const { enabled } = useMascot();
	const hasModel = useHasAvailableModel();

	return (
		// 光学居中用上下 spacer 的 flex 比例（2:3）实现，替代原先的 -mt-8 魔法偏移；
		// 下方 spacer 更大，矮窗口下建议 chip 不会与底部浮条挤压
		<div className="flex flex-col h-full items-center animate-in fade-in duration-700 slide-in-from-bottom-4 relative z-10">
			<div className="flex-[2]" aria-hidden />
			<div className="flex flex-col items-center text-center mb-8 z-10">
				{enabled ? (
					<Mascot slot="state-greet" size="2xl" float wrapperClassName="mb-4" />
				) : (
					<div
						className="w-12 h-12 rounded-full bai-avatar-glow mb-6"
						aria-hidden
					/>
				)}

				<h3
					className="text-[1.5rem] font-semibold text-text-primary mb-2 leading-tight"
					style={{ letterSpacing: "-0.02em" }}
				>
					有什么可以帮您的？
				</h3>

				<p className="text-sm text-text-secondary max-w-[300px] leading-relaxed">
					深度研究、分析资料、撰写内容
				</p>
			</div>

			{hasModel === false && (
				<button
					type="button"
					onClick={() =>
						events.emit(EVENTS.OPEN_SETTINGS, { tab: "ai.models" })
					}
					className="group mb-4 flex w-full max-w-[280px] items-start gap-2.5 rounded-xl border border-warm-400/60 bg-warm-50 px-3.5 py-3 text-left shadow-bai-card transition-[border-color,box-shadow] duration-150 hover:border-warm-400 hover:shadow-bai-pop dark:bg-warm-400/10"
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

			{onSendMessage && (
				<div className="flex flex-col items-center gap-2 w-full max-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:120ms] [animation-fill-mode:both]">
					{SUGGESTIONS.map((item) => (
						<button
							key={item.label}
							type="button"
							onClick={() => onSendMessage(item.prompt)}
							className="group flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-xs text-text-secondary shadow-bai-card transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-warm-400 hover:text-text-primary hover:shadow-bai-pop active:translate-y-0"
						>
							<item.icon
								className="h-3.5 w-3.5 shrink-0 text-text-light transition-colors group-hover:text-text-secondary"
								strokeWidth={1.5}
							/>
							<span className="truncate">{item.label}</span>
						</button>
					))}
				</div>
			)}
			<div className="flex-[3]" aria-hidden />
		</div>
	);
}
