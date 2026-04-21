/**
 * QQ Bot 交互组件 —— Markdown 按钮
 *
 * QQ 官方 API 通过 Markdown + keyboard 协议下发按钮（msg_type=2 + markdown + keyboard）。
 * 本项目的 interactive 目前只走审批按钮场景；由于 QQ 的按钮 template_id 需要平台审核，
 * 这里选择「纯文本 + 提示语」的方式作为降级回退：
 *   - 当 interactive.enabled=true：在审批消息前加入「点击按钮确认」提示 + 命令文本
 *   - 当 interactive.enabled=false：沿用原先的 `/approve <requestId>` 文本命令
 *
 * 后续若接入 QQ 官方「按钮模板」审核通过后，可在此扩展 componentsToQqbotKeyboard。
 */

import type { ChannelInteractiveComponents } from "../../sdk";

/**
 * 渲染交互组件为 QQ Bot 兼容的提示文本。
 * 当前实现：将每个按钮显示为 `[label] 发送: /approve <id>` 指引。
 */
export function componentsToQqbotText(
	components: ChannelInteractiveComponents,
): string {
	const lines: string[] = [];
	for (const row of components.rows) {
		for (const comp of row.components) {
			if (comp.kind === "button") {
				lines.push(`・${comp.label}：复制命令发送 → \`${comp.actionId}\``);
			} else if (comp.kind === "link") {
				lines.push(`・${comp.label}：${comp.url}`);
			}
		}
	}
	return lines.join("\n");
}
