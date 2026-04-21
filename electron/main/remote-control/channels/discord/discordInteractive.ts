/**
 * Discord 交互组件 —— ActionRow + Button（Components V1）
 *
 * 参考：https://discord.com/developers/docs/interactions/message-components
 */

import type {
	ChannelInteractiveButton,
	ChannelInteractiveComponents,
} from "../../sdk";

/**
 * discord.js 原生的 ButtonStyle 对应：
 * - Primary = 1 (蓝)
 * - Secondary = 2 (灰)
 * - Success = 3 (绿)
 * - Danger = 4 (红)
 * - Link = 5 (URL)
 */
const DISCORD_BUTTON_STYLE: Record<string, number> = {
	primary: 1,
	secondary: 2,
	success: 3,
	danger: 4,
};

export function componentsToDiscordRows(
	components: ChannelInteractiveComponents,
): Array<Record<string, unknown>> {
	return components.rows.map((row) => ({
		type: 1, // ActionRow
		components: row.components
			.map((c) => {
				if (c.kind === "button") {
					const btn = c as ChannelInteractiveButton;
					const style = DISCORD_BUTTON_STYLE[btn.style ?? "secondary"] ?? 2;
					return {
						type: 2,
						style,
						label: btn.label,
						custom_id: btn.actionId.slice(0, 100), // Discord 限 100 字符
						disabled: btn.disabled ?? false,
					};
				}
				if (c.kind === "link") {
					return {
						type: 2,
						style: 5,
						label: c.label,
						url: c.url,
					};
				}
				return null;
			})
			.filter(Boolean),
	}));
}

export function parseDiscordInteractionCustomId(customId: string): {
	actionId: string;
} {
	return { actionId: customId };
}
