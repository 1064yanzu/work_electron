/**
 * ReaderThemePicker — 阅读器主题画廊
 *
 * 把六个 ReaderTheme 渲染成迷你「书页」预览卡：
 *  - 真实背景色 + 真实字色块状演示
 *  - accent 圆点
 *  - 选中态：accent 描边 + ring
 */
import { Check } from "lucide-react";
import {
	READER_THEMES,
	type ReaderTheme,
} from "../../../reader/themes/readerThemes";
import { cn } from "../../../../lib/utils";

interface ReaderThemePickerProps {
	value: string;
	onChange: (id: string) => void;
}

export function ReaderThemePicker({ value, onChange }: ReaderThemePickerProps) {
	return (
		<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
			{READER_THEMES.map((t) => (
				<ThemeCard
					key={t.id}
					theme={t}
					selected={value === t.id}
					onSelect={() => onChange(t.id)}
				/>
			))}
		</div>
	);
}

function ThemeCard({
	theme,
	selected,
	onSelect,
}: {
	theme: ReaderTheme;
	selected: boolean;
	onSelect: () => void;
}) {
	const tokens = theme.tokens as Record<string, string>;
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"group relative flex flex-col gap-2 rounded-2xl border p-2 text-left transition-all duration-200 hover:-translate-y-0.5",
				selected
					? "border-text-primary shadow-bai-pop"
					: "border-border bg-cream-50 hover:border-cream-500 hover:bg-surface",
			)}
			style={
				selected
					? {
							boxShadow: `0 0 0 2px ${tokens["--reader-accent"]}33, 0 4px 12px 0 rgb(26 26 25 / 0.06)`,
						}
					: undefined
			}
		>
			{selected && (
				<span
					className="absolute right-2 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm"
					style={{ backgroundColor: tokens["--reader-accent"] }}
				>
					<Check className="h-3 w-3" strokeWidth={3} />
				</span>
			)}
			<div
				className="relative h-[78px] overflow-hidden rounded-xl border"
				style={{
					backgroundColor: tokens["--reader-bg"],
					borderColor: tokens["--reader-border"],
				}}
			>
				<div
					className="absolute left-3 top-3 h-1 w-9 rounded-full"
					style={{ backgroundColor: tokens["--reader-fg"] }}
				/>
				<div
					className="absolute left-3 top-6 h-1 w-16 rounded-full opacity-70"
					style={{ backgroundColor: tokens["--reader-fg-muted"] }}
				/>
				<div
					className="absolute left-3 top-9 h-1 w-12 rounded-full opacity-50"
					style={{ backgroundColor: tokens["--reader-fg-muted"] }}
				/>
				<div
					className="absolute right-3 top-3 h-3 w-3 rounded-full"
					style={{ backgroundColor: tokens["--reader-accent"] }}
				/>
				<div
					className="absolute bottom-3 left-3 h-1 w-20 rounded-full opacity-30"
					style={{ backgroundColor: tokens["--reader-fg-light"] }}
				/>
			</div>
			<div className="flex items-center justify-between px-1">
				<span className="text-[12px] font-semibold text-text-primary">
					{theme.label}
				</span>
				<span
					className="text-[10px] uppercase tracking-[0.18em]"
					style={{ color: tokens["--reader-accent"] }}
				>
					{theme.tone}
				</span>
			</div>
		</button>
	);
}
