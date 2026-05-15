import { Clock, Library, Sparkles, Globe } from "lucide-react";
import { Tabs } from "../../ui/Tabs";

export type EntryTabKey = "recent" | "systems" | "skills" | "brand";

interface EntryTabsProps {
	value: EntryTabKey;
	onChange: (key: EntryTabKey) => void;
}

const TABS = [
	{
		value: "recent" as const,
		label: "最近设计",
		icon: <Clock className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "systems" as const,
		label: "设计系统",
		icon: <Library className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "skills" as const,
		label: "内置 Skill",
		icon: <Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
	{
		value: "brand" as const,
		label: "品牌",
		icon: <Globe className="w-3.5 h-3.5" strokeWidth={1.6} />,
	},
];

export function EntryTabs({ value, onChange }: EntryTabsProps) {
	return (
		<Tabs<EntryTabKey>
			value={value}
			onChange={onChange}
			items={TABS}
			variant="pills"
			size="sm"
			aria-label="设计入口"
		/>
	);
}
