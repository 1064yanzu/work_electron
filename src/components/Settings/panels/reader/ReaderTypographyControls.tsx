/**
 * ReaderTypographyControls — 排版控件集合
 *
 * 字体族 / 字号 / 行距 / 字间距 / 版心宽度 / 分栏 6 项控件，全部用统一的卡片化样式。
 * 所有 Slider 用项目级 SettingsSlider，不依赖 native thumb 样式。
 */
import { Select } from "../../../ui/Select";
import { SettingsChipGroup, SettingsSlider } from "../../ui/SettingsPrimitives";
import {
	READER_FONT_FAMILIES,
	type ReaderFontFamilyId,
} from "../../../reader/themes/readerThemes";
import type { ReaderClientSettings } from "../../../../lib/api/reader";

interface ReaderTypographyControlsProps {
	settings: ReaderClientSettings;
	patch: (next: Partial<ReaderClientSettings>) => void;
}

export function ReaderTypographyControls({
	settings,
	patch,
}: ReaderTypographyControlsProps) {
	return (
		<div className="space-y-5">
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<ControlField label="字体族" hint="切换会立即在所有阅读器窗口生效。">
					<Select
						value={settings.font_family}
						onChange={(e) =>
							patch({ font_family: e.target.value as ReaderFontFamilyId })
						}
						variant="inline"
						options={READER_FONT_FAMILIES.map((f) => ({
							value: f.id,
							label: f.label,
						}))}
					/>
				</ControlField>

				<ControlField label="分栏" hint="双栏适合宽屏 + 长文，适合阅读小说。">
					<SettingsChipGroup<"single" | "double">
						value={settings.column_count === 2 ? "double" : "single"}
						options={[
							{ value: "single", label: "单栏", hint: "默认" },
							{ value: "double", label: "双栏", hint: "实验" },
						]}
						onChange={(v) => patch({ column_count: v === "double" ? 2 : 1 })}
						size="sm"
						fullWidth
					/>
				</ControlField>
			</div>

			<div className="grid grid-cols-1 gap-5 rounded-2xl border border-border bg-cream-50 p-5 lg:grid-cols-2">
				<SettingsSlider
					label="字号"
					value={settings.font_size}
					min={12}
					max={28}
					step={1}
					onChange={(v) => patch({ font_size: v })}
					formatValue={(v) => `${v}px`}
					minLabel="12"
					maxLabel="28"
				/>
				<SettingsSlider
					label="行距"
					value={settings.line_height}
					min={1.3}
					max={2.2}
					step={0.05}
					onChange={(v) => patch({ line_height: Number(v.toFixed(2)) })}
					formatValue={(v) => v.toFixed(2)}
					minLabel="紧凑"
					maxLabel="疏朗"
				/>
				<SettingsSlider
					label="字间距"
					value={settings.letter_spacing}
					min={-0.02}
					max={0.08}
					step={0.005}
					onChange={(v) => patch({ letter_spacing: Number(v.toFixed(3)) })}
					formatValue={(v) => `${v.toFixed(3)}em`}
					minLabel="紧"
					maxLabel="松"
				/>
				<SettingsSlider
					label="版心宽度"
					value={settings.max_width_ch}
					min={50}
					max={100}
					step={1}
					onChange={(v) => patch({ max_width_ch: v })}
					formatValue={(v) => `${v}ch`}
					minLabel="50"
					maxLabel="100"
				/>
			</div>
		</div>
	);
}

function ControlField({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5 rounded-2xl border border-border bg-cream-50 p-4">
			<div>
				<div className="text-[12.5px] font-medium text-text-primary">
					{label}
				</div>
				{hint && (
					<div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
						{hint}
					</div>
				)}
			</div>
			<div className="pt-1">{children}</div>
		</div>
	);
}
