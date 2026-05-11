/**
 * MascotWindowControls — 桌面悬浮窗的控制集合
 *
 * 拆分原则：每一项都是「卡片化的可视控件」，避免 SettingsRow 长串纵向流。
 * 启用 / 穿透 → 双开关条；大小 / 停留 → ChipGroup；勿扰 → time pair。
 */
import {
	Clock,
	Keyboard,
	MoonStar,
	MousePointerClick,
	Power,
	Ruler,
} from "lucide-react";
import { SettingsChipGroup, SettingsSwitch } from "../../ui/SettingsPrimitives";

type SizePreset = "sm" | "md" | "lg" | "xl";
type DwellPreset = "short" | "normal" | "long";

interface MascotWindowControlsProps {
	enabled: boolean;
	onEnabledChange: (next: boolean) => void;
	throughClicks: boolean;
	onThroughClicksChange: (next: boolean) => void;
	sizePreset: SizePreset;
	onSizePresetChange: (next: SizePreset) => void;
	dwellPreset: DwellPreset;
	onDwellPresetChange: (next: DwellPreset) => void;
	dndStart: string;
	dndEnd: string;
	onDndChange: (start: string, end: string) => void;
	globalShortcutEnabled: boolean;
	onGlobalShortcutEnabledChange: (next: boolean) => void;
	accentColor: string;
}

const SIZE_OPTIONS = [
	{ value: "sm" as const, label: "小", hint: "120" },
	{ value: "md" as const, label: "中", hint: "160" },
	{ value: "lg" as const, label: "大", hint: "180" },
	{ value: "xl" as const, label: "特大", hint: "220" },
];

const DWELL_OPTIONS = [
	{ value: "short" as const, label: "较短", hint: "×0.7" },
	{ value: "normal" as const, label: "默认", hint: "×1.0" },
	{ value: "long" as const, label: "较长", hint: "×1.5" },
];

export function MascotWindowControls({
	enabled,
	onEnabledChange,
	throughClicks,
	onThroughClicksChange,
	sizePreset,
	onSizePresetChange,
	dwellPreset,
	onDwellPresetChange,
	dndStart,
	dndEnd,
	onDndChange,
	globalShortcutEnabled,
	onGlobalShortcutEnabledChange,
	accentColor,
}: MascotWindowControlsProps) {
	return (
		<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
			<ControlCard
				icon={<Power className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="启用桌面悬浮窗"
				hint="独立窗口持续陪伴。关闭后只在主窗口内使用。"
				control={
					<SettingsSwitch checked={enabled} onChange={onEnabledChange} />
				}
			/>
			<ControlCard
				icon={<MousePointerClick className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="鼠标穿透"
				hint="开启后宠物不再拦截点击，可让背后窗口正常操作。"
				disabled={!enabled}
				control={
					<SettingsSwitch
						checked={throughClicks}
						onChange={onThroughClicksChange}
						disabled={!enabled}
					/>
				}
			/>
			<ControlCard
				icon={<Ruler className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="宠物大小"
				hint="决定悬浮窗的视觉尺寸（px），立即生效。"
				disabled={!enabled}
				control={
					<SettingsChipGroup<SizePreset>
						value={sizePreset}
						options={SIZE_OPTIONS}
						onChange={onSizePresetChange}
						accentColor={accentColor}
						size="sm"
					/>
				}
				stack
			/>
			<ControlCard
				icon={<Clock className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="通知停留时长"
				hint="完成 / 错误 / 提醒等气泡的停留节奏。"
				disabled={!enabled}
				control={
					<SettingsChipGroup<DwellPreset>
						value={dwellPreset}
						options={DWELL_OPTIONS}
						onChange={onDwellPresetChange}
						accentColor={accentColor}
						size="sm"
					/>
				}
				stack
			/>
			<ControlCard
				icon={<MoonStar className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="勿扰时段"
				hint="该时段内仅 reminder / error 出气泡，done 与 progress 静默。留空表示关闭。"
				disabled={!enabled}
				control={
					<DndTimePair
						start={dndStart}
						end={dndEnd}
						onChange={onDndChange}
						disabled={!enabled}
					/>
				}
				stack
				className="lg:col-span-2"
			/>
			<ControlCard
				icon={<Keyboard className="h-4 w-4" strokeWidth={1.6} />}
				accentColor={accentColor}
				label="全局热键唤醒"
				hint="按 Control+Alt+Space 从任意应用唤出桌宠并打开输入框。被其它程序占用时自动失效。"
				disabled={!enabled}
				control={
					<SettingsSwitch
						checked={globalShortcutEnabled}
						onChange={onGlobalShortcutEnabledChange}
						disabled={!enabled}
					/>
				}
				className="lg:col-span-2"
			/>
		</div>
	);
}

interface ControlCardProps {
	icon: React.ReactNode;
	label: string;
	hint?: string;
	control: React.ReactNode;
	stack?: boolean;
	disabled?: boolean;
	accentColor: string;
	className?: string;
}

function ControlCard({
	icon,
	label,
	hint,
	control,
	stack = false,
	disabled = false,
	accentColor,
	className,
}: ControlCardProps) {
	return (
		<div
			className={[
				"group flex gap-3 rounded-2xl border border-border bg-cream-50 p-4 transition-colors",
				stack ? "flex-col" : "flex-row items-center justify-between",
				disabled ? "opacity-60" : "hover:border-cream-500 hover:bg-surface",
				className ?? "",
			].join(" ")}
		>
			<div className="flex min-w-0 flex-1 items-start gap-3">
				<span
					className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border bg-surface"
					style={{
						color: disabled ? "var(--t-text-muted, #9D9D98)" : accentColor,
					}}
				>
					{icon}
				</span>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-semibold leading-snug text-text-primary">
						{label}
					</div>
					{hint && (
						<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
							{hint}
						</div>
					)}
				</div>
			</div>
			<div className={stack ? "pl-11" : "shrink-0"}>{control}</div>
		</div>
	);
}

interface DndTimePairProps {
	start: string;
	end: string;
	onChange: (start: string, end: string) => void;
	disabled?: boolean;
}

function DndTimePair({ start, end, onChange, disabled }: DndTimePairProps) {
	const inputClass =
		"h-8 w-[100px] rounded-lg border border-border bg-surface px-2.5 text-[12.5px] tabular-nums text-text-primary outline-none transition focus:border-cream-500 focus:shadow-[0_0_0_3px_var(--t-primary-muted)] disabled:opacity-50";
	return (
		<div className="flex items-center gap-2">
			<input
				type="time"
				value={start}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value, end)}
				className={inputClass}
				aria-label="勿扰开始时间"
			/>
			<span className="text-[11.5px] text-text-muted">至</span>
			<input
				type="time"
				value={end}
				disabled={disabled}
				onChange={(e) => onChange(start, e.target.value)}
				className={inputClass}
				aria-label="勿扰结束时间"
			/>
			{(start || end) && !disabled && (
				<button
					type="button"
					onClick={() => onChange("", "")}
					className="ml-1 rounded-md px-2 py-1 text-[11px] text-text-muted transition hover:bg-cream-200 hover:text-text-secondary"
				>
					清除
				</button>
			)}
		</div>
	);
}
