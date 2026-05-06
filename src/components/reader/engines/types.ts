import type { ReaderBook, ReaderChapter } from "../../../lib/api/reader";

export type ReaderEngineSelection = {
	/** 当前选中文本 */
	text: string;
	/** 选区的视口位置（划词菜单定位用） */
	rect: DOMRect;
	/** locator 起止：交给 IPC 创建高亮（视格式而定） */
	locator_start: string;
	locator_end: string;
};

export type ReaderEngineProps = {
	book: ReaderBook;
	/** 当前章节（部分引擎可能不依赖） */
	chapter: ReaderChapter | null;
	/** 用户请求打开的章节定位，可能带 EPUB/HTML 锚点片段。 */
	requestedChapterId?: string | null;
	/** 字体 / 字号 / 行高 / 列数 等渲染参数（已合成） */
	typography: {
		fontFamilyStack: string;
		fontSizePx: number;
		lineHeight: number;
		letterSpacingEm: number;
		columnCount: 1 | 2;
		maxWidthCh: number;
	};
	/** 引擎要求父级隐藏 chrome 时调用 */
	onRequestImmersive?: (immersive: boolean) => void;
	/** 阅读位置发生变化时上报（节流交给父组件） */
	onPositionChange?: (locator: string, percent: number) => void;
	/** 外部进度条请求跳到章节内某个百分比位置。 */
	seekPercentRequest?: { percent: number; nonce: number } | null;
	/** 跳到下一章节 / 上一章节（顶栏快捷键、目录点击通用） */
	onRequestNavigate?: (
		direction: "prev" | "next" | "to",
		chapterId?: string,
	) => void;
	/** 划词时触发（父组件展示 ReaderSelectionMenu） */
	onSelectionChange?: (selection: ReaderEngineSelection | null) => void;
	/** 持续 hover 用于 chrome 自动隐藏的"用户活动"上报（可选） */
	onUserActivity?: () => void;
	className?: string;
};
