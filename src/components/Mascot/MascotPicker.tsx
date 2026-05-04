import { Check, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
	MASCOT_IDS,
	MASCOT_META,
	type MascotId,
	type MascotSelection,
} from "../../lib/mascotStore";
import { getMascotAsset } from "../../lib/mascot/manifest";

export interface MascotPickerProps {
	value: MascotSelection;
	onChange: (id: MascotSelection) => void;
	className?: string;
	allowOff?: boolean;
}

/**
 * MascotPicker — 三选一 + 关闭 的选择卡片网格
 *
 * 视觉：每张卡片 hero 头像 + 名字 + tagline + 选中态高亮。
 * 关闭项是带 X 图标的灰阶卡片，与 IP 卡片对称。
 */
export function MascotPicker({
	value,
	onChange,
	className,
	allowOff = true,
}: MascotPickerProps) {
	return (
		<div
			className={cn(
				"grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
				className,
			)}
		>
			{MASCOT_IDS.map((id) => (
				<MascotCard
					key={id}
					id={id}
					selected={value === id}
					onSelect={() => onChange(id)}
				/>
			))}
			{allowOff && (
				<OffCard selected={value === "off"} onSelect={() => onChange("off")} />
			)}
		</div>
	);
}

interface MascotCardProps {
	id: MascotId;
	selected: boolean;
	onSelect: () => void;
}

function MascotCard({ id, selected, onSelect }: MascotCardProps) {
	const meta = MASCOT_META[id];
	const heroSrc = getMascotAsset(id, "hero");

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all",
				"hover:shadow-bai-card",
				selected
					? "border-primary bg-primary/5 shadow-bai-card"
					: "border-border bg-surface hover:border-primary/40",
			)}
			style={
				selected
					? { boxShadow: `0 8px 24px ${meta.accentColor}1A` }
					: undefined
			}
		>
			{selected && (
				<span
					className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
					aria-label="已选"
				>
					<Check className="h-3.5 w-3.5" strokeWidth={3} />
				</span>
			)}
			<div
				className="relative flex h-24 w-24 items-center justify-center rounded-full transition-transform group-hover:scale-105"
				style={{ backgroundColor: `${meta.accentColor}14` }}
			>
				{heroSrc && (
					<img
						src={heroSrc}
						alt={meta.label}
						draggable={false}
						className="h-full w-full object-contain p-1"
					/>
				)}
			</div>
			<div className="mt-1 space-y-1">
				<div className="text-[14px] font-semibold tracking-tight text-text-primary">
					{meta.label}
				</div>
				<div className="text-[11.5px] leading-snug text-text-light">
					{meta.tagline}
				</div>
			</div>
		</button>
	);
}

interface OffCardProps {
	selected: boolean;
	onSelect: () => void;
}

function OffCard({ selected, onSelect }: OffCardProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all",
				selected
					? "border-text-secondary/50 bg-warm-100"
					: "border-border bg-surface hover:border-text-secondary/30",
			)}
		>
			{selected && (
				<span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-text-secondary text-surface shadow-sm">
					<Check className="h-3.5 w-3.5" strokeWidth={3} />
				</span>
			)}
			<div className="flex h-24 w-24 items-center justify-center rounded-full bg-warm-200/60">
				<X className="h-8 w-8 text-text-light" strokeWidth={1.5} />
			</div>
			<div className="mt-1 space-y-1">
				<div className="text-[14px] font-semibold tracking-tight text-text-primary">
					关闭 IP 形象
				</div>
				<div className="text-[11.5px] leading-snug text-text-light">
					回到极简的图标 / SVG 风格
				</div>
			</div>
		</button>
	);
}
