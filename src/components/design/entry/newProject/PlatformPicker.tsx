/**
 * PlatformPicker — 多选平台 chip
 *
 * 用于 prototype tab 的「平台」字段，支持多选：
 * responsive / web-desktop / mobile-ios / mobile-android / tablet / desktop-app
 */
import { Smartphone, Tablet, Monitor, Layers, AppWindow } from "lucide-react";
import { RadioCardGroup } from "../../../ui/RadioCard";
import type { DesignProjectPlatform } from "../../../../lib/api/design";

const ITEMS = [
	{
		value: "responsive" as const,
		label: "响应式",
		icon: <Layers className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "web-desktop" as const,
		label: "桌面 Web",
		icon: <Monitor className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "mobile-ios" as const,
		label: "iOS",
		icon: <Smartphone className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "mobile-android" as const,
		label: "Android",
		icon: <Smartphone className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "tablet" as const,
		label: "平板",
		icon: <Tablet className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
	{
		value: "desktop-app" as const,
		label: "桌面应用",
		icon: <AppWindow className="w-3.5 h-3.5" strokeWidth={1.7} />,
	},
];

interface PlatformPickerProps {
	value: DesignProjectPlatform[];
	onChange: (value: DesignProjectPlatform[]) => void;
}

export function PlatformPicker({ value, onChange }: PlatformPickerProps) {
	return (
		<RadioCardGroup<DesignProjectPlatform>
			multi
			value={value}
			onChange={onChange}
			items={ITEMS}
			size="sm"
			layout="horizontal"
			accent="action"
			aria-label="选择目标平台"
		/>
	);
}
