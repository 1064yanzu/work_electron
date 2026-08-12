import { useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { EASE, textReveal, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";
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

interface Slide {
	slot: "onboarding-1" | "onboarding-2" | "onboarding-3";
	title: string;
	description: string;
}

const SLIDES: Slide[] = [
	{
		slot: "onboarding-1",
		title: "你好,我是墨鱼君",
		description:
			"一个谐音梗诞生的 IP——「墨鱼君爱摸鱼」。我会陪你完成研究、写作和摸鱼的每一刻。",
	},
	{
		slot: "onboarding-2",
		title: "随时给你安静的陪伴",
		description:
			"思考、整理、提醒、完成。我以一种克制的方式出现在该出现的位置,不打扰你。",
	},
	{
		slot: "onboarding-3",
		title: "挑一个最对眼的我",
		description:
			"三种人格,你喜欢哪一种?也可以随时在「设置 - 桌面宠物」里更换。",
	},
];

export function MascotOnboarding({ onFinish }: MascotOnboardingProps) {
	const { id, setId } = useMascot();
	const [step, setStep] = useState(0);
	const scopeRef = useRef<HTMLDivElement>(null);

	const slide = SLIDES[step];
	// 首次引导只展示内置 IP；用户上传的自定义桌宠在设置面板再选
	const previewId: MascotId =
		id !== "off" && isBuiltinMascotId(id) ? id : "efficiency";
	const previewMeta =
		BUILTIN_MASCOT_META[previewId as keyof typeof BUILTIN_MASCOT_META];

	const isLastStep = step === SLIDES.length - 1;

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
				data-onb-card
				className="relative w-[min(560px,calc(100vw-32px))] rounded-3xl bg-surface shadow-2xl ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 overflow-hidden"
				style={{ backgroundColor: "var(--t-bg-surface)" }}
			>
				<div className="flex items-center justify-between px-7 pt-6 pb-3">
					<div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-light">
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

					<h2
						data-onb-title
						className="text-[22px] font-semibold tracking-tight text-text-primary"
					>
						{slide.title}
					</h2>
					<p
						data-onb-desc
						className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-text-secondary"
					>
						{slide.description}
					</p>
				</div>

				{isLastStep && (
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
										"flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
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
									<div className="text-[11.5px] font-medium text-text-primary">
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
									"h-1 rounded-full transition-all",
									i === step ? "w-6 bg-primary" : "w-1.5 bg-border",
								)}
							/>
						))}
					</div>
					<button
						type="button"
						onClick={handleNext}
						className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
					>
						{isLastStep ? "开始使用" : "下一步"}
						<ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
					</button>
				</div>
			</div>
		</div>
	);
}

export const MASCOT_ONBOARDING_KEY = "mascotOnboardingShown";
