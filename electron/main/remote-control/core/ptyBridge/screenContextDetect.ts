/**
 * 屏幕上下文模式识别 —— 扫描虚拟终端的当前一帧（最后 N 行），尝试推断 TUI
 * 当前在等待什么类型的输入，让 IM 远控终端能动态替换按钮组。
 *
 * 当前命中的几种模式：
 *  - yes_no   —— 命令行典型「[Y/n]」「(yes/no)」「确认？(y/N)」
 *  - numeric_menu —— 「1. xxx」「[1] xxx」 这类编号菜单（≥2 个选项）
 *  - press_any_key —— 「Press any key to continue」/「按任意键继续」
 *  - search   —— 「/<pattern>」 fzf 类搜索模式（光标行以 `/` 开头）
 *  - quit     —— `q` 退出提示（less / man 这种）
 *  - default  —— 没识别到任何模式，沿用默认按钮组
 *
 * 实现刻意保守：宁可漏判默认按钮兜底，不可瞎换让用户操作不可预期。
 */

export type ScreenContext =
	| { kind: "default" }
	| { kind: "yes_no"; defaultAccept: "y" | "n" | null }
	| {
			kind: "numeric_menu";
			options: { value: string; label: string }[];
	  }
	| { kind: "press_any_key" }
	| { kind: "search" }
	| { kind: "quit_prompt" };

const YES_NO_REGEX =
	/(?:\[?\s*(y|yes)\s*[\/|]\s*(n|no)\s*\]?|\((y|yes)[\s,/]*(n|no)\)|\[?\s*(n|no)\s*[\/|]\s*(y|yes)\s*\]?|确认[？?].*?[（(]?\s*(y|n)\s*[)）]?)/i;
const YES_DEFAULT_REGEX = /\[\s*Y\s*\/\s*n\s*\]|\(\s*Y\s*\/\s*n\s*\)/;
const NO_DEFAULT_REGEX = /\[\s*y\s*\/\s*N\s*\]|\(\s*y\s*\/\s*N\s*\)/;
const PRESS_ANY_KEY_REGEX =
	/press\s+(?:any\s+)?(?:key|enter|return)|按(?:任意键|回车|enter)继续/i;
const QUIT_PROMPT_REGEX =
	/\bpress\s+q\s+to\s+(?:quit|exit)|\(q\)uit|按\s*q\s*退出/i;

// 数字菜单：行首匹配 [1] / 1. / 1) / (1) ，编号紧跟空格 + 标签
const NUMERIC_MENU_LINE_REGEX =
	/^\s*(?:\[?(\d{1,2})[\].)]|\((\d{1,2})\))\s+(.+)$/;

/** 取最近的非空行；用于 search/quit 模式判定 */
function findLastNonEmptyLine(lines: string[]): string | null {
	for (let i = lines.length - 1; i >= 0; i--) {
		const l = lines[i].trimEnd();
		if (l.length > 0) return l;
	}
	return null;
}

/**
 * 把虚拟屏的纯文本行（最后 maxScanLines 行）扫一遍，推断上下文模式。
 */
export function detectScreenContext(
	plainLines: string[],
	maxScanLines = 12,
): ScreenContext {
	if (!plainLines || plainLines.length === 0) return { kind: "default" };

	const tail = plainLines.slice(-maxScanLines);

	// 1) Press any key
	for (const line of tail) {
		if (PRESS_ANY_KEY_REGEX.test(line)) return { kind: "press_any_key" };
	}

	// 2) Quit prompt（less/man 类）
	for (const line of tail) {
		if (QUIT_PROMPT_REGEX.test(line)) return { kind: "quit_prompt" };
	}

	// 3) 搜索模式：最后一行以 / 开头（fzf / less search）
	const lastLine = findLastNonEmptyLine(tail);
	if (lastLine && (lastLine.startsWith("/") || lastLine.startsWith("?"))) {
		// 排除注释/文件路径误识别：只在长度较短时判定
		if (lastLine.length <= 40) return { kind: "search" };
	}

	// 4) Yes/No
	for (let i = tail.length - 1; i >= 0; i--) {
		const line = tail[i];
		const m = YES_NO_REGEX.exec(line);
		if (m) {
			let defaultAccept: "y" | "n" | null = null;
			if (YES_DEFAULT_REGEX.test(line)) defaultAccept = "y";
			else if (NO_DEFAULT_REGEX.test(line)) defaultAccept = "n";
			return { kind: "yes_no", defaultAccept };
		}
	}

	// 5) 数字菜单：至少 2 个数字编号行
	const menuOptions: { value: string; label: string }[] = [];
	for (const line of tail) {
		const m = NUMERIC_MENU_LINE_REGEX.exec(line);
		if (!m) continue;
		const value = (m[1] ?? m[2] ?? "").trim();
		const label = (m[3] ?? "").trim();
		if (!value || !label) continue;
		// 去重 + 排除明显误判（label 全数字或长度超 40）
		if (menuOptions.find((opt) => opt.value === value)) continue;
		if (/^\d+$/.test(label)) continue;
		if (label.length > 40) continue;
		menuOptions.push({ value, label: label.slice(0, 30) });
	}
	if (menuOptions.length >= 2) {
		// 最多保留 8 个；按数字升序
		const sorted = [...menuOptions].sort(
			(a, b) => Number(a.value) - Number(b.value),
		);
		return { kind: "numeric_menu", options: sorted.slice(0, 8) };
	}

	return { kind: "default" };
}
