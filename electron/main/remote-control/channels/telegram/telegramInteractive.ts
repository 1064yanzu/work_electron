/**
 * Telegram 交互组件 —— inline keyboard + callback_query
 *
 * 用法：
 * - 构造 reply_markup 时把 SDK 的 ChannelInteractiveComponents 映射为 inline_keyboard
 * - 回调进来是 callback_query，解析 data 后走 command router 的审批流程
 */

import type { Context } from "grammy";
import type {
	ChannelInteractiveButton,
	ChannelInteractiveComponents,
} from "../../sdk";

export type TelegramInlineKeyboard = {
	inline_keyboard: Array<
		Array<{
			text: string;
			callback_data?: string;
			url?: string;
		}>
	>;
};

/**
 * 把 SDK 的交互组件转为 Telegram inline_keyboard。
 */
export function componentsToTelegramKeyboard(
	components: ChannelInteractiveComponents,
): TelegramInlineKeyboard {
	return {
		inline_keyboard: components.rows.map((row) =>
			row.components
				.map((c) => {
					if (c.kind === "button") {
						const btn = c as ChannelInteractiveButton;
						// Telegram callback_data 限 1-64 字节
						const data = (btn.value ?? btn.actionId).slice(0, 64);
						return { text: btn.label, callback_data: data };
					}
					if (c.kind === "link") {
						return { text: c.label, url: c.url };
					}
					// select 不支持 —— 返回占位按钮
					return { text: "(不支持的组件)", callback_data: "noop" };
				})
				.filter(Boolean),
		),
	};
}

/**
 * 解析 Telegram callback_query，转为统一的 interactive 载荷。
 * 返回 { actionId, value } 供 router 解析。
 */
export function parseTelegramCallbackData(
	ctx: Context,
): { actionId: string; value?: string } | null {
	const data = ctx.callbackQuery?.data;
	if (typeof data !== "string" || !data) return null;
	return {
		actionId: data,
		value: data,
	};
}
