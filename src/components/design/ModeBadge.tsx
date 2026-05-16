import {
	Layers,
	Monitor,
	Smartphone,
	Square,
	type LucideIcon,
} from "lucide-react";

interface ModeBadgeProps {
	mode?: string;
	className?: string;
}

const MODE_META: Record<string, { label: string; icon: LucideIcon }> = {
	"web-prototype": { label: "网页原型", icon: Monitor },
	"mobile-mockup": { label: "移动 Mockup", icon: Smartphone },
	"pitch-deck": { label: "演示稿", icon: Layers },
	poster: { label: "海报", icon: Square },
};

export function ModeBadge({ mode, className }: ModeBadgeProps) {
	if (!mode) return null;
	const meta = MODE_META[mode] || { label: mode, icon: Square };
	const Icon = meta.icon;
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warm-200 text-[10px] text-text-muted ${className || ""}`}
		>
			<Icon className="w-3 h-3" strokeWidth={1.5} />
			{meta.label}
		</span>
	);
}
