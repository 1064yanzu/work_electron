/**
 * 危险命令模式检测。
 *
 * 注入 stdin（普通文本 / `/i <text>`）或 `/cli start <自由命令>` 时先过一遍：
 * 命中任意 pattern 即认定为危险，由 PtyBridgeService 弹出二次确认按钮。
 * 命中策略保守：要求 pattern 是 input 的子串（大小写不敏感），
 * 不做正则以免误伤合法路径。
 *
 * 默认列表见 defaults.ts 的 RemoteTerminalConfig.dangerousPatterns。用户可以
 * 在设置面板调整。
 */

export type DangerousMatch = {
	pattern: string;
	preview: string;
};

export function detectDangerousInput(
	input: string,
	patterns: string[],
): DangerousMatch | null {
	if (!input || patterns.length === 0) return null;
	const haystack = input.toLowerCase();
	for (const pattern of patterns) {
		const needle = String(pattern || "")
			.trim()
			.toLowerCase();
		if (!needle) continue;
		if (haystack.includes(needle)) {
			const idx = haystack.indexOf(needle);
			const start = Math.max(0, idx - 8);
			const end = Math.min(input.length, idx + needle.length + 16);
			return {
				pattern,
				preview: input.slice(start, end),
			};
		}
	}
	return null;
}
