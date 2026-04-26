/**
 * scenarioAgents.ts
 *
 * Dynamic scenario-based subagent builder for the Agent SDK.
 * Generates agent definitions from user-configured scenario configs,
 * handles prompt-to-agent matching, and produces the system prompt
 * policy section that instructs the main model how to delegate.
 */
import type { Logger } from "../../../logging/types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export type AgentModelSettingsLike = {
	scenarioConfigs?: unknown;
};

export type ScenarioModelConfigLike = {
	scenario?: unknown;
	customName?: unknown;
	enabled?: unknown;
	modelId?: unknown;
	providerId?: unknown;
	description?: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function coerceString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const s = value.trim();
	return s ? s : null;
}

function normalizeAgentKey(key: string): string {
	// Keep names stable and readable; avoid newlines/tabs.
	return String(key || "")
		.normalize("NFC")
		.trim()
		.replace(/\s+/g, " ");
}

/**
 * 为自定义场景生成 SDK 兼容的英文 agent key
 * SDK 不接受中文作为 agent key，需要生成英文标识符
 */
function generateAgentKey(
	scenario: string,
	_customName: string | null,
	index: number,
): string {
	if (scenario === "custom") {
		return `custom-${index + 1}`;
	}
	return normalizeAgentKey(scenario);
}

function scenarioLabel(scenario: string, customName?: string | null): string {
	if (scenario === "fast_search") return "快速搜索";
	if (scenario === "code_review") return "代码审查";
	if (scenario === "deep_analysis") return "深度分析";
	if (scenario === "writing") return "写作润色";
	if (scenario === "translation") return "翻译";
	if (scenario === "data_processing") return "数据处理";
	if (scenario === "debugging") return "调试排错";
	if (scenario === "custom")
		return customName ? `自定义：${customName}` : "自定义";
	return scenario || "unknown";
}

// ---------------------------------------------------------------------------
// Trigger keyword extraction from description
// ---------------------------------------------------------------------------

/**
 * 从子代理描述中自动提取触发关键词
 * 用于用户没有配置 triggerKeywords 时的备用匹配
 */
function extractTriggerKeywordsFromDescription(description: string): string[] {
	const keywords: string[] = [];
	const desc = description.toLowerCase();

	// 画图/图像相关
	const imagePatterns = [
		"画图",
		"绘图",
		"绘制",
		"作图",
		"生成图",
		"创建图",
		"制作图",
		"图片",
		"图像",
		"图画",
		"插图",
		"插画",
		"海报",
		"画面",
		"generate image",
		"create image",
		"draw",
	];
	for (const p of imagePatterns) {
		if (desc.includes(p.toLowerCase())) {
			keywords.push(p);
		}
	}

	// 视频相关
	const videoPatterns = ["视频", "动画", "video", "animation"];
	for (const p of videoPatterns) {
		if (desc.includes(p.toLowerCase())) {
			keywords.push(p);
		}
	}

	// 搜索相关
	const searchPatterns = ["搜索", "查找", "检索", "search", "find"];
	for (const p of searchPatterns) {
		if (desc.includes(p.toLowerCase())) {
			keywords.push(p);
		}
	}

	// 代码相关
	const codePatterns = ["代码", "编程", "开发", "coding", "programming"];
	for (const p of codePatterns) {
		if (desc.includes(p.toLowerCase())) {
			keywords.push(p);
		}
	}

	// 翻译相关
	const translatePatterns = ["翻译", "translate", "translation"];
	for (const p of translatePatterns) {
		if (desc.includes(p.toLowerCase())) {
			keywords.push(p);
		}
	}

	return keywords;
}

// ---------------------------------------------------------------------------
// Prompt matching
// ---------------------------------------------------------------------------

export function matchScenarioAgentForPrompt(opts: {
	settings: AgentModelSettingsLike | null;
	promptText: string;
}): { agentKey: string; description: string; matchedKeyword: string } | null {
	const promptText = String(opts.promptText || "");
	const lower = promptText.toLowerCase();
	const configs = Array.isArray(opts.settings?.scenarioConfigs)
		? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
		: [];

	// Keep custom-N stable by config order (UI order), regardless of enabled/disabled state.
	let customIndex = 0;
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		const scenario = coerceString((c as any).scenario) || "";
		if (!scenario) continue;
		const customName = coerceString((c as any).customName);

		const indexForKey = customIndex;
		if (scenario === "custom") customIndex++;

		// Disabled configs should not be auto-matched.
		if ((c as any).enabled === false) continue;

		const agentKey = generateAgentKey(scenario, customName, indexForKey);
		if (!agentKey) continue;

		// 获取用户配置的触发关键词
		let triggerKeywords = Array.isArray((c as any).triggerKeywords)
			? (c as any).triggerKeywords
			: [];

		// 如果用户没有配置关键词，从描述中自动提取
		if (triggerKeywords.length === 0 && customName) {
			const autoKeywords = extractTriggerKeywordsFromDescription(customName);
			triggerKeywords = autoKeywords;
		}

		for (const kw of triggerKeywords) {
			const k = String(kw || "").trim();
			if (!k) continue;
			const kl = k.toLowerCase();
			const hit = lower.includes(kl) || promptText.includes(k);
			if (!hit) continue;

			const description =
				scenario === "custom" && customName
					? customName
					: scenarioLabel(scenario, customName);
			return { agentKey, description, matchedKeyword: k };
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Subagent type resolution (from Chinese description / alias to agent key)
// ---------------------------------------------------------------------------

export function buildSubagentAliasMap(
	agents: Record<string, { description?: unknown }>,
): Map<string, string> {
	const map = new Map<string, string>();
	const add = (alias: unknown, agentKey: string) => {
		if (typeof alias !== "string") return;
		const n = normalizeAgentKey(alias);
		if (!n) return;
		if (!map.has(n)) map.set(n, agentKey);
	};

	for (const [agentKey, def] of Object.entries(agents)) {
		add(agentKey, agentKey);
		add((def as any)?.description, agentKey);

		// Common user/model inputs we want to tolerate.
		const desc =
			typeof (def as any)?.description === "string"
				? (def as any).description
				: "";
		if (desc.startsWith("自定义："))
			add(desc.slice("自定义：".length), agentKey);
		add(`custom:${desc}`, agentKey);
	}
	return map;
}

export function resolveSubagentType(
	rawSubagentType: string,
	agents: Record<string, unknown>,
	aliasMap: Map<string, string>,
): string | null {
	const raw = String(rawSubagentType || "");
	const trimmed = raw.trim().replace(/^["'""'']+|["'""'']+$/g, "");
	const norm = normalizeAgentKey(trimmed);
	if (!norm) return null;

	// Exact key match (after normalization).
	if (Object.prototype.hasOwnProperty.call(agents, norm)) return norm;
	const dashToUnderscore = norm.replace(/-/g, "_");
	if (
		dashToUnderscore !== norm &&
		Object.prototype.hasOwnProperty.call(agents, dashToUnderscore)
	) {
		return dashToUnderscore;
	}
	const underscoreToDash = norm.replace(/_/g, "-");
	if (
		underscoreToDash !== norm &&
		Object.prototype.hasOwnProperty.call(agents, underscoreToDash)
	) {
		return underscoreToDash;
	}
	const lower = /^[\x00-\x7F]+$/.test(norm) ? norm.toLowerCase() : null;
	if (lower && Object.prototype.hasOwnProperty.call(agents, lower))
		return lower;

	// Alias match (e.g. Chinese description / customName).
	const direct = aliasMap.get(norm);
	if (direct && Object.prototype.hasOwnProperty.call(agents, direct))
		return direct;

	// Prefix tolerance.
	if (norm.startsWith("custom:")) {
		const n2 = normalizeAgentKey(norm.slice("custom:".length));
		const v2 = aliasMap.get(n2);
		if (v2 && Object.prototype.hasOwnProperty.call(agents, v2)) return v2;
	}
	if (norm.startsWith("自定义：")) {
		const n2 = normalizeAgentKey(norm.slice("自定义：".length));
		const v2 = aliasMap.get(n2);
		if (v2 && Object.prototype.hasOwnProperty.call(agents, v2)) return v2;
	}

	// Last-resort: if it doesn't look like a valid agent key, fall back to a built-in.
	// This avoids hard failures like: Agent type 'xxx' not found.
	const looksLikeKey = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(norm);
	if (!looksLikeKey) return "general-purpose";

	return null;
}

// ---------------------------------------------------------------------------
// Tools per scenario
// ---------------------------------------------------------------------------

function toolsForScenario(
	scenario: string,
	opts?: { includeSkills?: boolean },
): string[] {
	const includeSkills = opts?.includeSkills === true;
	switch (scenario) {
		case "fast_search":
			return ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
		case "code_review":
			return ["Read", "Grep", "Glob", "Bash", "WebSearch", "WebFetch"];
		case "deep_analysis":
			return [
				"Read",
				"Edit",
				"Write",
				"Bash",
				"Grep",
				"Glob",
				"WebSearch",
				"WebFetch",
			];
		case "debugging":
			return ["Read", "Edit", "Bash", "Grep", "Glob", "WebSearch", "WebFetch"];
		case "writing":
			return includeSkills
				? ["Skill", "Read", "Glob", "Grep", "Write", "WebSearch", "WebFetch"]
				: ["Read", "Write", "WebSearch", "WebFetch"];
		case "translation":
			return ["Read", "Write", "WebFetch"];
		case "data_processing":
			return ["Read", "Write", "Bash", "WebSearch", "WebFetch"];
		default:
			// Custom / unknown: allow common tools; include Skill to unlock special capabilities.
			return includeSkills
				? [
						"Skill",
						"Read",
						"Write",
						"Edit",
						"Bash",
						"Grep",
						"Glob",
						"WebSearch",
						"WebFetch",
					]
				: [
						"Read",
						"Write",
						"Edit",
						"Bash",
						"Grep",
						"Glob",
						"WebSearch",
						"WebFetch",
					];
	}
}

// ---------------------------------------------------------------------------
// Subagent prompt builder
// ---------------------------------------------------------------------------

function promptForScenarioAgent(opts: {
	agentKey: string;
	scenario: string;
	customName?: string | null;
	includeSkills: boolean;
	// 模型路由信息（嵌入到 prompt 中，由 proxy 解析）
	providerId?: string | null;
	modelId?: string | null;
}): string {
	const label = scenarioLabel(opts.scenario, opts.customName);
	const skillHint = opts.includeSkills
		? "You may use the Skill tool when it accelerates the work."
		: "";

	// 构建路由标记（隐藏在 XML 注释中，proxy 会解析）
	const routingMarker =
		opts.providerId && opts.modelId
			? `<!-- ipo-route:${opts.providerId}:${opts.modelId} -->\n`
			: "";

	return [
		routingMarker,
		`You are a specialized subagent for: ${label}.`,
		"Work autonomously and thoroughly within your scope: explore, plan, execute, and verify before returning.",
		"For complex requests, take as many turns as needed — do not collapse to a shallow answer just to finish quickly.",
		"Use only the context provided in the Task prompt; do NOT recap the parent conversation.",
		"Return a structured, self-contained result the parent agent can act on (summary / key findings / artifacts / next actions). Length should match the task — concise when trivial, detailed when the work warrants it.",
		skillHint,
		"",
	]
		.filter(Boolean)
		.join("\n");
}

// ---------------------------------------------------------------------------
// Build dynamic scenario agents config
// ---------------------------------------------------------------------------

export function buildDynamicScenarioAgents(opts: {
	settings: AgentModelSettingsLike | null;
	enabledSkills: string[];
	logger: Logger;
}): Record<string, any> {
	const agents: Record<string, any> = {};
	const configs = Array.isArray(opts.settings?.scenarioConfigs)
		? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
		: [];

	// Keep custom-N stable by config order (UI order), regardless of enabled/disabled state.
	let customIndex = 0;

	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		const scenario = coerceString((c as any).scenario) || "";
		if (!scenario) continue;
		const customName = coerceString((c as any).customName);

		const indexForKey = customIndex;
		if (scenario === "custom") customIndex++;

		// Only enabled configs become runnable subagents.
		if ((c as any).enabled === false) continue;

		// 为自定义场景生成英文 key（SDK 不接受中文）
		const agentKey = generateAgentKey(scenario, customName, indexForKey);
		if (!agentKey) continue;

		const includeSkills = scenario === "writing" || scenario === "custom";
		const isCustom = scenario === "custom";

		// 描述使用中文名称供主模型理解
		const description =
			scenario === "custom" && customName
				? customName
				: scenarioLabel(scenario, customName);

		const modelId = coerceString((c as any).modelId);
		const providerId = coerceString((c as any).providerId);

		// 【调试】检查路由参数
		opts.logger.info({
			msg: "agent_sdk buildDynamicScenarioAgents routing params",
			scope: "agent",
			agentKey,
			modelId: modelId || null,
			providerId: providerId || null,
			hasRouting: !!(providerId && modelId),
		});

		agents[agentKey] = {
			description,
			prompt: promptForScenarioAgent({
				agentKey,
				scenario,
				customName,
				includeSkills,
				providerId,
				modelId,
			}),
			// SDK 只接受 model: 'sonnet' | 'opus' | 'haiku' | 'inherit' (文档第7167行)
			// 自定义模型路由将在 anthropic proxy 层通过 agentKey (如 custom-1) 来识别和处理
			// 这里使用 undefined 让 agent 继承主模型，proxy 会根据 subagentKey 路由到正确的 provider+model
			model: undefined,
			// 自定义场景子代理：保持足够自由（继承主线程工具，允许 Task 嵌套）
			...(isCustom
				? {}
				: {
						tools: toolsForScenario(scenario, { includeSkills }),
						disallowedTools: ["Task"],
					}),
			skills:
				includeSkills && opts.enabledSkills.length > 0
					? opts.enabledSkills
					: undefined,
			// 默认不限制子代理轮数：长程复杂任务（如代码审查、深度分析、自定义场景）
			// 经常需要远超 20-30 轮的多轮探索/验证。失控保护交给主代理的 max_budget_usd 和用户中止能力。
		};
	}

	// 【调试】记录生成的子代理
	opts.logger.info({
		msg: "agent_sdk buildDynamicScenarioAgents result",
		scope: "agent",
		agentKeysGenerated: Object.keys(agents),
		agentsCount: Object.keys(agents).length,
		agentsPreview: Object.entries(agents)
			.slice(0, 5)
			.map(([k, v]) => ({
				agentKey: k,
				description: (v as any)?.description,
				modelEncoded: !!(v as any)?.model,
			})),
	});

	return agents;
}

// ---------------------------------------------------------------------------
// Build subagent policy (appended to system prompt)
// ---------------------------------------------------------------------------

export function buildSubagentPolicyAppend(opts: {
	settings: AgentModelSettingsLike | null;
	enabledSkills: string[];
	logger: Logger;
}): string {
	const configs = Array.isArray(opts.settings?.scenarioConfigs)
		? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
		: [];

	const lines: string[] = [];
	const MAX_SKILLS = 8;
	const MAX_SUBAGENTS = 8;
	if (opts.enabledSkills.length > 0) {
		lines.push("## Skills（可通过 Skill 工具调用）");
		lines.push(
			`已安装技能（节选）：${opts.enabledSkills.slice(0, MAX_SKILLS).join(", ")}`,
		);
		if (opts.enabledSkills.length > MAX_SKILLS) {
			lines.push(`（还有 ${opts.enabledSkills.length - MAX_SKILLS} 个已省略）`);
		}
		lines.push("");
	}
	if (configs.length === 0) return lines.join("\n");

	type ScenarioItem = {
		agentKey: string;
		description: string;
		enabled: boolean;
	};
	let customIndex = 0;
	const items: ScenarioItem[] = [];
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		const scenario = coerceString((c as any).scenario) || "";
		if (!scenario) continue;
		const customName = coerceString((c as any).customName);
		const indexForKey = customIndex;
		if (scenario === "custom") customIndex++;
		const agentKey = generateAgentKey(scenario, customName, indexForKey);
		if (!agentKey) continue;
		const description =
			scenario === "custom" && customName
				? customName
				: scenarioLabel(scenario, customName);
		items.push({
			agentKey,
			description,
			enabled: (c as any).enabled !== false,
		});
	}

	const enabled = items.filter((x) => x.enabled).slice(0, MAX_SUBAGENTS);
	lines.push("## 子代理(通过 Task 工具调用)");
	lines.push("优先把复杂任务委派给最匹配的子代理，并只传最小必要上下文。");
	lines.push(
		'调用方式：Task({ subagent_type: "<英文标识符>", description: "简述任务", prompt: "任务 + 最小上下文" })',
	);
	lines.push("已启用子代理（节选）：");
	for (const x of enabled) {
		lines.push(`- ${x.description} -> Task(subagent_type="${x.agentKey}")`);
	}
	if (items.filter((x) => x.enabled).length > MAX_SUBAGENTS) {
		lines.push(
			`- ...(还有 ${items.filter((x) => x.enabled).length - MAX_SUBAGENTS} 个已省略)`,
		);
	}
	lines.push(
		"注意：同一需求在拿到子代理结果前不要重复调用同类 Task；子代理返回后直接汇总。",
	);
	lines.push(
		"（内置子代理：general-purpose / Explore / Plan / Bash 可直接使用）",
	);

	const result = lines.join("\n");
	opts.logger.info({
		msg: "agent_sdk buildSubagentPolicyAppend result",
		scope: "agent",
		enabledSubagentsCount: items.filter((x) => x.enabled).length,
		disabledSubagentsCount: items.filter((x) => !x.enabled).length,
		subagentItems: items.map((x) => ({
			agentKey: x.agentKey,
			description: x.description.slice(0, 50),
			enabled: x.enabled,
		})),
		promptPreview: result.slice(0, 500),
	});

	return result;
}

// ---------------------------------------------------------------------------
// Build append system prompt (for SDK's preset+append mode)
// ---------------------------------------------------------------------------

/**
 * 构建追加到 Claude Code preset 之后的项目特定 system prompt。
 *
 * 主入口使用 SDK 的 `{ type: 'preset', preset: 'claude_code', append }` 模式：
 * - SDK preset 提供长程任务工作哲学（探索/规划/TodoWrite/验证/根因分析/不妥协）
 * - 这里仅追加 preset 不知道的项目特定内容
 *
 * 原则：preset 已经覆盖的（工具列表、Read-before-Edit、并发、Task 委派、
 * system-reminder、cwd/date/model 注入等）一律不再重复，避免污染上下文 +
 * 抢占 preset 的权威性。
 *
 * Cache 友好排序：内容按"越静态越靠前"组织，最大化跨会话 prompt cache 命中：
 * - 段 1：纯静态（语言偏好）— 永不变
 * - 段 2：与 cwd 相关的沙盒政策 — 单会话内稳定
 * - 段 3：Knowledge Wiki 引导 — 仅在检测到 .llm-wiki 时注入
 */
export function buildAppendSystemPrompt(opts: {
	cwd: string;
	wikiScopePath?: string;
}): string {
	const segments: string[] = [];

	// ── 段 1：语言偏好（纯静态，跨会话稳定）──
	segments.push(
		"## Language",
		"Always respond in Chinese (中文) regardless of the language used in tool outputs or source files.",
	);

	// ── 段 2：沙盒权限政策（基于 cwd，单会话内稳定）──
	const fileAccessLines: string[] = [
		"## File Access Policy",
		"- The current working directory is the user's sandbox; reads/writes inside it are auto-approved.",
	];
	if (opts.wikiScopePath) {
		fileAccessLines.push(
			`- Reads/writes inside \`${opts.wikiScopePath}/.llm-wiki/\` are auto-approved (wiki maintenance).`,
		);
	}
	fileAccessLines.push(
		"- Reading files anywhere on the machine is allowed.",
		"- Writes/edits OUTSIDE the sandbox require user approval — a permission prompt will surface.",
		"- Destructive Bash commands (rm, mv to outside sandbox, etc.) require user approval.",
		"- Sensitive paths (~/.ssh, ~/.gnupg, system directories) are always blocked.",
		"- Use absolute paths when accessing files outside the sandbox.",
	);
	segments.push(fileAccessLines.join("\n"));

	segments.push(
		[
			"## Tool Failure Recovery",
			"- When a tool call fails, do not stop immediately and do not treat the first failure as the final answer.",
			"- Read the exact error, repair the input, and continue from the current context.",
			"- For missing files or wrong paths: first list the real directory contents, then operate on the exact file that actually exists.",
			"- For screenshot / image / conversion failures: verify the source file exists, then try another preview or export route instead of ending the task early.",
			"- Only stop and ask the user when recovery attempts are exhausted or when explicit approval is truly required.",
		].join("\n"),
	);

	// ── 段 3：Knowledge Wiki（仅在检测到 .llm-wiki 时注入；最动态，放最后）──
	if (opts.wikiScopePath) {
		const wikiPath = `${opts.wikiScopePath}/.llm-wiki`;
		segments.push(
			[
				"## Knowledge Wiki (Karpathy LLM Wiki pattern)",
				`This project ships a Knowledge Wiki at \`${wikiPath}/\` — an LLM-compiled view of source materials. **Treat it as the primary knowledge source** for any task involving project content.`,
				"",
				"Workflow:",
				`- For tasks like "根据材料" / "基于资料" or any project-content question: first read \`${wikiPath}/index.md\` to locate relevant pages, then read 2–5 related pages before producing output.`,
				"- Wiki content takes priority over general knowledge / training data; do not generate project-content output without consulting the wiki.",
				"- Maintain the wiki: new files → ingest workflow; new syntheses after answering → backfill workflow; periodic lint checks.",
				`- Use absolute paths for wiki files (\`${wikiPath}/index.md\` etc.); SCHEMA.md contains the full operations manual.`,
				`- Cross-references use \`[[slug]]\` syntax; append every operation to \`${wikiPath}/log.md\`.`,
			].join("\n"),
		);
	}

	return segments.join("\n\n");
}
