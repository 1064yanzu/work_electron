import type { AnthropicRequest } from "./types";

const IPO_SUBAGENT_MARKER_RE =
	/<ipo-subagent\b[^>]*scenario=(?:"([^"]+)"|'([^']+)')[^>]*\/?>/i;
const IPO_CONVERSATION_MARKER_RE =
	/<ipo-conversation\b[^>]*id="([^"]+)"[^>]*\/>/i;
const IPO_MARKERS_STRIP_RE =
	/<ipo-(?:subagent|conversation)\b[^>]*\/?>|<\/ipo-(?:subagent|conversation)>/gi;

// 路由标记：<!-- ipo-route:providerId:modelId -->
const IPO_ROUTE_MARKER_RE =
	/<!--\s*ipo-route:([^:]+):([^-]+)\s*-->/i;
const IPO_ROUTE_MARKER_STRIP_RE =
	/<!--\s*ipo-route:[^-]+:[^-]+\s*-->/gi;

const IPO_SUBAGENT_FALLBACK_RE =
	/\bIPO_SUBAGENT_SCENARIO\s*[:=]\s*([^\n\r]+)\s*/i;
const IPO_SUBAGENT_PROMPT_FALLBACK_RE =
	/\bYou are a specialized subagent for:\s*([^\n\r]+)\s*/i;
const IPO_SUBAGENT_FALLBACK_STRIP_RE =
	/\bIPO_SUBAGENT_SCENARIO\s*[:=]\s*[^\n\r]+\s*/gi;

function coerceString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const s = value.trim();
	return s ? s : null;
}

function collectStringsFromUnknown(
	value: unknown,
	out: string[],
	opts?: { depth?: number; maxDepth?: number; maxItems?: number },
) {
	const depth = opts?.depth ?? 0;
	const maxDepth = opts?.maxDepth ?? 6;
	const maxItems = opts?.maxItems ?? 200;
	if (out.length >= maxItems) return;
	if (depth > maxDepth) return;

	if (typeof value === "string") {
		const s = value.trim();
		if (s) out.push(s);
		return;
	}
	if (!value || typeof value !== "object") return;

	if (Array.isArray(value)) {
		for (const v of value) {
			if (out.length >= maxItems) return;
			collectStringsFromUnknown(v, out, {
				depth: depth + 1,
				maxDepth,
				maxItems,
			});
		}
		return;
	}

	for (const v of Object.values(value as Record<string, unknown>)) {
		if (out.length >= maxItems) return;
		collectStringsFromUnknown(v, out, { depth: depth + 1, maxDepth, maxItems });
	}
}

export function collectAnthropicRequestText(
	req: AnthropicRequest,
	opts?: { tailMessages?: number; includeToolUseInputs?: boolean },
): string {
	const chunks: string[] = [];
	const includeToolUseInputs = opts?.includeToolUseInputs === true;
	const sys = (req as any)?.system;
	// Be tolerant: system can be string/array/object depending on upstream SDK versions.
	collectStringsFromUnknown(sys, chunks, { maxDepth: 6, maxItems: 300 });

	const messagesAll = Array.isArray(req.messages) ? req.messages : [];
	const tail =
		typeof opts?.tailMessages === "number" && opts.tailMessages > 0
			? Math.floor(opts.tailMessages)
			: 0;
	const messages =
		tail > 0 && messagesAll.length > tail
			? messagesAll.slice(-tail)
			: messagesAll;
	for (const m of messages) {
		const content = (m as any)?.content;
		if (typeof content === "string") {
			const t = coerceString(content);
			if (t) chunks.push(t);
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			const type = String((block as any).type || "");
			if (type === "text") {
				const t = coerceString((block as any).text);
				if (t) chunks.push(t);
				continue;
			}
			// 子代理场景标记通常会出现在工具调用（如 Task）的 input/prompt 内，
			// 因此这里也收集 tool_use block 的 input 中的字符串，供场景解析使用。
			if (includeToolUseInputs && type === "tool_use") {
				const name = coerceString((block as any).name);
				if (name) chunks.push(name);
				if ((block as any).input) {
					collectStringsFromUnknown((block as any).input, chunks, {
						maxDepth: 6,
						maxItems: 300,
					});
				}
			}
		}
	}

	return chunks.join("\n");
}

export function extractIpoSubagentScenario(
	req: AnthropicRequest,
): string | null {
	// 1. 优先检查 system 字段 (最标准的位置)
	const sysOnly = collectAnthropicRequestText({ ...req, messages: [] } as any, {
		tailMessages: 0,
		includeToolUseInputs: false,
	});

	let scenario = tryExtractScenarioFromText(sysOnly);
	if (scenario) return scenario;

	// 2. 检查 messages 中的第一条消息 (SDK 有时会把 prompt 放在第一条 User 消息)
	if (Array.isArray(req.messages) && req.messages.length > 0) {
		const firstMsg = req.messages[0];
		const firstMsgText = collectAnthropicRequestText(
			{ ...req, messages: [firstMsg], system: undefined } as any,
			{ tailMessages: 0, includeToolUseInputs: false },
		);
		scenario = tryExtractScenarioFromText(firstMsgText);
		if (scenario) return scenario;
	}

	// 3. 实在不行，扫描最近的消息 (防止遗漏上下文中的标记)
	// 但要小心不要匹配到 Task 工具调用的 input (那里面可能包含对子代理的描述，而非子代理本身的身份)
	// 我们主要找 "IPO_SUBAGENT_SCENARIO=xxx" 这种明确的标记
	const haystack = collectAnthropicRequestText(req, {
		tailMessages: 10,
		includeToolUseInputs: false,
	});
	scenario = tryExtractScenarioFromText(haystack);
	if (scenario) return scenario;

	return null;
}

function tryExtractScenarioFromText(text: string): string | null {
	if (!text) return null;

	const sysMatch = text.match(IPO_SUBAGENT_MARKER_RE);
	const sysScenarioRaw = sysMatch?.[1] || sysMatch?.[2] || "";
	const sysScenario = String(sysScenarioRaw || "").trim();
	if (sysScenario) return sysScenario;

	const sysFallback = text.match(IPO_SUBAGENT_FALLBACK_RE);
	if (sysFallback?.[1]) {
		const v = String(sysFallback[1]).trim();
		if (v) return v;
	}

	const sysPromptFallback = text.match(IPO_SUBAGENT_PROMPT_FALLBACK_RE);
	if (sysPromptFallback?.[1]) {
		const label = String(sysPromptFallback[1]).trim();
		const m = label.match(/^自定义：(.+)$/);
		if (m?.[1]) return m[1].trim();
	}

	return null;
}

export function extractIpoConversationId(req: AnthropicRequest): string | null {
	const haystack = collectAnthropicRequestText(req, { tailMessages: 3 });
	const match = haystack.match(IPO_CONVERSATION_MARKER_RE);
	const id = match?.[1] ? String(match[1]).trim() : "";
	return id ? id : null;
}

/**
 * 从请求中提取子代理路由标记 <!-- ipo-route:providerId:modelId -->
 * 返回 { providerId, modelId } 或 null
 */
export function extractIpoRoutingMarker(
	req: AnthropicRequest,
): { providerId: string; modelId: string } | null {
	// 1. 首先检查 system 字段
	const sysOnly = collectAnthropicRequestText({ ...req, messages: [] } as any, {
		tailMessages: 0,
		includeToolUseInputs: false,
	});

	let match = sysOnly.match(IPO_ROUTE_MARKER_RE);
	if (match && match[1] && match[2]) {
		return {
			providerId: match[1].trim(),
			modelId: match[2].trim(),
		};
	}

	// 2. 如果 system 中没有，检查整个请求（包括 messages）
	const fullText = collectAnthropicRequestText(req, {
		tailMessages: 5, // 检查最近的几条消息
		includeToolUseInputs: false,
	});

	match = fullText.match(IPO_ROUTE_MARKER_RE);
	if (match && match[1] && match[2]) {
		return {
			providerId: match[1].trim(),
			modelId: match[2].trim(),
		};
	}

	return null;
}

function stripIpoMarkersFromString(input: string): string {
	// Remove internal routing/log markers so they don't pollute upstream context.
	return String(input || "")
		.replaceAll(IPO_MARKERS_STRIP_RE, "")
		.replaceAll(IPO_SUBAGENT_FALLBACK_STRIP_RE, "")
		.replaceAll(IPO_ROUTE_MARKER_STRIP_RE, "");
}

function stripIpoMarkersFromUnknown(value: unknown): unknown {
	if (typeof value === "string") return stripIpoMarkersFromString(value);
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value))
		return value.map((v) => stripIpoMarkersFromUnknown(v));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = stripIpoMarkersFromUnknown(v);
	}
	return out;
}

export function stripIpoMarkersFromAnthropicRequest(
	req: AnthropicRequest,
): AnthropicRequest {
	const next: AnthropicRequest = {
		...req,
		messages: Array.isArray(req.messages) ? [...req.messages] : [],
	};

	const sys = (req as any)?.system;
	if (typeof sys === "string") {
		(next as any).system = stripIpoMarkersFromString(sys);
	} else if (Array.isArray(sys)) {
		(next as any).system = sys.map((b: any) => {
			if (
				b &&
				typeof b === "object" &&
				b.type === "text" &&
				typeof b.text === "string"
			) {
				return { ...b, text: stripIpoMarkersFromString(b.text) };
			}
			return b;
		});
	}

	next.messages = (Array.isArray(req.messages) ? req.messages : []).map((m) => {
		const content = (m as any)?.content;
		if (typeof content === "string") {
			return { ...m, content: stripIpoMarkersFromString(content) } as any;
		}
		if (!Array.isArray(content)) return m;
		const cleaned = content.map((block: any) => {
			if (!block || typeof block !== "object") return block;
			if (block.type === "text" && typeof block.text === "string") {
				return { ...block, text: stripIpoMarkersFromString(block.text) };
			}
			if (block.type === "tool_use" && block.input) {
				return { ...block, input: stripIpoMarkersFromUnknown(block.input) };
			}
			return block;
		});
		return { ...m, content: cleaned } as any;
	});

	return next;
}
