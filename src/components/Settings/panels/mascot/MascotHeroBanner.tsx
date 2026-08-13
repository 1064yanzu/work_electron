/**
 * MascotHeroBanner — 桌面宠物设置顶部的「英雄横幅」
 *
 * 视觉：左大头像 + 微妙渐变 + 浮动表情贴纸；右侧名字 / tagline / accent chip / personality。
 * 关键交互：accent 颜色作为视觉主色（CSS 变量 + inline gradient 兜底）。
 */
import { Sparkles } from "lucide-react";
import type { MascotMeta } from "../../../../lib/mascot/manifest";
import {
	getMascotAsset,
	type MascotId,
	type MascotSlot,
} from "../../../../lib/mascot/manifest";
import { cn } from "../../../../lib/utils";

interface MascotHeroBannerProps {
	id: MascotId;
	meta: MascotMeta;
	windowEnabled: boolean;
	className?: string;
}

const ORBIT_SLOTS: { slot: MascotSlot; x: string; y: string; size: number }[] =
	[
		{ slot: "emotion-happy", x: "78%", y: "8%", size: 38 },
		{ slot: "emotion-thinking", x: "12%", y: "14%", size: 34 },
		{ slot: "emotion-surprise", x: "82%", y: "70%", size: 32 },
		{ slot: "emotion-sleepy", x: "8%", y: "76%", size: 30 },
	];

export function MascotHeroBanner({
	id,
	meta,
	windowEnabled,
	className,
}: MascotHeroBannerProps) {
	const heroSrc = getMascotAsset(id, "hero");
	const accent = meta.accentColor;

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-3xl border border-border shadow-bai-card",
				className,
			)}
			style={{
				background: `linear-gradient(135deg, ${accent}10 0%, var(--t-bg-surface, #FFFFFF) 60%)`,
			}}
		>
			{/* 装饰：右上角 accent 大色斑（柔和发光） */}
			<div
				aria-hidden
				className="pointer-events-none absolute -top-16 -right-20 h-56 w-56 rounded-full opacity-50 blur-3xl"
				style={{ backgroundColor: `${accent}33` }}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full opacity-30 blur-3xl"
				style={{ backgroundColor: `${accent}22` }}
			/>

			<div className="relative grid grid-cols-1 gap-6 p-7 md:grid-cols-[260px_1fr] md:items-center">
				{/* 英雄区 */}
				<div className="relative flex aspect-square w-full items-center justify-center md:aspect-auto md:h-[220px]">
					<div
						className="absolute inset-3 rounded-full"
						style={{
							background: `radial-gradient(circle at 50% 40%, ${accent}26 0%, transparent 70%)`,
						}}
						aria-hidden
					/>
					{ORBIT_SLOTS.map(({ slot, x, y, size }, idx) => {
						const src = getMascotAsset(id, slot);
						if (!src) return null;
						return (
							<div
								key={slot}
								aria-hidden
								className="absolute rounded-full bg-surface/90 shadow-bai-card animate-mascot-float"
								style={{
									left: x,
									top: y,
									width: size,
									height: size,
									animationDelay: `${idx * 0.6}s`,
								}}
							>
								<img
									src={src}
									alt=""
									draggable={false}
									className="h-full w-full object-contain p-1"
								/>
							</div>
						);
					})}
					{heroSrc ? (
						<img
							src={heroSrc}
							alt={meta.label}
							draggable={false}
							className="relative z-10 h-[170px] w-[170px] animate-mascot-float object-contain drop-shadow-md md:h-[200px] md:w-[200px]"
							style={{ animationDuration: "5s" }}
						/>
					) : (
						<div className="relative z-10 flex h-[170px] w-[170px] items-center justify-center rounded-full bg-warm-200 text-3xl font-semibold text-text-secondary md:h-[200px] md:w-[200px]">
							{meta.label.slice(0, 2)}
						</div>
					)}
				</div>

				{/* 文案区 */}
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<span
							className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
							style={{
								backgroundColor: `${accent}1F`,
								color: accent,
							}}
						>
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{ backgroundColor: accent }}
							/>
							当前形象
						</span>
						<span
							className={cn(
								"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium",
								windowEnabled
									? "border-mint-500/40 bg-mint-500/10 text-mint-600"
									: "border-border bg-background text-text-muted",
							)}
						>
							<span
								className={cn(
									"h-1.5 w-1.5 rounded-full",
									windowEnabled ? "bg-mint-500" : "bg-text-muted/60",
								)}
							/>
							{windowEnabled ? "桌面窗口已开启" : "仅主窗口"}
						</span>
					</div>

					<div>
						<h3 className="text-2xl font-semibold leading-tight tracking-tight text-text-primary">
							{meta.label}
						</h3>
						<p className="mt-1 text-sm font-medium" style={{ color: accent }}>
							{meta.tagline}
						</p>
					</div>

					<p className="text-xs leading-relaxed text-text-secondary">
						{meta.personality}
					</p>

					<div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
						<Sparkles
							className="h-3.5 w-3.5"
							strokeWidth={1.6}
							style={{ color: accent }}
						/>
						<span>
							accent 主色{" "}
							<code className="rounded-lg bg-warm-200 px-1.5 py-0.5 font-mono text-2xs text-text-secondary">
								{accent}
							</code>
						</span>
						{!meta.isBuiltin && (
							<span className="rounded-full bg-warm-200 px-2 py-0.5 text-2xs font-medium text-text-secondary">
								自定义
							</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
