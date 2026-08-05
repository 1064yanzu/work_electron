/**
 * 内嵌 Web AI 站点清单。
 *
 * selector 一律做成**配置数据**而非硬编码逻辑：这些站点的 DOM 随时会变，
 * 用户可以在设置面板里自行修正选择器，不必等应用更新。
 * 每个选择器都是候��数组，按序尝试，全部失败则降级到「写剪贴板 + 提示手动粘贴」。
 *
 * 各站点用独立 partition（persist:aihub-<id>）隔离登录态，见 aiHubViewService。
 */
import type { WebSiteConfig } from "./types";

/** 内置站点清单。builtin 站点不可删除，只能禁用。 */
export const BUILTIN_WEB_SITES: WebSiteConfig[] = [
	{
		id: "chatgpt",
		harness: "web-chatgpt",
		label: "ChatGPT",
		url: "https://chatgpt.com/",
		inputSelectors: [
			"#prompt-textarea",
			"div[contenteditable='true'][data-virtualkeyboard='true']",
			"textarea[data-testid='prompt-textarea']",
			"div.ProseMirror[contenteditable='true']",
		],
		submitSelectors: [
			"button[data-testid='send-button']",
			"button[aria-label*='Send']",
		],
		messageSelectors: ["div[data-message-author-role]"],
		builtin: true,
		enabled: true,
	},
	{
		id: "gemini",
		harness: "web-gemini",
		label: "Gemini",
		url: "https://gemini.google.com/app",
		inputSelectors: [
			"div.ql-editor[contenteditable='true']",
			"rich-textarea div[contenteditable='true']",
			"textarea[aria-label*='prompt']",
		],
		submitSelectors: ["button.send-button", "button[aria-label*='Send']"],
		messageSelectors: ["div.conversation-container", "message-content"],
		builtin: true,
		enabled: true,
	},
	{
		id: "kimi",
		harness: "web-kimi",
		label: "Kimi",
		url: "https://www.kimi.com/",
		inputSelectors: [
			"div[data-testid='msh-chatinput-editor']",
			"div.chat-input-editor[contenteditable='true']",
			"div[contenteditable='true']",
			"textarea",
		],
		submitSelectors: [
			"div[data-testid='msh-chatinput-send-button']",
			"button[data-testid='send-button']",
		],
		messageSelectors: [
			"div[class*='segment-content']",
			"div[class*='chat-item']",
		],
		builtin: true,
		enabled: true,
	},
	{
		id: "doubao",
		harness: "web-doubao",
		label: "豆包",
		url: "https://www.doubao.com/chat/",
		inputSelectors: [
			"textarea[data-testid='chat_input_input']",
			"div[contenteditable='true']",
			"textarea",
		],
		submitSelectors: [
			"button[data-testid='chat_input_send_button']",
			"#flow-end-msg-send",
		],
		messageSelectors: [
			"div[data-testid='message_text_content']",
			"div[class*='message-block']",
		],
		builtin: true,
		enabled: true,
	},
	{
		id: "glm",
		harness: "web-glm",
		label: "智谱 GLM",
		url: "https://chat.z.ai/",
		inputSelectors: [
			"textarea#chat-input",
			"div[contenteditable='true']",
			"textarea",
		],
		submitSelectors: ["button#send-message-button", "button[type='submit']"],
		messageSelectors: ["div[class*='chat-message']", "div[id^='message-']"],
		builtin: true,
		enabled: true,
	},
	{
		id: "deepseek",
		harness: "web-deepseek",
		label: "DeepSeek",
		url: "https://chat.deepseek.com/",
		inputSelectors: [
			"textarea#chat-input",
			"div[contenteditable='true']",
			"textarea",
		],
		submitSelectors: [
			"div[role='button'][aria-disabled='false']",
			"button[type='submit']",
		],
		messageSelectors: ["div[class*='_4f9bf79']", "div[class*='message']"],
		builtin: true,
		enabled: true,
	},
];

/** app_config 中存放用户自定义站点清单的 key。 */
export const WEB_SITES_CONFIG_KEY = "harness_hub_web_sites";

/**
 * 合并内置清单与用户覆盖。
 *
 * 用户可以：改内置站点的 url/selector、禁用内置站点、新增自定义站点。
 * 内置站点即使被用户改过也保持 builtin=true（不可删除，只能禁用/重置）。
 */
export function mergeWebSites(overridesJson: string | null): WebSiteConfig[] {
	if (!overridesJson) return BUILTIN_WEB_SITES.map((s) => ({ ...s }));

	let overrides: unknown;
	try {
		overrides = JSON.parse(overridesJson);
	} catch {
		return BUILTIN_WEB_SITES.map((s) => ({ ...s }));
	}
	if (!Array.isArray(overrides)) {
		return BUILTIN_WEB_SITES.map((s) => ({ ...s }));
	}

	const byId = new Map<string, WebSiteConfig>();
	for (const builtin of BUILTIN_WEB_SITES) {
		byId.set(builtin.id, { ...builtin });
	}
	for (const raw of overrides) {
		if (typeof raw !== "object" || raw === null) continue;
		const o = raw as Partial<WebSiteConfig>;
		if (typeof o.id !== "string" || !o.id) continue;
		const base = byId.get(o.id);
		if (base) {
			byId.set(o.id, {
				...base,
				label: typeof o.label === "string" ? o.label : base.label,
				url: typeof o.url === "string" ? o.url : base.url,
				inputSelectors: Array.isArray(o.inputSelectors)
					? o.inputSelectors
					: base.inputSelectors,
				submitSelectors: Array.isArray(o.submitSelectors)
					? o.submitSelectors
					: base.submitSelectors,
				messageSelectors: Array.isArray(o.messageSelectors)
					? o.messageSelectors
					: base.messageSelectors,
				enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
				// builtin 标记不可被用户覆盖
				builtin: true,
			});
		} else if (typeof o.url === "string" && o.url) {
			// 用户自定义站点。harness 用用户提供的值（前端按 `web-<id>` 生成），
			// 缺失才回落——写死成 web-chatgpt 会让所有自定义站点的会话
			// 在会话中枢里被错误归并、标签也显示成 ChatGPT。
			byId.set(o.id, {
				id: o.id,
				harness:
					typeof o.harness === "string" && o.harness
						? o.harness
						: `web-${o.id}`,
				label: typeof o.label === "string" ? o.label : o.id,
				url: o.url,
				inputSelectors: Array.isArray(o.inputSelectors)
					? o.inputSelectors
					: ["div[contenteditable='true']", "textarea"],
				submitSelectors: Array.isArray(o.submitSelectors)
					? o.submitSelectors
					: [],
				messageSelectors: Array.isArray(o.messageSelectors)
					? o.messageSelectors
					: [],
				builtin: false,
				enabled: typeof o.enabled === "boolean" ? o.enabled : true,
			});
		}
	}
	return [...byId.values()];
}
