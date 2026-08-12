/**
 * 内嵌 Web AI 站点清单。
 *
 * selector 一律做成**配置数据**而非硬编码逻辑：这些站点的 DOM 随时会变，
 * 用户可以在设置面板里自行修正选择器，不必等应用更新。
 * 每个选择器都是候��数组，按序尝试，全部失败则降级到「写剪贴板 + 提示手动粘贴」。
 *
 * 各站点用独立 partition（persist:aihub-<id>）隔离登录态，见 aiHubViewService。
 */
import type { DbContext } from "../db/client";
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
		// ChatGPT 的会话是「OpenAI 统一登录」：chatgpt.com 上只有
		// __Secure-next-auth.session-token，真正的会话清单（unified_session_manifest、
		// usc_*、oai-sc、oaicom-stable-id）挂在 .auth.openai.com / .openai.com 上。
		// 不带上 openai.com，导进去仍然是未登录。
		authDomains: ["openai.com"],
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
		// Gemini 用的是 Google 账号会话，凭证（SID/HSID/__Secure-*PSID 等）
		// 全在 .google.com 与 accounts.google.com 上，gemini.google.com 自身没有。
		authDomains: ["google.com"],
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
				// authDomains 属于安全边界，不接受用户覆盖：允许前端写入等于允许
				// 把任意域（网银、邮箱）声明成「登录域」再整域搬运
				authDomains: base.authDomains,
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

/**
 * 从 app_config 读出合并后的站点清单。
 *
 * IPC handler、桥接层（把站点当工具调用）、反向 MCP Server 三处都要用同一份配置，
 * 各自复制一遍 SELECT + mergeWebSites 迟早会漂移，统一在这里出。
 */
export async function loadWebSites(db: DbContext): Promise<WebSiteConfig[]> {
	const res = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [WEB_SITES_CONFIG_KEY],
	});
	const raw = (res.rows[0] as Record<string, unknown> | undefined)?.value;
	return mergeWebSites(typeof raw === "string" ? raw : null);
}

/**
 * 按 harness id 或站点 id 找站点。
 *
 * 调用方拿到的标识来源不一：UI 传的是站点 id（`chatgpt`），
 * canonical 会话里存的是 harness（`web-chatgpt`），MCP 工具的入参两种都可能。
 * 与其在每个调用点判断，不如在这里两种都认。
 */
export function findWebSite(
	sites: WebSiteConfig[],
	idOrHarness: string,
): WebSiteConfig | undefined {
	const key = idOrHarness.trim();
	if (!key) return undefined;
	return (
		sites.find((s) => s.id === key) ??
		sites.find((s) => s.harness === key) ??
		sites.find((s) => `web-${s.id}` === key)
	);
}
