/**
 * FidelityPicker — 精度二选一（线框图 / 高保真）
 */
import { RadioCardGroup, type RadioCardItem } from "../../../ui/RadioCard";
import type { DesignProjectPrecision } from "../../../../lib/api/design";

const WireframePreview = () => (
	<svg
		viewBox="0 0 80 48"
		className="w-full h-full"
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		strokeWidth={1.4}
		strokeLinecap="round"
	>
		<rect x="6" y="6" width="68" height="36" rx="3" />
		<line x1="6" y1="14" x2="74" y2="14" />
		<rect x="10" y="20" width="22" height="3" rx="1.2" />
		<rect x="10" y="26" width="34" height="3" rx="1.2" />
		<rect x="10" y="32" width="28" height="3" rx="1.2" />
		<rect x="52" y="20" width="18" height="18" rx="2" />
	</svg>
);

const HiFiPreview = () => (
	<svg viewBox="0 0 80 48" className="w-full h-full" aria-hidden="true">
		<defs>
			<linearGradient id="hi-fi-bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stopColor="#F4D6C2" />
				<stop offset="100%" stopColor="#D96C46" />
			</linearGradient>
		</defs>
		<rect x="6" y="6" width="68" height="36" rx="4" fill="url(#hi-fi-bg)" />
		<rect x="11" y="11" width="38" height="3" rx="1.5" fill="#FFFFFFBB" />
		<rect x="11" y="17" width="24" height="2.5" rx="1.2" fill="#FFFFFF88" />
		<rect x="11" y="29" width="58" height="8" rx="2" fill="#FFFFFF55" />
		<circle cx="62" cy="13" r="3" fill="#FFFFFFAA" />
	</svg>
);

const ITEMS: RadioCardItem<DesignProjectPrecision>[] = [
	{
		value: "wireframe",
		label: "线框图",
		description: "黑白结构，专注信息层级",
		preview: <WireframePreview />,
	},
	{
		value: "high-fidelity",
		label: "高保真",
		description: "完整色彩与品牌质感",
		preview: <HiFiPreview />,
	},
];

interface FidelityPickerProps {
	value: DesignProjectPrecision;
	onChange: (value: DesignProjectPrecision) => void;
}

export function FidelityPicker({ value, onChange }: FidelityPickerProps) {
	return (
		<RadioCardGroup<DesignProjectPrecision>
			value={value}
			onChange={onChange}
			items={ITEMS}
			size="lg"
			layout="vertical"
			columns={2}
			accent="action"
			aria-label="选择精度"
		/>
	);
}
