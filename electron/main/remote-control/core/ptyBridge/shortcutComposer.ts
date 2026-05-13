/**
 * 根据屏幕上下文（ScreenContext）+ 待确认状态，动态生成 IM 远控终端的快捷按钮组。
 *
 * 设计准则：
 *   1. 默认按钮组 12 个，飞书 CardKit 卡片 4 列 3 行最容易看。
 *   2. 命中 yes_no / numeric_menu / press_any_key / search / quit_prompt 时
 *      把对应组合放在前面、停止/系统按钮塞最后，保持"立即可用"的视觉一致性。
 *   3. 有待确认危险命令时，前两个按钮替换为「确认 / 取消」，红色高亮。
 *   4. 折叠剩余页时多塞一个「下一页」按钮。
 *
 * 调用方（PtyBridgeService）拿到这里返回的 shortcuts 后通过
 * ChannelStreamingSession.updateShortcuts 推送给渠道；渠道可选实现。
 */

import type { TerminalShortcutAction } from "../../sdk/channel-streaming";
import type { ScreenContext } from "./screenContextDetect";

/**
 * 默认终端快捷按钮组。
 *
 * 设计目标：覆盖 Claude Code / codex / opencode 这类 TUI 在 IM 卡片里最常
 * 用到的交互——菜单浏览、确认/取消、补全、中断、数字菜单、是否对话。
 * 12 个按钮按 4 列 3 行排版。
 */
export const DEFAULT_TERMINAL_SHORTCUTS: TerminalShortcutAction[] = [
	{ kind: "key", label: "Enter", key: "enter", style: "primary" },
	{ kind: "key", label: "Esc", key: "esc", style: "secondary" },
	{ kind: "key", label: "↑", key: "up", style: "secondary" },
	{ kind: "key", label: "↓", key: "down", style: "secondary" },
	{ kind: "key", label: "Tab", key: "tab", style: "secondary" },
	{ kind: "key", label: "Ctrl+C", key: "ctrl-c", style: "danger" },
	{ kind: "text", label: "y", text: "y", style: "secondary" },
	{ kind: "text", label: "n", text: "n", style: "secondary" },
	{ kind: "text", label: "1", text: "1", style: "secondary" },
	{ kind: "text", label: "2", text: "2", style: "secondary" },
	{ kind: "text", label: "3", text: "3", style: "secondary" },
	{ kind: "stop", label: "停止会话", style: "danger" },
];

export type ShortcutComposeContext = {
	context: ScreenContext;
	hasMorePages: boolean;
	pendingConfirm: boolean;
	scrolling: boolean;
};

/**
 * 上限 12 个；按钮顺序遵循 4 列 3 行的视觉布局。
 */
const MAX_BUTTONS = 12;

export function buildContextualShortcuts(
	cfg: ShortcutComposeContext,
): TerminalShortcutAction[] {
	if (cfg.pendingConfirm) {
		return [
			{ kind: "confirm", label: "确认执行", style: "danger" },
			{ kind: "cancel", label: "取消", style: "secondary" },
			{ kind: "key", label: "Esc", key: "esc", style: "secondary" },
			{ kind: "stop", label: "终止会话", style: "danger" },
		];
	}

	const buttons: TerminalShortcutAction[] = [];
	const push = (b: TerminalShortcutAction): void => {
		if (buttons.length >= MAX_BUTTONS) return;
		buttons.push(b);
	};

	const ctx = cfg.context;
	switch (ctx.kind) {
		case "yes_no": {
			const yesStyle: TerminalShortcutAction["style"] =
				ctx.defaultAccept === "y" ? "primary" : "secondary";
			const noStyle: TerminalShortcutAction["style"] =
				ctx.defaultAccept === "n" ? "primary" : "secondary";
			push({ kind: "text", label: "Yes", text: "y", style: yesStyle });
			push({ kind: "text", label: "No", text: "n", style: noStyle });
			push({ kind: "key", label: "Enter", key: "enter", style: "primary" });
			push({ kind: "key", label: "Esc", key: "esc", style: "secondary" });
			break;
		}
		case "numeric_menu": {
			for (const opt of ctx.options.slice(0, 8)) {
				const labelTrim =
					opt.label.length > 12
						? `${opt.value}·${opt.label.slice(0, 10)}…`
						: `${opt.value}·${opt.label}`;
				push({
					kind: "text",
					label: labelTrim,
					text: opt.value,
					style: "secondary",
				});
			}
			push({ kind: "key", label: "Enter", key: "enter", style: "primary" });
			push({ kind: "key", label: "Esc", key: "esc", style: "secondary" });
			break;
		}
		case "press_any_key": {
			push({ kind: "key", label: "继续", key: "enter", style: "primary" });
			push({ kind: "key", label: "空格", key: "space", style: "secondary" });
			push({ kind: "key", label: "Esc", key: "esc", style: "secondary" });
			break;
		}
		case "quit_prompt": {
			push({ kind: "text", label: "q 退出", text: "q", style: "primary" });
			push({ kind: "key", label: "Esc", key: "esc", style: "secondary" });
			push({ kind: "key", label: "↑", key: "up", style: "secondary" });
			push({ kind: "key", label: "↓", key: "down", style: "secondary" });
			push({ kind: "key", label: "PgUp", key: "pageup", style: "secondary" });
			push({ kind: "key", label: "PgDn", key: "pagedown", style: "secondary" });
			break;
		}
		case "search": {
			push({ kind: "key", label: "Enter", key: "enter", style: "primary" });
			push({ kind: "key", label: "Esc", key: "esc", style: "secondary" });
			push({
				kind: "key",
				label: "Backspace",
				key: "backspace",
				style: "secondary",
			});
			break;
		}
		default: {
			// 默认组：照搬常用按钮
			for (const b of DEFAULT_TERMINAL_SHORTCUTS) {
				push(b);
			}
		}
	}

	// 折叠剩余页 → 「下一页」按钮
	if (cfg.hasMorePages) {
		push({ kind: "more", label: "下一页", style: "primary" });
	}
	// 滚动状态 → 跳到底
	if (cfg.scrolling) {
		push({ kind: "scroll", label: "回底", dir: "bottom", style: "secondary" });
	}
	// 最后补一个 stop（已经有就不重复）
	if (!buttons.some((b) => b.kind === "stop")) {
		push({ kind: "stop", label: "停止会话", style: "danger" });
	}

	return buttons.slice(0, MAX_BUTTONS);
}
