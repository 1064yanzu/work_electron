/**
 * Slack 交互组件 —— Block Kit `actions` block
 *
 * 参考：https://api.slack.com/reference/block-kit/block-elements#button
 */

import type {
	ChannelInteractiveButton,
	ChannelInteractiveComponents,
} from "../../sdk";

export type SlackBlocksWithActions = Array<Record<string, unknown>>;

/**
 * 根据 SDK 交互组件构造 Slack Block Kit blocks。
 * 每一行映射为一个 actions block。
 */
export function componentsToSlackBlocks(
	components: ChannelInteractiveComponents,
): SlackBlocksWithActions {
	return components.rows.map((row) => ({
		type: "actions",
		elements: row.components
			.map((c) => {
				if (c.kind === "button") {
					const btn = c as ChannelInteractiveButton;
					return {
						type: "button",
						text: { type: "plain_text", text: btn.label },
						action_id: btn.actionId,
						value: btn.value ?? btn.actionId,
						style:
							btn.style === "primary"
								? "primary"
								: btn.style === "danger"
									? "danger"
									: undefined,
					};
				}
				if (c.kind === "link") {
					return {
						type: "button",
						text: { type: "plain_text", text: c.label },
						url: c.url,
						action_id: `link_${c.url.slice(0, 40)}`,
					};
				}
				return null;
			})
			.filter(Boolean),
	}));
}

/**
 * 解析 Slack block_actions payload 的单个 action。
 */
export function parseSlackBlockAction(action: {
	action_id?: string;
	value?: string;
}): { actionId: string; value?: string } | null {
	if (!action.action_id) return null;
	return { actionId: action.action_id, value: action.value };
}
