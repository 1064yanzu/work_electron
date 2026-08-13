import { useEffect, useRef, useState } from "react";
import {
	AlertTriangle,
	ArrowRight,
	Blocks,
	BotMessageSquare,
	CheckCircle2,
	FolderOpen,
	Layers,
	Library,
	MessagesSquare,
	Settings2,
	Sparkles,
} from "lucide-react";
import { listProviders } from "../../lib/api";
import { EVENTS, events } from "../../lib/events";
import { EASE, textReveal, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { useFocusTrap } from "../ui/FocusTrap";
import {
	BUILTIN_MASCOT_LIST,
	BUILTIN_MASCOT_META,
	useMascot,
	type MascotId,
} from "../../lib/mascotStore";
import { isBuiltinMascotId, getMascotAsset } from "../../lib/mascot/manifest";

export interface MascotOnboardingProps {
	onFinish: () => void;
}

/**
 * 引导分三类页面：
 *   mascot —— 原有三张桌宠自我介绍（用 onboarding-N 插画槽位）
 *   tour   —— 三栏布局一句话导览（用真实 rail 图标拼示意图，不放假截图）
 *   model  —— 配置模型：检测是否已有启用的 provider，没有就显著提示去设置
 */
type Slide =
	| {
			kind: "mascot";
			slot: "onboarding-1" | "onboarding-2" | "onboarding-3";
			title: string;
			description: string;
	  }
	| { kind: "tour" | "model"; title: string; description: string };

const SLIDES: Slide[] = [
	{
		kind: "mascot",
		slot: "onboarding-1",
		title: "你好,我是墨鱼君",
		description:
			"一个谐音梗诞生的 IP——「墨鱼君爱摸鱼」。我会陪你完成研究、写作和摸鱼的每一刻。",
	},
	{
		kind: "mascot",
		slot: "onboarding-2",
		title: "随时给你安静的陪伴",
		description:
			"思考、整理、提醒、完成。我以一种克制的方式出现在该出现的位置,不打扰你。",
	},
	{
		kind: "mascot",
		slot: "onboarding-3",
		title: "挑一个最对眼的我",
		description:
			"三种人格,你喜欢哪一种?也可以随时在「设置 - 桌面宠物」里更换。",
	},
	{
		kind: "tour",
		title: "三栏,各司其职",
		description:
			"左边放资料、中间干活、右边问 AI。按 ⌘K 随时用命令面板找任何功能。",
	},
	{
		kind: "model",
		title: "最后一步:接上模型",
		description: "AI 对话、卡片总结都要调用模型,先配一个再开始。",
	},
];

/** 三栏导览的内容：图标 + 一句话，对应 SidebarRail 与主界面的真实分区 */
const TOUR_COLUMNS = [
	{
		icon: Library,
		title: "左栏 · 资料",
		lines: [
			{ icon: FolderOpen, text: "文件：浏览工作目录" },
			{ icon: MessagesSquare, text: "对话：历史会话" },
			{ icon: Library, text: "知识：资料库 / 卡片" },
			{ icon: Blocks, text: "技能：本地 Skill 与市场" },
		],
	},
	{
		icon: Layers,
		title: "中栏 · 工作区",
		lines: [
			{ icon: Layers, text: "标签页式工作区，可分屏对照" },
			{ icon: Layers, text: "运行图 / 预览 / 浏览器 / 终端" },
		],
	},
	{
		icon: BotMessageSquare,
		title: "右栏 · Copilot",
		lines: [
			{ icon: BotMessageSquare, text: "跟 Agent 对话，⌘L 收起" },
			{ icon: BotMessageSquare, text: "工具调用与产物就地可见" },
		],
	},
];

export function MascotOnboarding({ onFinish }: MascotOnboardingProps) {
	const trapRef = useFocusTrap<HTMLDivElement>({ onEscape: onFinish });
	const { id, setId } = useMascot();
	const [step, setStep] = useState(0);
	const scopeRef = useRef<HTMLDivElement>(null);

	// null = 还没查完；true/false = 是否已有启用的 provider
	const [hasProvider, setHasProvider] = useState<boolean | null>(null);

	const slide = SLIDES[step];
	// 首次引导只展示内置 IP；用户上传的自定义桌宠在设置面板再选
	const previewId: MascotId =
		id !== "off" && isBuiltinMascotId(id) ? id : "efficiency";
	const previewMeta =
		BUILTIN_MASCOT_META[previewId as keyof typeof BUILTIN_MASCOT_META];

	const isLastStep = step === SLIDES.length - 1;
	const isMascotPickStep =
		slide.kind === "mascot" && slide.slot === "onboarding-3";

	// 走到「配置模型」这步才查，省掉首屏的一次 IPC；每次回到这步都重查，
	// 这样用户去设置里配完再切回来能立刻看到状态变绿。
	useEffect(() => {
		if (slide.kind !== "model") return;
		let cancelled = false;
		setHasProvider(null);
		void listProviders()
			.then((providers) => {
				if (cancelled) return;
				setHasProvider(
					providers.some((p) => p.is_enabled !== false && p.models.length > 0),
				);
			})
			.catch(() => {
				// 查不到就按「未配置」提示，宁可多提醒一次也不要让用户以为配好了
				if (!cancelled) setHasProvider(false);
			});
		return () => {
			cancelled = true;
		};
	}, [slide.kind]);

	// 首屏入场：遮罩先亮，卡片随后带一点过冲弹出。
	// 分成两条是因为遮罩要"先于"卡片建立背景，同时起会让卡片看起来悬空。
	useGsapMotion(({ gsap, dur, amp }) => {
		const scope = scopeRef.current;
		if (!scope) return;
		const card = scope.querySelector("[data-onb-card]");
		gsap
			.timeline()
			.from(scope, { opacity: 0, duration: dur(0.24), ease: "power1.out" })
			.from(
				card,
				{
					opacity: 0,
					scale: 0.94,
					y: amp(20),
					duration: dur(0.5),
					ease: EASE.spring,
					clearProps: "transform,opacity",
				},
				dur(0.08),
			);
	}, {});

	// 每一步换页：插画 → 标题 → 正文依次进场，最后一步再带出三张人格卡。
	// 这是"一条主时间轴编排分步"的意思——三个元素不是各自淡入，
	// 而是共用一个时间原点、按固定间隔接力，读起来才是一段话而不是三件事。
	useGsapMotion(
		({ gsap, dur, amp, expressive }) => {
			const scope = scopeRef.current;
			if (!scope) return;
			const art = scope.querySelector("[data-onb-art]");
			const title = scope.querySelector<HTMLElement>("[data-onb-title]");
			const desc = scope.querySelector("[data-onb-desc]");
			const picks = scope.querySelectorAll("[data-onb-pick]");

			const tl = gsap.timeline();
			if (art) {
				tl.from(art, {
					opacity: 0,
					scale: 0.86,
					duration: dur(0.52),
					ease: EASE.spring,
					clearProps: "transform,opacity",
				});
			}
			if (title) {
				// 中文按词切不出东西，逐字才有节奏；非 expressive 档 textReveal 直接返回 undefined
				const revert = textReveal(title, {
					type: "chars",
					stagger: 0.022,
					y: 10,
					duration: dur(0.42),
					delay: dur(0.1),
				});
				if (!revert) {
					tl.from(
						title,
						{ opacity: 0, y: amp(8), duration: dur(0.34) },
						dur(0.1),
					);
				}
			}
			if (desc) {
				tl.from(
					desc,
					{
						opacity: 0,
						y: amp(10),
						duration: dur(0.4),
						clearProps: "transform,opacity",
					},
					dur(0.2),
				);
			}
			if (picks.length > 0) {
				tl.from(
					picks,
					{
						opacity: 0,
						y: amp(14),
						scale: 0.94,
						duration: dur(0.44),
						ease: EASE.spring,
						stagger: expressive ? 0.06 : 0,
						clearProps: "transform,opacity",
					},
					dur(0.28),
				);
			}
		},
		{ dependencies: [step] },
	);

	const handleNext = () => {
		if (step < SLIDES.length - 1) {
			setStep((s) => s + 1);
		} else {
			onFinish();
		}
	};

	return (
		<div
			ref={scopeRef}
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
			role="dialog"
			aria-modal
		>
			<div
				ref={trapRef}
				data-onb-card
				className="relative w-[min(560px,calc(100vw-32px))] rounded-3xl bg-surface shadow-2xl ring-1 ring-cream-900/5 dark:ring-cream-100/10 overflow-hidden"
				style={{ backgroundColor: "var(--t-bg-surface)" }}
			>
				<div className="flex items-center justify-between px-7 pt-6 pb-3">
					<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-light">
						<Sparkles className="h-3.5 w-3.5" />
						首次见面
					</div>
					<button
						type="button"
						onClick={onFinish}
						className="text-xs text-text-light transition hover:text-text-primary"
					>
						跳过
					</button>
				</div>

				<div className="px-7 pb-2 text-center">
					{slide.kind === "mascot" && (
						<div
							data-onb-art
							className="relative mx-auto mb-5 flex h-44 w-44 items-center justify-center"
						>
							<div
								className="absolute inset-0 rounded-full opacity-60 blur-2xl"
								style={{
									backgroundColor: `${previewMeta.accentColor}33`,
								}}
							/>
							<img
								key={`${previewId}-${slide.slot}`}
								src={getMascotAsset(previewId, slide.slot)}
								alt={slide.title}
								draggable={false}
								className="relative h-full w-full object-contain animate-mascot-float"
							/>
						</div>
					)}

					{slide.kind === "tour" && (
						<div
							data-onb-art
							className="mx-auto mb-5 grid grid-cols-3 gap-2 text-left"
						>
							{TOUR_COLUMNS.map((col) => (
								<div
									key={col.title}
									className="rounded-2xl border border-border bg-warm-100/60 dark:bg-cream-800/40 p-3"
								>
									<div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
										<col.icon className="h-3.5 w-3.5 text-primary" />
										{col.title}
									</div>
									<ul className="mt-2 space-y-1.5">
										{col.lines.map((line) => (
											<li
												key={line.text}
												className="flex items-start gap-1.5 text-2xs leading-snug text-text-secondary"
											>
												<line.icon className="mt-0.5 h-3 w-3 shrink-0 text-text-light" />
												<span>{line.text}</span>
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					)}

					{slide.kind === "model" && (
						<div
							data-onb-art
							className="mx-auto mb-5 flex h-44 items-center justify-center"
						>
							{hasProvider === null ? (
								<div className="text-sm text-text-light">正在检查模型配置…</div>
							) : hasProvider ? (
								<div className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-8 py-6">
									<CheckCircle2 className="h-10 w-10 text-success" />
									<div className="text-sm font-medium text-text-primary">
										已检测到可用模型
									</div>
									<div className="text-xs text-text-light">
										随时可以在「设置 · 模型」里增删和切换
									</div>
								</div>
							) : (
								<div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-8 py-6">
									<AlertTriangle className="h-9 w-9 text-primary" />
									<div className="text-sm font-medium text-text-primary">
										还没有可用模型
									</div>
									<button
										type="button"
										onClick={() => {
											events.emit(EVENTS.OPEN_SETTINGS, { tab: "ai.models" });
											onFinish();
										}}
										className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
									>
										<Settings2 className="h-3.5 w-3.5" />
										去配置模型
									</button>
								</div>
							)}
						</div>
					)}

					<h2
						data-onb-title
						className="text-2xl font-semibold tracking-tight text-text-primary"
					>
						{slide.title}
					</h2>
					<p
						data-onb-desc
						className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-secondary"
					>
						{slide.description}
					</p>
				</div>

				{isMascotPickStep && (
					<div className="grid grid-cols-3 gap-2 px-7 pt-4">
						{BUILTIN_MASCOT_LIST.map((mid) => {
							const meta = BUILTIN_MASCOT_META[mid];
							const selected = id === mid;
							return (
								<button
									type="button"
									key={mid}
									data-onb-pick
									onClick={() => setId(mid, "main")}
									className={cn(
										"flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-[color,background-color,border-color,opacity,box-shadow,transform]",
										selected
											? "border-primary bg-primary/5"
											: "border-border bg-surface hover:border-primary/40",
									)}
								>
									<div
										className="flex h-12 w-12 items-center justify-center rounded-full"
										style={{ backgroundColor: `${meta.accentColor}14` }}
									>
										<img
											src={getMascotAsset(mid, "hero")}
											alt={meta.label}
											draggable={false}
											className="h-full w-full object-contain p-0.5"
										/>
									</div>
									<div className="text-xs font-medium text-text-primary">
										{meta.label}
									</div>
								</button>
							);
						})}
					</div>
				)}

				<div className="flex items-center justify-between px-7 pb-7 pt-6">
					<div className="flex items-center gap-1.5">
						{SLIDES.map((_, i) => (
							<span
								key={i}
								className={cn(
									"h-1 rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform]",
									i === step ? "w-6 bg-primary" : "w-1.5 bg-border",
								)}
							/>
						))}
					</div>
					{/* 没配模型时把主按钮降级成次要样式：可以跳过，但不假装一切就绪 */}
					<button
						type="button"
						onClick={handleNext}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90",
							isLastStep && hasProvider === false
								? "bg-warm-200 text-text-secondary dark:bg-cream-700"
								: "bg-primary text-primary-foreground",
						)}
					>
						{isLastStep
							? hasProvider === false
								? "稍后再配，先进去看看"
								: "开始使用"
							: "下一步"}
						<ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
					</button>
				</div>
			</div>
		</div>
	);
}

export const MASCOT_ONBOARDING_KEY = "mascotOnboardingShown";
