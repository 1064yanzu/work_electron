/**
 * MascotEmotionGallery — 桌宠表情 / 状态画廊
 *
 * 与 MotionGallery 不同：这里展示 17 个静态 PNG slot 中的「表情 + 状态」共 10 个。
 * 卡片化网格 + accent 渐变背景 + label。
 */
import {
	getMascotAsset,
	type MascotId,
	type MascotSlot,
} from "../../../../lib/mascot/manifest";

const PREVIEW_SLOTS: {
	slot: MascotSlot;
	label: string;
	group: "emotion" | "state";
}[] = [
	{ slot: "emotion-happy", label: "开心", group: "emotion" },
	{ slot: "emotion-thinking", label: "思考", group: "emotion" },
	{ slot: "emotion-focus", label: "专注", group: "emotion" },
	{ slot: "emotion-surprise", label: "惊讶", group: "emotion" },
	{ slot: "emotion-sad", label: "委屈", group: "emotion" },
	{ slot: "emotion-sleepy", label: "困倦", group: "emotion" },
	{ slot: "state-greet", label: "打招呼", group: "state" },
	{ slot: "state-organize", label: "整理", group: "state" },
	{ slot: "state-remind", label: "提醒", group: "state" },
	{ slot: "state-done", label: "完成", group: "state" },
];

interface MascotEmotionGalleryProps {
	id: MascotId;
	accentColor: string;
}

export function MascotEmotionGallery({
	id,
	accentColor,
}: MascotEmotionGalleryProps) {
	return (
		<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
			{PREVIEW_SLOTS.map(({ slot, label, group }) => (
				<EmotionCell
					key={slot}
					id={id}
					slot={slot}
					label={label}
					group={group}
					accentColor={accentColor}
				/>
			))}
		</div>
	);
}

function EmotionCell({
	id,
	slot,
	label,
	group,
	accentColor,
}: {
	id: MascotId;
	slot: MascotSlot;
	label: string;
	group: "emotion" | "state";
	accentColor: string;
}) {
	const src = getMascotAsset(id, slot);
	return (
		<div
			className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border border-border bg-surface p-3 transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:border-cream-500 hover:shadow-bai-card"
			style={{
				background: `linear-gradient(180deg, ${accentColor}0E 0%, var(--t-bg-surface, #FFFFFF) 60%)`,
			}}
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-3 -top-6 h-12 rounded-full opacity-70 blur-2xl transition-opacity duration-150 group-hover:opacity-100"
				style={{ backgroundColor: `${accentColor}33` }}
			/>
			<div
				className="relative flex h-16 w-16 items-center justify-center rounded-full"
				style={{ backgroundColor: `${accentColor}14` }}
			>
				{src ? (
					<img
						src={src}
						alt={label}
						draggable={false}
						className="h-full w-full object-contain p-0.5 transition-transform duration-150 group-hover:scale-105"
					/>
				) : (
					<span className="text-[11px] text-text-light">缺位</span>
				)}
			</div>
			<div className="relative flex flex-col items-center gap-0.5">
				<span className="text-xs font-medium text-text-primary">
					{label}
				</span>
				<span
					className="text-[11px] uppercase tracking-[0.16em]"
					style={{ color: accentColor }}
				>
					{group === "emotion" ? "Emotion" : "State"}
				</span>
			</div>
		</div>
	);
}
