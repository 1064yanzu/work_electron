/**
 * ReaderPreviewSample — 阅读器实时排版样张
 *
 * 在设置面板顶部模拟一张 reader page，让 theme / 字体 / 字号 / 行距 / 字间距 / 版宽
 * 的修改立刻可见。所有视觉令牌跟主题面板严格一致。
 */
import {
	getReaderFontStack,
	getReaderTheme,
} from "../../../reader/themes/readerThemes";
import type { ReaderClientSettings } from "../../../../lib/api/reader";

interface ReaderPreviewSampleProps {
	settings: ReaderClientSettings;
}

const SAMPLE_TITLE = "山月不知心底事，水风空落眼前花";
const SAMPLE_BODY = `当一段长文出现在面前，第一眼并不需要把全部读完。眼睛在标题、副标题与首段之间停留几秒，便能感受到「呼吸感」是否成立。
合适的字号、行距与版心宽度，让目光自然下沉；过窄会显得局促，过宽则像在野外走路。
这段示意文字会随你的设置实时变化——把它当作一支测光笔，去寻找最舒适的阅读姿态。`;

export function ReaderPreviewSample({ settings }: ReaderPreviewSampleProps) {
	const theme = getReaderTheme(settings.theme);
	const fontStack = getReaderFontStack(settings.font_family);
	const isDark = theme.tone === "dark";

	const tokens = theme.tokens as Record<string, string>;
	const previewStyle: React.CSSProperties = {
		backgroundColor: tokens["--reader-bg"],
		color: tokens["--reader-fg"],
		fontFamily: fontStack,
		fontSize: `${settings.font_size}px`,
		lineHeight: settings.line_height,
		letterSpacing: `${settings.letter_spacing}em`,
		boxShadow: tokens["--reader-shadow"],
		borderColor: tokens["--reader-border"],
	};

	return (
		<div className="rounded-3xl border border-border bg-cream-50 p-1.5 shadow-bai-card">
			<div
				className="relative overflow-hidden rounded-2xl border"
				style={previewStyle}
			>
				<div
					className="flex items-center justify-between gap-3 border-b px-6 py-3 text-[10.5px] uppercase tracking-[0.2em]"
					style={{
						borderColor: tokens["--reader-border"],
						color: tokens["--reader-fg-light"],
					}}
				>
					<span>第三章 · 风物</span>
					<span className="tabular-nums">37 / 412</span>
				</div>

				<div
					className="px-6 py-7"
					style={{
						maxWidth: `${settings.max_width_ch}ch`,
						margin: "0 auto",
					}}
				>
					<h2
						className="font-semibold leading-tight tracking-tight"
						style={{
							fontSize: `${settings.font_size * 1.6}px`,
							color: tokens["--reader-fg"],
							marginBottom: settings.line_height * 8,
						}}
					>
						{SAMPLE_TITLE}
					</h2>
					<p
						style={{ color: tokens["--reader-fg-muted"] }}
						className="text-[12px] leading-relaxed"
					>
						—— 一段示意，会随排版设置实时调整。
					</p>
					<div
						className="mt-5 space-y-3"
						style={{ color: tokens["--reader-fg"] }}
					>
						{SAMPLE_BODY.split("\n").map((line) => (
							<p key={line.slice(0, 12)}>{line}</p>
						))}
					</div>

					<div
						className="mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
						style={{
							backgroundColor: tokens["--reader-accent-soft"],
							color: tokens["--reader-accent"],
						}}
					>
						<span
							className="h-1.5 w-1.5 rounded-full"
							style={{ backgroundColor: tokens["--reader-accent"] }}
						/>
						高亮颜色：{theme.label}
					</div>
				</div>

				<div
					className="absolute inset-x-6 bottom-3 flex items-center justify-between text-[10.5px]"
					style={{ color: tokens["--reader-fg-light"] }}
				>
					<span>{theme.label}</span>
					<span>
						{isDark ? "夜读模式" : "日间模式"} · {settings.font_size}px ·{" "}
						{settings.line_height.toFixed(2)}
					</span>
				</div>
			</div>
		</div>
	);
}
