/**
 * PtyScreenAggregator —— 用 @xterm/headless 维护一个虚拟终端屏幕，把 pty
 * stdout 的 ANSI 序列「画」在不显示的虚拟屏上，供 IM 远控终端按需取出：
 *   - 纯文本快照（trimRight）
 *   - 带 ANSI 转义的彩色快照（Discord codeblock 等直接渲染）
 *   - markdown 友好快照（关键色映射为加粗 / 区块）
 *
 * 还提供 viewport（滚屏）/ diff（新行高亮）/ statusLine / detectContext
 * （上下文按钮）能力，配合 PtyBridgeService 给手机端尽量好的体验。
 */
import { createRequire } from "node:module";
import type { IBufferCell, Terminal as TerminalCtor } from "@xterm/headless";
import { detectScreenContext, type ScreenContext } from "./screenContextDetect";

// @xterm/headless@6.0.0 的 package.json `module` 字段指向不存在的 lib/xterm.mjs，
// 且其 CJS 产物是 IIFE 包装，Node 原生 ESM 无法对它做命名导入。走 createRequire
// 强制以 CJS 加载，绕开 "Named export 'Terminal' not found" 的限制。
const requireFromHere = createRequire(import.meta.url);
const { Terminal } = requireFromHere("@xterm/headless") as {
	Terminal: typeof TerminalCtor;
};
type Terminal = TerminalCtor;

export type PtyScreenAggregatorOptions = {
	cols: number;
	rows: number;
	/** scrollback 行数；为 0 时仅保留当前可视区。 */
	scrollback?: number;
};

export type SnapshotOptions = {
	/**
	 * 取屏开始的相对位置。
	 * - "viewport" —— 当前手动滚屏位置（默认）
	 * - "bottom"   —— 强制取最近一帧（用于"跟到底"）
	 */
	from?: "viewport" | "bottom";
	/** 取多少行；默认 = rows */
	lineCount?: number;
};

export type StatusLineMeta = {
	command: string;
	cwd: string;
	pid: number | string;
	startedAt: number;
	cols: number;
	rows: number;
};

/**
 * cell 当前的 SGR 属性快照。changed() 用于判断是否要重新输出 escape。
 */
type CellAttr = {
	fgMode: number;
	fgColor: number;
	bgMode: number;
	bgColor: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	dim: boolean;
	inverse: boolean;
	strikethrough: boolean;
};

const RESET_ATTR: CellAttr = {
	fgMode: 0,
	fgColor: 0,
	bgMode: 0,
	bgColor: 0,
	bold: false,
	italic: false,
	underline: false,
	dim: false,
	inverse: false,
	strikethrough: false,
};

function readAttr(cell: IBufferCell): CellAttr {
	return {
		fgMode: cell.getFgColorMode(),
		fgColor: cell.getFgColor(),
		bgMode: cell.getBgColorMode(),
		bgColor: cell.getBgColor(),
		bold: Boolean(cell.isBold()),
		italic: Boolean(cell.isItalic()),
		underline: Boolean(cell.isUnderline()),
		dim: Boolean(cell.isDim()),
		inverse: Boolean(cell.isInverse()),
		strikethrough: Boolean(cell.isStrikethrough()),
	};
}

function attrEqual(a: CellAttr, b: CellAttr): boolean {
	return (
		a.fgMode === b.fgMode &&
		a.fgColor === b.fgColor &&
		a.bgMode === b.bgMode &&
		a.bgColor === b.bgColor &&
		a.bold === b.bold &&
		a.italic === b.italic &&
		a.underline === b.underline &&
		a.dim === b.dim &&
		a.inverse === b.inverse &&
		a.strikethrough === b.strikethrough
	);
}

/** 把 xterm 的 color mode/value 翻译成 SGR 参数 fragment。 */
function colorSgr(mode: number, color: number, isBg: boolean): string[] {
	// 0 = DEFAULT, 1 = PALETTE (16), 2 = PALETTE_256, 3 = RGB
	if (mode === 1) {
		const idx = color & 15;
		const base = isBg ? 40 : 30;
		if (idx < 8) return [String(base + idx)];
		return [String(base + 60 + (idx - 8))];
	}
	if (mode === 2) {
		return [isBg ? "48" : "38", "5", String(color & 0xff)];
	}
	if (mode === 3) {
		const r = (color >> 16) & 0xff;
		const g = (color >> 8) & 0xff;
		const b = color & 0xff;
		return [isBg ? "48" : "38", "2", String(r), String(g), String(b)];
	}
	return [];
}

/** 构造把 prev 状态切换到 next 的 SGR 序列；返回空字符串表示无需切换。 */
function diffAttrSgr(prev: CellAttr, next: CellAttr): string {
	if (attrEqual(prev, next)) return "";
	// 任一属性变化时全量重新发：兼容性最好，体积只多几个字节
	const params: string[] = ["0"];
	if (next.bold) params.push("1");
	if (next.dim) params.push("2");
	if (next.italic) params.push("3");
	if (next.underline) params.push("4");
	if (next.inverse) params.push("7");
	if (next.strikethrough) params.push("9");
	params.push(...colorSgr(next.fgMode, next.fgColor, false));
	params.push(...colorSgr(next.bgMode, next.bgColor, true));
	return `\x1b[${params.join(";")}m`;
}

export class PtyScreenAggregator {
	private readonly terminal: Terminal;
	private viewportPinned = true; // 是否锁定到当前最近一帧
	private viewportTop = 0; // 手动滚屏时的起点行号（绝对 buffer 行号）
	private lastPlainLines: string[] = [];

	constructor(options: PtyScreenAggregatorOptions) {
		this.terminal = new Terminal({
			cols: options.cols,
			rows: options.rows,
			allowProposedApi: true,
			scrollback: Math.max(0, options.scrollback ?? 200),
			convertEol: false,
		});
	}

	feed(chunk: string): void {
		this.terminal.write(chunk);
		// 锁定到底时，跟随最新内容
		if (this.viewportPinned) {
			this.viewportTop = this.maxViewportTop();
		}
	}

	resize(cols: number, rows: number): void {
		try {
			this.terminal.resize(cols, rows);
		} catch {
			// xterm 在某些临界尺寸会抛 InvalidArgumentError，忽略以保证流不中断
		}
		if (this.viewportPinned) {
			this.viewportTop = this.maxViewportTop();
		}
	}

	get cols(): number {
		return this.terminal.cols;
	}

	get rows(): number {
		return this.terminal.rows;
	}

	private maxViewportTop(): number {
		const buffer = this.terminal.buffer.active;
		return Math.max(0, buffer.baseY);
	}

	scrollLines(delta: number): void {
		const next = Math.max(
			0,
			Math.min(this.maxViewportTop(), this.viewportTop + delta),
		);
		this.viewportTop = next;
		this.viewportPinned = next >= this.maxViewportTop();
	}

	scrollUp(lines = 5): void {
		this.scrollLines(-lines);
	}

	scrollDown(lines = 5): void {
		this.scrollLines(lines);
	}

	pageUp(): void {
		this.scrollLines(-this.terminal.rows);
	}

	pageDown(): void {
		this.scrollLines(this.terminal.rows);
	}

	scrollToTop(): void {
		this.viewportTop = 0;
		this.viewportPinned = this.maxViewportTop() === 0;
	}

	scrollToBottom(): void {
		this.viewportTop = this.maxViewportTop();
		this.viewportPinned = true;
	}

	isViewportPinned(): boolean {
		return this.viewportPinned;
	}

	/** 解析当前 viewport 起始行号。 */
	private resolveStartLine(opts?: SnapshotOptions): number {
		if (opts?.from === "bottom") return this.maxViewportTop();
		return this.viewportTop;
	}

	/**
	 * 纯文本快照（trimRight，每行去尾空白；裁掉尾部全空行）。
	 *
	 * 兼容旧接口：等价于 snapshotPlain()。
	 */
	snapshot(opts?: SnapshotOptions): string {
		return this.snapshotPlain(opts);
	}

	snapshotPlain(opts?: SnapshotOptions): string {
		const lines = this.viewportLines(opts);
		this.lastPlainLines = [...lines];
		while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
		return lines.join("\n");
	}

	/**
	 * 带 ANSI 转义的彩色快照。仅 Discord ansi codeblock 等少数渠道能原生渲染；
	 * 其他渠道会显示为乱码（用户应在 colorMode=auto 时让 channel 自行降级）。
	 */
	snapshotAnsi(opts?: SnapshotOptions): string {
		const buffer = this.terminal.buffer.active;
		const start = this.resolveStartLine(opts);
		const lineCount = opts?.lineCount ?? this.terminal.rows;
		const rendered: string[] = [];
		const plainCache: string[] = [];
		let attr: CellAttr = RESET_ATTR;
		for (let y = 0; y < lineCount; y++) {
			const line = buffer.getLine(start + y);
			if (!line) {
				rendered.push("");
				plainCache.push("");
				continue;
			}
			const cellPool = (
				this.terminal as unknown as {
					_core?: { buffer?: { _cell?: IBufferCell } };
				}
			)._core?.buffer?._cell;
			let row = "";
			let plain = "";
			let lineHasContent = false;
			for (let x = 0; x < line.length; x++) {
				const cell = line.getCell(x, cellPool ?? undefined);
				if (!cell) continue;
				if (cell.getWidth() === 0) continue; // 宽字符占位的次格
				const next = readAttr(cell);
				const sgr = diffAttrSgr(attr, next);
				if (sgr) row += sgr;
				attr = next;
				const chars = cell.getChars() || " ";
				row += chars;
				plain += chars;
				if (chars.trim().length > 0) lineHasContent = true;
			}
			// 行末把背景关掉，避免下一行继承
			if (
				attr.bgMode !== 0 ||
				attr.fgMode !== 0 ||
				attr.bold ||
				attr.italic ||
				attr.inverse ||
				attr.underline
			) {
				row += "\x1b[0m";
				attr = RESET_ATTR;
			}
			rendered.push(lineHasContent ? row : "");
			plainCache.push(plain.replace(/\s+$/g, ""));
		}
		this.lastPlainLines = plainCache;
		while (rendered.length > 0 && !rendered[rendered.length - 1])
			rendered.pop();
		return rendered.join("\n");
	}

	/** 取当前 viewport 的纯文本（trimRight） */
	private viewportLines(opts?: SnapshotOptions): string[] {
		const buffer = this.terminal.buffer.active;
		const start = this.resolveStartLine(opts);
		const lineCount = opts?.lineCount ?? this.terminal.rows;
		const lines: string[] = [];
		for (let y = 0; y < lineCount; y++) {
			const line = buffer.getLine(start + y);
			lines.push(line ? line.translateToString(true) : "");
		}
		return lines;
	}

	/**
	 * 屏幕状态条。一段紧凑的 inline status 给手机端"上下文一眼"。
	 * 形如 `┌ claude · 12s · pid 1234 · 80×24 · 行 145/200 [SCROLL] ┐`
	 */
	statusLine(meta: StatusLineMeta): string {
		const ageSec = Math.max(
			0,
			Math.round((Date.now() - meta.startedAt) / 1000),
		);
		const ageStr =
			ageSec < 60
				? `${ageSec}s`
				: ageSec < 3600
					? `${Math.floor(ageSec / 60)}m${ageSec % 60}s`
					: `${Math.floor(ageSec / 3600)}h${Math.floor((ageSec % 3600) / 60)}m`;
		const buffer = this.terminal.buffer.active;
		const totalLine = buffer.baseY + this.terminal.rows;
		const currentLine = Math.min(
			totalLine,
			this.viewportTop + this.terminal.rows,
		);
		const pinned = this.viewportPinned ? "" : " [SCROLL]";
		const commandShort =
			meta.command.length > 24
				? `${meta.command.slice(0, 21)}...`
				: meta.command;
		return `[${commandShort} · ${ageStr} · pid ${meta.pid} · ${meta.cols}×${meta.rows} · 行 ${currentLine}/${totalLine}${pinned}]`;
	}

	/**
	 * 与上一次 snapshot 比较，返回当前 viewport 中新增/变更的行号（0-based）。
	 * 仅用作 UI 高亮提示，不保证语义严格。
	 */
	diffWithPrev(): Set<number> {
		const buffer = this.terminal.buffer.active;
		const start = this.resolveStartLine();
		const newLines = new Set<number>();
		for (let y = 0; y < this.terminal.rows; y++) {
			const line = buffer.getLine(start + y);
			const text = line ? line.translateToString(true) : "";
			if (text !== (this.lastPlainLines[y] ?? "")) {
				if (text.trim().length > 0) newLines.add(y);
			}
		}
		return newLines;
	}

	/**
	 * 扫描当前 viewport 的最后若干行，推断 TUI 等待的输入类型。
	 * 返回的上下文由 PtyBridgeService 用来动态调整快捷按钮组。
	 */
	detectContext(): ScreenContext {
		const lines = this.viewportLines();
		while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
		return detectScreenContext(lines);
	}

	dispose(): void {
		this.terminal.dispose();
	}
}
