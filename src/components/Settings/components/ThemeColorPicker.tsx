import { Check, Moon, Sun, Monitor } from "lucide-react";
import { type ThemeMode, themeManager } from "../../../lib/theme";
import type { ThemeDefinition } from "../../../lib/themes/themeDefinitions";

interface ThemeColorPickerProps {
	currentColorThemeId: string;
	currentMode: ThemeMode;
	onColorThemeChange: (id: string) => void;
	onModeChange: (mode: ThemeMode) => void;
}

/**
 * 主题选择器 — 可视化卡片式主题选择
 * 包含色彩主题选择 + 亮暗模式切换
 */
export function ThemeColorPicker({
	currentColorThemeId,
	currentMode,
	onColorThemeChange,
	onModeChange,
}: ThemeColorPickerProps) {
	const allThemes = themeManager.getAllThemes();
	const isDark = themeManager.isDark();

	return (
		<div className="space-y-5">
			{/* 亮暗模式切换 */}
			<div>
				<label className="text-sm text-text-secondary mb-2 block">
					外观模式
				</label>
				<div className="grid grid-cols-3 gap-2">
					<ModeButton
						icon={<Sun className="w-4 h-4" />}
						label="浅色"
						isActive={currentMode === "light"}
						onClick={() => onModeChange("light")}
					/>
					<ModeButton
						icon={<Moon className="w-4 h-4" />}
						label="深色"
						isActive={currentMode === "dark"}
						onClick={() => onModeChange("dark")}
					/>
					<ModeButton
						icon={<Monitor className="w-4 h-4" />}
						label="跟随系统"
						isActive={currentMode === "system"}
						onClick={() => onModeChange("system")}
					/>
				</div>
			</div>

			{/* 色彩主题选择 */}
			<div>
				<label className="text-sm text-text-secondary mb-2 block">
					色彩主题
				</label>
				<div className="grid grid-cols-2 gap-3">
					{allThemes.map((theme) => (
						<ThemeCard
							key={theme.id}
							theme={theme}
							isActive={currentColorThemeId === theme.id}
							isDark={isDark}
							onClick={() => onColorThemeChange(theme.id)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

/** 亮暗模式按钮 */
function ModeButton({
	icon,
	label,
	isActive,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`
				flex items-center justify-center gap-1.5 
				px-3 py-2.5 rounded-xl text-sm font-medium
				transition-[color,background-color,border-color,box-shadow] duration-150 ease-out cursor-pointer
				focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
				${
					isActive
						? "bg-[var(--t-primary)] text-[var(--t-primary-fg)] shadow-md"
						: "bg-[var(--t-bg-muted)] text-[var(--t-text-secondary)] hover:bg-[var(--t-border)] hover:text-[var(--t-text-primary)]"
				}
			`}
		>
			{icon}
			{label}
		</button>
	);
}

/** 主题预览卡片 */
function ThemeCard({
	theme,
	isActive,
	isDark,
	onClick,
}: {
	theme: ThemeDefinition;
	isActive: boolean;
	isDark: boolean;
	onClick: () => void;
}) {
	const colors = isDark ? theme.dark : theme.light;

	// glass 主题在实际应用中是半透明的以透出底层渐变球，但在卡片预览中，我们需要赋予其漂亮的静态渐变底图
	const isGlass = theme.id === "glass";
	const cardBg = isGlass
		? isDark
			? "linear-gradient(135deg, #2c1a4d 0%, #0c0714 50%, #133a44 100%)"
			: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #a1c4fd 100%)"
		: colors["--t-bg"];

	return (
		<button
			type="button"
			onClick={onClick}
			className={`
				group relative flex flex-col rounded-xl overflow-hidden
				transition-[color,background-color,border-color,box-shadow] duration-150 ease-out cursor-pointer
				focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
				${
					isActive
						? "ring-2 ring-[var(--t-primary)] shadow-lg scale-[1.02]"
						: "ring-1 ring-[var(--t-border)] hover:ring-[var(--t-primary)]/50 hover:shadow-md"
				}
			`}
		>
			{/* 迷你预览 */}
			<div
				className="relative h-[72px] p-2 flex gap-1.5"
				style={{ background: cardBg }}
			>
				{/* 左侧栏 */}
				<div
					className="w-[30%] rounded-md"
					style={{
						backgroundColor: colors["--t-bg-panel"],
						border: `1px solid ${colors["--t-border"]}`,
					}}
				>
					{/* 模拟列表项 */}
					<div className="p-1.5 space-y-1">
						<div
							className="h-1 rounded-full w-[80%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.4,
							}}
						/>
						<div
							className="h-1 rounded-full w-[60%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.3,
							}}
						/>
						<div
							className="h-1 rounded-full w-[70%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.25,
							}}
						/>
					</div>
				</div>
				{/* 中间区域 */}
				<div
					className="flex-1 rounded-md"
					style={{
						backgroundColor: colors["--t-bg-panel-strong"],
						border: `1px solid ${colors["--t-border"]}`,
					}}
				>
					<div className="p-1.5 space-y-1">
						<div
							className="h-1.5 rounded-full w-[50%]"
							style={{ backgroundColor: colors["--t-primary"], opacity: 0.8 }}
						/>
						<div
							className="h-1 rounded-full w-[90%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.3,
							}}
						/>
						<div
							className="h-1 rounded-full w-[75%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.25,
							}}
						/>
					</div>
				</div>
				{/* 右侧栏 */}
				<div
					className="w-[25%] rounded-md"
					style={{
						backgroundColor: colors["--t-bg-panel"],
						border: `1px solid ${colors["--t-border"]}`,
					}}
				>
					<div className="p-1.5 space-y-1">
						<div
							className="h-2 rounded w-full"
							style={{ backgroundColor: colors["--t-primary"], opacity: 0.15 }}
						/>
						<div
							className="h-1 rounded-full w-[60%]"
							style={{
								backgroundColor: colors["--t-text-muted"],
								opacity: 0.3,
							}}
						/>
					</div>
				</div>
			</div>

			{/* 底部信息 */}
			<div
				className="px-3 py-2.5 flex items-center justify-between"
				style={{
					backgroundColor: colors["--t-bg-surface"],
					borderTop: `1px solid ${colors["--t-border"]}`,
				}}
			>
				<div className="flex items-center gap-2 min-w-0">
					{/* 色彩小圆点 */}
					<div
						className="w-3 h-3 rounded-full shrink-0"
						style={{ backgroundColor: colors["--t-primary"] }}
					/>
					<div className="min-w-0">
						<div
							className="text-xs font-medium truncate"
							style={{ color: colors["--t-text-primary"] }}
						>
							{theme.name}
						</div>
					</div>
				</div>
				{isActive && (
					<div
						className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
						style={{ backgroundColor: colors["--t-primary"] }}
					>
						<Check
							className="w-3 h-3"
							style={{ color: colors["--t-primary-fg"] }}
						/>
					</div>
				)}
			</div>
		</button>
	);
}
