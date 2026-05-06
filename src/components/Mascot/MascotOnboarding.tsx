import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
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

	const slide = SLIDES[step];
	// 首次引导只展示内置 IP；用户上传的自定义桌宠在设置面板再选
	const previewId: MascotId =
		id !== "off" && isBuiltinMascotId(id) ? id : "efficiency";
	const previewMeta =
		BUILTIN_MASCOT_META[previewId as keyof typeof BUILTIN_MASCOT_META];

	const handleNext = () => {
		if (step < SLIDES.length - 1) {
			setStep((s) => s + 1);
		} else {
			onFinish();
		}
	};

	return (
		<div
			className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
			role="dialog"
			aria-modal
		>
			<div
				className="relative w-[min(560px,calc(100vw-32px))] rounded-3xl bg-surface shadow-2xl ring-1 ring-zinc-900/5 dark:ring-zinc-100/10 overflow-hidden animate-slide-up"
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
					<div className="relative mx-auto mb-5 flex h-44 w-44 items-center justify-center">
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

					<h2 className="text-[22px] font-semibold tracking-tight text-text-primary">
						{slide.title}
					</h2>
					<p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-text-secondary">
						{slide.description}
					</p>
				</div>

				{step === SLIDES.length - 1 && (
					<div className="grid grid-cols-3 gap-2 px-7 pt-4">
						{BUILTIN_MASCOT_LIST.map((mid) => {
							const meta = BUILTIN_MASCOT_META[mid];
							const selected = id === mid;
							return (
								<button
									type="button"
									key={mid}
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
						{step === SLIDES.length - 1 ? "开始使用" : "下一步"}
						<ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
					</button>
				</div>
			</div>
		</div>
	);
}

export const MASCOT_ONBOARDING_KEY = "mascotOnboardingShown";
