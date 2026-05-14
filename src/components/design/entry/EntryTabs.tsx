import { Clock, Library, Sparkles, Globe } from "lucide-react";

export type EntryTabKey = "recent" | "systems" | "skills" | "brand";

interface EntryTabsProps {
	value: EntryTabKey;
	onChange: (key: EntryTabKey) => void;
}

const TABS: Array<{
	key: EntryTabKey;
	label: string;
	icon: typeof Clock;
}> = [
	{ key: "recent", label: "最近设计", icon: Clock },
	{ key: "systems", label: "设计系统", icon: Library },
	{ key: "skills", label: "内置 Skill", icon: Sparkles },
	{ key: "brand", label: "品牌", icon: Globe },
];

export function EntryTabs({ value, onChange }: EntryTabsProps) {
	return (
		<nav
			role="tablist"
			aria-label="设计入口"
			className="flex items-center gap-1.5 flex-wrap"
		>
			{TABS.map((t) => {
				const active = value === t.key;
				const Icon = t.icon;
				return (
					<button
						key={t.key}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(t.key)}
						className={[
							"inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium",
							"transition-all duration-150",
							active
								? "bg-bg-subtle text-text-primary border border-border shadow-sm"
								: "text-text-muted hover:text-text-primary hover:bg-warm-200/50 border border-transparent",
						].join(" ")}
					>
						<Icon className="w-3.5 h-3.5" strokeWidth={1.6} />
						{t.label}
					</button>
				);
			})}
		</nav>
	);
}
