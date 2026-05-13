/**
 * 远程终端命令历史 ring buffer。
 *
 * 每个 IM 远控 pty 会话独占一份历史，用来支持 `/cli history` 列出最近输入
 * 以及 `/cli !N` / `/cli recall N` 一键重发。仅记录"主动输入"，自动注入的
 * 控制键（ctrl-c / 方向键）不入库。
 */

export type CommandHistoryEntry = {
	id: number;
	text: string;
	addedAt: number;
};

export class CommandHistory {
	private readonly buffer: CommandHistoryEntry[] = [];
	private cursor = 0;
	private readonly limit: number;

	constructor(limit = 20) {
		this.limit = Math.max(4, Math.min(200, limit));
	}

	push(text: string): void {
		const trimmed = text.replace(/\s+$/g, "");
		if (!trimmed) return;
		const last = this.buffer[this.buffer.length - 1];
		// 完全重复的相邻输入不重复记录（减噪）
		if (last && last.text === trimmed) {
			last.addedAt = Date.now();
			return;
		}
		this.cursor += 1;
		this.buffer.push({ id: this.cursor, text: trimmed, addedAt: Date.now() });
		while (this.buffer.length > this.limit) this.buffer.shift();
	}

	/** 返回最近 N 条历史，序号从大到小（最新在前），方便 IM 列表展示。 */
	list(): CommandHistoryEntry[] {
		return [...this.buffer].reverse();
	}

	get(id: number): CommandHistoryEntry | null {
		return this.buffer.find((e) => e.id === id) ?? null;
	}

	clear(): void {
		this.buffer.length = 0;
		this.cursor = 0;
	}
}

/**
 * 把 history 渲染为多行字符串，倒序展示（最新在前），最多 maxLines 条。
 * 每行格式：`#NN  <text>`。
 */
export function formatHistory(history: CommandHistory, maxLines = 20): string {
	const list = history.list().slice(0, maxLines);
	if (list.length === 0) return "（暂无命令历史）";
	const rows = list.map((entry) => {
		const idStr = String(entry.id).padStart(2, " ");
		const preview =
			entry.text.length > 60 ? `${entry.text.slice(0, 57)}...` : entry.text;
		return `  #${idStr}  ${preview}`;
	});
	return ["最近命令（数字越大越新，用 /cli !N 重发）：", ...rows].join("\n");
}
