/**
 * 交互组件（按钮 / 菜单 / modal）统一抽象
 *
 * 各渠道把同一份 `ChannelInteractiveComponents` 映射到自己的协议：
 * - feishu: 卡片 action elements
 * - telegram: inline_keyboard
 * - slack: Block Kit `actions` block
 * - discord: Components V2 MessageActionRow + Button
 * - qqbot: keyboard markup
 */

export type ChannelInteractiveButtonStyle =
	| "primary"
	| "secondary"
	| "danger"
	| "success";

/**
 * 按钮组件。
 */
export type ChannelInteractiveButton = {
	kind: "button";
	/** 唯一回调 id；建议不超过 64 字节（discord custom_id 限制） */
	actionId: string;
	/** 按钮文本 */
	label: string;
	style?: ChannelInteractiveButtonStyle;
	/** 业务值，作为 callback_data 携带回来（受 64 字节限制） */
	value?: string;
	/** 是否禁用 */
	disabled?: boolean;
};

/**
 * 下拉菜单组件（可选支持，部分渠道暂不实现）。
 */
export type ChannelInteractiveSelect = {
	kind: "select";
	actionId: string;
	placeholder?: string;
	options: Array<{
		label: string;
		value: string;
		description?: string;
	}>;
};

/**
 * URL 链接按钮（不触发 callback，直接打开 URL）。
 */
export type ChannelInteractiveLink = {
	kind: "link";
	label: string;
	url: string;
};

export type ChannelInteractiveComponent =
	| ChannelInteractiveButton
	| ChannelInteractiveSelect
	| ChannelInteractiveLink;

/**
 * 一组交互组件（通常渲染为一行或一列）。
 */
export type ChannelInteractiveRow = {
	components: ChannelInteractiveComponent[];
};

/**
 * 完整的交互组件集合（多行）。
 */
export type ChannelInteractiveComponents = {
	rows: ChannelInteractiveRow[];
};

/**
 * 常见场景的 helper：构造审批按钮（approve / reject）。
 */
export function buildApprovalButtons(params: {
	requestId: string;
	approveLabel?: string;
	rejectLabel?: string;
}): ChannelInteractiveComponents {
	const { requestId } = params;
	return {
		rows: [
			{
				components: [
					{
						kind: "button",
						actionId: `approval:approve:${requestId}`,
						label: params.approveLabel ?? "✓ 批准",
						style: "primary",
						value: JSON.stringify({ action: "approve", requestId }),
					},
					{
						kind: "button",
						actionId: `approval:reject:${requestId}`,
						label: params.rejectLabel ?? "✗ 拒绝",
						style: "danger",
						value: JSON.stringify({ action: "reject", requestId }),
					},
				],
			},
		],
	};
}

/**
 * 解析 interactive callback 里的业务值，返回规范化的审批动作。
 * 如果不是审批场景，返回 null。
 */
export function parseApprovalCallback(
	actionId: string,
	value?: unknown,
): { action: "approve" | "reject"; requestId: string } | null {
	// 优先从 value 解析（value 通常是 JSON）
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (
				parsed &&
				typeof parsed === "object" &&
				(parsed.action === "approve" || parsed.action === "reject") &&
				typeof parsed.requestId === "string"
			) {
				return { action: parsed.action, requestId: parsed.requestId };
			}
		} catch {
			// value 不是 JSON，继续从 actionId 解析
		}
	}

	// fallback: 从 actionId 解析（格式：approval:approve:<requestId>）
	const match = actionId.match(/^approval:(approve|reject):(.+)$/);
	if (match) {
		return { action: match[1] as "approve" | "reject", requestId: match[2] };
	}

	return null;
}
