/**
 * PtyScreenAggregator —— 用 @xterm/headless 维护一个虚拟终端屏幕，
 * 把 pty stdout 的 ANSI 序列渲染成纯文本快照供 IM 卡片显示。
 *
 * codex / claude code / opencode 等 TUI 应用大量使用 ANSI 重绘
 * （`\x1b[2J` 清屏、`\x1b[1;1H` 光标定位、`\x1b[38;5;208m` 颜色等）。
 * 直接把 raw bytes 转发到 IM 是不可读的乱码。本类充当一个不显示的
 * 终端，让 TUI 在其上"画"一遍，然后取"当前屏幕一帧"的纯文本输出。
 */
import { createRequire } from "node:module";
import type { Terminal as TerminalCtor } from "@xterm/headless";

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
};

export class PtyScreenAggregator {
	private readonly terminal: Terminal;

	constructor(options: PtyScreenAggregatorOptions) {
		this.terminal = new Terminal({
			cols: options.cols,
			rows: options.rows,
			allowProposedApi: true,
			scrollback: 0,
			convertEol: false,
		});
	}

	feed(chunk: string): void {
		this.terminal.write(chunk);
	}

	resize(cols: number, rows: number): void {
		try {
			this.terminal.resize(cols, rows);
		} catch {
			// xterm 在某些临界尺寸会抛 InvalidArgumentError，忽略以保证流不中断
		}
	}

	get cols(): number {
		return this.terminal.cols;
	}

	get rows(): number {
		return this.terminal.rows;
	}

	/**
	 * 取当前屏幕的纯文本快照（trimRight，每行去尾空白；裁掉尾部全空行）。
	 *
	 * @returns 多行字符串。如屏幕全空返回空串。
	 */
	snapshot(): string {
		const buffer = this.terminal.buffer.active;
		const top = buffer.baseY;
		const lines: string[] = [];
		for (let y = 0; y < this.terminal.rows; y++) {
			const line = buffer.getLine(top + y);
			lines.push(line ? line.translateToString(true) : "");
		}
		while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
		return lines.join("\n");
	}

	dispose(): void {
		this.terminal.dispose();
	}
}
