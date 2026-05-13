/**
 * 飞书交互式卡片构建工具
 * 实现丰富的卡片交互,提升用户体验
 */

const MAX_PREVIEW_LEN = 500;

function clampText(input: string, max: number): string {
	if (input.length <= max) return input;
	return `${input.slice(0, max)}...`;
}

function stringifyToolInput(toolInput?: Record<string, unknown>): string {
	if (!toolInput) return "";
	try {
		return JSON.stringify(toolInput, null, 2);
	} catch {
		return String(toolInput);
	}
}

/**
 * 构建交互审批请求卡片
 * 包含approve和reject按钮,用户可以直接点击按钮回复
 */
export function buildInteractionApprovalCard(params: {
	requestId: string;
	toolName: string;
	toolInput?: Record<string, unknown>;
	message?: string;
}): string {
	const inputPreview = clampText(
		stringifyToolInput(params.toolInput),
		MAX_PREVIEW_LEN,
	);

	const card = {
		config: {
			wide_screen_mode: true,
		},
		header: {
			title: {
				tag: "plain_text",
				content: "交互审批请求",
			},
			template: "orange",
		},
		elements: [
			{
				tag: "div",
				text: {
					tag: "plain_text",
					content: `工具名称: ${params.toolName}\n请求ID: ${params.requestId}`,
				},
			},
			...(inputPreview
				? [
						{
							tag: "div",
							text: {
								tag: "plain_text",
								content: `参数预览:\n${inputPreview}`,
							},
						},
					]
				: []),
			...(params.message
				? [
						{
							tag: "div",
							text: {
								tag: "plain_text",
								content: `说明: ${params.message}`,
							},
						},
					]
				: []),
			{
				tag: "hr",
			},
			{
				tag: "action",
				actions: [
					{
						tag: "button",
						text: {
							tag: "plain_text",
							content: "批准",
						},
						type: "primary",
						value: {
							action: "approve",
							requestId: params.requestId,
						},
					},
					{
						tag: "button",
						text: {
							tag: "plain_text",
							content: "拒绝",
						},
						type: "danger",
						value: {
							action: "reject",
							requestId: params.requestId,
						},
					},
				],
			},
			{
				tag: "note",
				elements: [
					{
						tag: "plain_text",
						content:
							"或使用命令: /approve requestId 或 /reject requestId <reason>",
					},
				],
			},
		],
	};

	return JSON.stringify(card);
}

/**
 * 构建信息提示卡片
 */
export function buildInfoCard(params: {
	title: string;
	content: string;
	type?: "info" | "success" | "warning" | "error";
}): string {
	const templateColors: Record<string, string> = {
		info: "blue",
		success: "green",
		warning: "orange",
		error: "red",
	};

	const card = {
		config: {
			wide_screen_mode: true,
		},
		header: {
			title: {
				tag: "plain_text",
				content: params.title,
			},
			template: templateColors[params.type || "info"] || "blue",
		},
		elements: [
			{
				tag: "div",
				text: {
					tag: "lark_md",
					content: params.content,
				},
			},
		],
	};

	return JSON.stringify(card);
}

/**
 * 解析卡片按钮回调数据
 */
export function parseCardAction(value: unknown): {
	action: "approve" | "reject";
	requestId: string;
} | null {
	const normalize = (raw: unknown) => {
		if (!raw || typeof raw !== "object") return null;
		const parsed = raw as Record<string, unknown>;
		const action = parsed.action;
		const requestId = parsed.requestId;
		if (
			(action === "approve" || action === "reject") &&
			typeof requestId === "string" &&
			requestId.trim()
		) {
			return {
				action,
				requestId: requestId.trim(),
			} as {
				action: "approve" | "reject";
				requestId: string;
			};
		}
		return null;
	};

	if (typeof value === "object" && value) {
		return normalize(value);
	}

	if (typeof value !== "string") return null;

	try {
		return normalize(JSON.parse(value));
	} catch {
		return null;
	}
}

/**
 * 解析远程终端 (pty 桥) 卡片按钮回调。
 *
 * 触发卡片来源：feishuStreamingCard 给 ChannelStreamingStartOptions.terminalShortcuts
 * 渲染的按钮区。可识别三种 action：
 *   - pty_key   → 发送特殊键（key 字段需匹配 ptyCommandParser 的别名表）
 *   - pty_stop  → 停止当前会话
 *   - pty_text  → 注入任意字符串作为 stdin
 */
export type PtyCardAction =
	| { kind: "key"; key: string }
	| { kind: "stop" }
	| { kind: "text"; text: string };

export function parsePtyCardAction(value: unknown): PtyCardAction | null {
	const normalize = (raw: unknown): PtyCardAction | null => {
		if (!raw || typeof raw !== "object") return null;
		const parsed = raw as Record<string, unknown>;
		const action = parsed.action;
		if (action === "pty_key") {
			const key = typeof parsed.key === "string" ? parsed.key.trim() : "";
			if (!key) return null;
			return { kind: "key", key };
		}
		if (action === "pty_stop") {
			return { kind: "stop" };
		}
		if (action === "pty_text") {
			const text = typeof parsed.text === "string" ? parsed.text : "";
			return { kind: "text", text };
		}
		return null;
	};

	if (typeof value === "object" && value) {
		return normalize(value);
	}
	if (typeof value !== "string") return null;
	try {
		return normalize(JSON.parse(value));
	} catch {
		return null;
	}
}
