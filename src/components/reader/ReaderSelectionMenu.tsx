import {
	Copy,
	Highlighter,
	Languages,
	MessageSquare,
	Sparkles,
	Volume2,
} from "lucide-react";

import type { ReaderEngineSelection } from "./engines/types";
import type { ReaderHighlightColor } from "../../lib/api/reader";

const COLORS: Array<{
	id: ReaderHighlightColor;
	label: string;
	swatch: string;
}> = [
	{ id: "yellow", label: "黄", swatch: "#F5D976" },
	{ id: "peach", label: "桃", swatch: "#F2A88B" },
	{ id: "sky", label: "蓝", swatch: "#9ECDE8" },
	{ id: "sage", label: "绿", swatch: "#A6CFA6" },
	{ id: "lilac", label: "紫", swatch: "#C7B0DA" },
	{ id: "rose", label: "粉", swatch: "#E8A6BF" },
];

interface ReaderSelectionMenuProps {
	selection: ReaderEngineSelection | null;
	onHighlight: (color: ReaderHighlightColor) => void;
	onCopy: () => void;
	onTranslate: () => void;
	onExplain: () => void;
	onAsk: () => void;
	onSpeak: () => void;
	onClose: () => void;
}

export function ReaderSelectionMenu({
	selection,
	onHighlight,
	onCopy,
	onTranslate,
	onExplain,
	onAsk,
	onSpeak,
	onClose,
}: ReaderSelectionMenuProps) {
	if (!selection) return null;
	const top = Math.max(8, selection.rect.top - 12);
	const left = Math.max(
		8,
		Math.min(
			window.innerWidth - 8,
			selection.rect.left + selection.rect.width / 2,
		),
	);

	return (
		<div
			className="reader-selection-menu"
			role="menu"
			aria-label="划词菜单"
			style={{ top, left, transform: "translate(-50%, -100%)" }}
			onMouseDown={(e) => {
				// 阻止划词菜单 mousedown 让 selection 失效
				e.preventDefault();
			}}
		>
			<div className="reader-selection-menu__colors">
				{COLORS.map((c) => (
					<button
						key={c.id}
						type="button"
						className="reader-selection-menu__color"
						aria-label={`高亮：${c.label}`}
						title={`高亮 · ${c.label}`}
						onClick={() => onHighlight(c.id)}
						style={{ background: c.swatch }}
					/>
				))}
			</div>
			<div className="reader-selection-menu__divider" />
			<div className="reader-selection-menu__actions">
				<MenuAction icon={Languages} label="翻译" onClick={onTranslate} />
				<MenuAction icon={Sparkles} label="解释" onClick={onExplain} />
				<MenuAction icon={MessageSquare} label="问 AI" onClick={onAsk} />
				<MenuAction
					icon={Highlighter}
					label="加笔记"
					onClick={() => onHighlight("yellow")}
				/>
				<MenuAction icon={Copy} label="复制" onClick={onCopy} />
				<MenuAction icon={Volume2} label="朗读" onClick={onSpeak} />
			</div>
			<button
				type="button"
				className="reader-selection-menu__close"
				aria-label="关闭"
				onClick={onClose}
			>
				×
			</button>
		</div>
	);
}

function MenuAction({
	icon: Icon,
	label,
	onClick,
}: {
	icon: React.ElementType;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="reader-selection-menu__action"
			title={label}
			onClick={onClick}
		>
			<Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
			<span>{label}</span>
		</button>
	);
}
