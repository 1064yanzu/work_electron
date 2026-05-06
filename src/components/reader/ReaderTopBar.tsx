import {
	BookOpen,
	BookmarkPlus,
	Columns2,
	Highlighter,
	List,
	Maximize2,
	Minimize2,
	PanelLeft,
	Search,
	Settings as SettingsIcon,
	Sparkles,
	Sun,
	Type,
	Volume2,
	X,
} from "lucide-react";

import { READER_THEMES } from "./themes/readerThemes";
import type { ReaderClientSettings } from "../../lib/api/reader";

interface ReaderTopBarProps {
	title: string;
	authors: string[];
	chapterTitle: string | null;
	leftPanel: "toc" | "highlights" | "bookmarks";
	leftPanelOpen: boolean;
	onSetLeftPanel: (panel: "toc" | "highlights" | "bookmarks") => void;
	immersive: boolean;
	onToggleImmersive: () => void;
	rightPanelOpen: boolean;
	onToggleRightPanel: () => void;
	onAddBookmark: () => void;
	onClose: () => void;
	settings: ReaderClientSettings;
	onPatchSettings: (patch: Partial<ReaderClientSettings>) => void;
	onOpenSearch: () => void;
	onOpenSettings: () => void;
	onToggleTts: () => void;
	ttsActive: boolean;
}

export function ReaderTopBar({
	title,
	authors,
	chapterTitle,
	leftPanel,
	leftPanelOpen,
	onSetLeftPanel,
	immersive,
	onToggleImmersive,
	rightPanelOpen,
	onToggleRightPanel,
	onAddBookmark,
	onClose,
	settings,
	onPatchSettings,
	onOpenSearch,
	onOpenSettings,
	onToggleTts,
	ttsActive,
}: ReaderTopBarProps) {
	return (
		<header
			className="reader-topbar"
			data-immersive={immersive ? "true" : "false"}
		>
			<div className="reader-topbar__left">
				<button
					type="button"
					onClick={onClose}
					className="reader-icon-btn"
					title="关闭阅读器（Esc）"
					aria-label="关闭阅读器"
				>
					<X className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<div className="reader-topbar__title">
					<div className="reader-topbar__title-main" title={title}>
						{title}
					</div>
					<div className="reader-topbar__title-sub">
						{authors.length > 0 ? authors.slice(0, 2).join(" · ") : null}
						{chapterTitle ? (
							<>
								{authors.length > 0 ? (
									<span aria-hidden="true"> · </span>
								) : null}
								<span className="reader-topbar__chapter" title={chapterTitle}>
									{chapterTitle}
								</span>
							</>
						) : null}
					</div>
				</div>
			</div>

			<div className="reader-topbar__center">
				<button
					type="button"
					className={`reader-tab ${leftPanel === "toc" && leftPanelOpen ? "is-active" : ""}`}
					onClick={() => onSetLeftPanel("toc")}
					title="目录（⌘1）"
				>
					<List className="w-3.5 h-3.5" strokeWidth={1.5} />
					目录
				</button>
				<button
					type="button"
					className={`reader-tab ${leftPanel === "highlights" && leftPanelOpen ? "is-active" : ""}`}
					onClick={() => onSetLeftPanel("highlights")}
					title="高亮（⌘2）"
				>
					<Highlighter className="w-3.5 h-3.5" strokeWidth={1.5} />
					高亮
				</button>
				<button
					type="button"
					className={`reader-tab ${leftPanel === "bookmarks" && leftPanelOpen ? "is-active" : ""}`}
					onClick={() => onSetLeftPanel("bookmarks")}
					title="书签"
				>
					<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
					书签
				</button>
			</div>

			<div className="reader-topbar__right">
				<ThemeQuickPicker
					value={settings.theme}
					onChange={(theme) => onPatchSettings({ theme })}
				/>
				<FontSizeQuickPicker
					value={settings.font_size}
					onChange={(font_size) => onPatchSettings({ font_size })}
				/>
				<button
					type="button"
					className={`reader-icon-btn ${settings.column_count === 2 ? "is-active" : ""}`}
					title={settings.column_count === 2 ? "切换单栏" : "切换双栏"}
					onClick={() =>
						onPatchSettings({
							column_count: settings.column_count === 2 ? 1 : 2,
						})
					}
					aria-label="切换分栏"
				>
					{settings.column_count === 2 ? (
						<Columns2 className="w-4 h-4" strokeWidth={1.5} />
					) : (
						<PanelLeft className="w-4 h-4" strokeWidth={1.5} />
					)}
				</button>
				<button
					type="button"
					className="reader-icon-btn"
					title="书内搜索（/）"
					onClick={onOpenSearch}
					aria-label="书内搜索"
				>
					<Search className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					className="reader-icon-btn"
					title="加书签（B）"
					onClick={onAddBookmark}
					aria-label="加书签"
				>
					<BookmarkPlus className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					className={`reader-icon-btn ${ttsActive ? "is-active" : ""}`}
					title="朗读（T）"
					onClick={onToggleTts}
					aria-label="朗读"
				>
					<Volume2 className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					className={`reader-icon-btn ${rightPanelOpen ? "is-active" : ""}`}
					title="AI 副驾驶（⌘K）"
					onClick={onToggleRightPanel}
					aria-label="AI 副驾驶"
				>
					<Sparkles className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					className="reader-icon-btn"
					title={immersive ? "退出沉浸（F11 或 ⌘.）" : "沉浸模式（F11 或 ⌘.）"}
					onClick={onToggleImmersive}
					aria-label="沉浸模式"
				>
					{immersive ? (
						<Minimize2 className="w-4 h-4" strokeWidth={1.5} />
					) : (
						<Maximize2 className="w-4 h-4" strokeWidth={1.5} />
					)}
				</button>
				<button
					type="button"
					className="reader-icon-btn"
					title="阅读器设置"
					onClick={onOpenSettings}
					aria-label="阅读器设置"
				>
					<SettingsIcon className="w-4 h-4" strokeWidth={1.5} />
				</button>
			</div>
		</header>
	);
}

function ThemeQuickPicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (theme: string) => void;
}) {
	return (
		<div className="reader-theme-picker" role="group" aria-label="切换主题">
			<Sun
				className="w-3.5 h-3.5 reader-theme-picker__icon"
				strokeWidth={1.5}
			/>
			{READER_THEMES.map((theme) => (
				<button
					key={theme.id}
					type="button"
					title={theme.label}
					aria-label={`切换到主题：${theme.label}`}
					className={`reader-theme-swatch ${value === theme.id ? "is-active" : ""}`}
					onClick={() => onChange(theme.id)}
					style={{ background: theme.swatch }}
				/>
			))}
		</div>
	);
}

function FontSizeQuickPicker({
	value,
	onChange,
}: {
	value: number;
	onChange: (size: number) => void;
}) {
	return (
		<div className="reader-fontsize" role="group" aria-label="字号">
			<Type className="w-3.5 h-3.5 reader-fontsize__icon" strokeWidth={1.5} />
			<button
				type="button"
				className="reader-fontsize__btn"
				onClick={() => onChange(Math.max(12, value - 1))}
				aria-label="缩小字号"
			>
				A-
			</button>
			<span className="reader-fontsize__value tabular-nums">{value}</span>
			<button
				type="button"
				className="reader-fontsize__btn"
				onClick={() => onChange(Math.min(30, value + 1))}
				aria-label="放大字号"
			>
				A+
			</button>
		</div>
	);
}
