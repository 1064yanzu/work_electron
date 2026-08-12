/**
 * MascotMotionGallery — Spritesheet 动效画廊
 *
 * 展示 6 个动效行：idle / thinking / greet / done / sad / sleepy。
 * 每格使用 MascotSprite 实时驱动；带 atlas 元数据徽章。
 */
import { Film } from "lucide-react";
import { MascotSprite } from "../../../Mascot/MascotSprite";
import type { MascotMotion } from "../../../../lib/mascot/manifest";

const MOTION_PREVIEWS: {
	motion: MascotMotion;
	label: string;
	hint: string;
}[] = [
	{ motion: "idle", label: "Idle", hint: "默认呼吸" },
	{ motion: "thinking", label: "Thinking", hint: "Agent 等待" },
	{ motion: "greet", label: "Greet", hint: "上线问候" },
	{ motion: "done", label: "Done", hint: "任务完成" },
	{ motion: "sad", label: "Sad", hint: "错误 / 空数据" },
	{ motion: "sleepy", label: "Sleepy", hint: "长时间无操作" },
];

interface MascotMotionGalleryProps {
	accentColor: string;
}

export function MascotMotionGallery({ accentColor }: MascotMotionGalleryProps) {
	return (
		<div className="space-y-3">
			<div
				className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-cream-50 px-3.5 py-2"
				style={{ borderColor: `${accentColor}22` }}
			>
				<div className="flex items-center gap-2">
					<Film
						className="h-3.5 w-3.5"
						strokeWidth={1.6}
						style={{ color: accentColor }}
					/>
					<span className="text-[11.5px] font-medium text-text-secondary">
						Spritesheet 实时驱动
					</span>
				</div>
				<div className="flex items-center gap-2 text-[10.5px] tabular-nums text-text-muted">
					<span>codex hatch-pet · 1536×1872 · 192×208</span>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
				{MOTION_PREVIEWS.map(({ motion, label, hint }) => (
					<MotionCell
						key={motion}
						motion={motion}
						label={label}
						hint={hint}
						accentColor={accentColor}
					/>
				))}
			</div>
			<p className="text-[10.5px] leading-relaxed text-text-muted">
				每帧时长不等（120–360ms），最后一帧延长以模拟「活物呼吸感」。系统检测到{" "}
				<code className="rounded bg-cream-200 px-1 py-0.5 font-mono text-[11px]">
					prefers-reduced-motion
				</code>{" "}
				时会停在第一帧。
			</p>
		</div>
	);
}

function MotionCell({
	motion,
	label,
	hint,
	accentColor,
}: {
	motion: MascotMotion;
	label: string;
	hint: string;
	accentColor: string;
}) {
	return (
		<div
			className="group flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-cream-500 hover:shadow-bai-card"
			style={{
				background: `linear-gradient(180deg, ${accentColor}0E 0%, var(--t-bg-surface, #FFFFFF) 70%)`,
			}}
		>
			<div
				className="flex items-center justify-center overflow-hidden rounded-2xl"
				style={{
					backgroundColor: `${accentColor}14`,
					width: "84px",
					height: `${(84 * 208) / 192}px`,
				}}
			>
				<MascotSprite motion={motion} size={80} />
			</div>
			<div className="flex flex-col items-center gap-0.5">
				<span
					className="text-[10.5px] font-semibold uppercase tracking-[0.14em]"
					style={{ color: accentColor }}
				>
					{label}
				</span>
				<span className="text-[10.5px] leading-tight text-text-light">
					{hint}
				</span>
			</div>
		</div>
	);
}
