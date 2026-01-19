// 智能工具选择器
// 基于上下文、历史和语义理解进行工具推荐和自动选择

import { toolRegistry } from "../registry";
import type { ToolDefinition, ToolType } from "../types";
import { enhancedMemory } from "./memorySystem";

// ==================== 类型定义 ====================

// 工具能力描述
export interface ToolCapability {
	tool: ToolType;
	capabilities: string[];
	useCases: string[];
	inputRequirements: string[];
	outputFormat: string;
	cost: "low" | "medium" | "high";
	reliability: number; // 0-1
	speed: "fast" | "medium" | "slow";
	sideEffects: boolean;
}

// 工具匹配结果
export interface ToolMatch {
	tool: ToolType;
	score: number; // 匹配分数 0-1
	confidence: number; // 置信度 0-1
	reasoning: string; // 选择原因
	suggestedInput?: Record<string, unknown>;
	alternatives: ToolType[]; // 备选工具
}

// 任务意图
export interface TaskIntent {
	type: "query" | "action" | "creation" | "analysis" | "transformation";
	domain: string; // 领域：计算、检索、文档、代码等
	complexity: "simple" | "moderate" | "complex";
	requiresNetwork: boolean;
	requiresLocalData: boolean;
	requiresComputation: boolean;
	keywords: string[];
}

// 工具选择上下文
export interface ToolSelectionContext {
	goal: string;
	previousTools: ToolType[];
	previousResults: Array<{
		tool: ToolType;
		success: boolean;
		summary?: string;
	}>;
	availableContext: string[];
	constraints?: {
		maxCost?: "low" | "medium" | "high";
		preferSpeed?: boolean;
		avoidSideEffects?: boolean;
	};
}

// 选择策略
export type SelectionStrategy =
	| "greedy" // 贪心：选择最佳匹配
	| "conservative" // 保守：优先低风险工具
	| "exploratory" // 探索：尝试新工具
	| "efficient" // 高效：优先快速工具
	| "comprehensive"; // 全面：选择多个工具覆盖

// ==================== 工具能力知识库 ====================

const TOOL_CAPABILITIES: Record<ToolType, ToolCapability> = {
	code_execute: {
		tool: "code_execute",
		capabilities: [
			"计算",
			"数据处理",
			"生成图表",
			"执行算法",
			"数学运算",
			"统计分析",
		],
		useCases: [
			"计算数学问题",
			"数据分析",
			"生成可视化",
			"执行脚本",
			"处理数据",
		],
		inputRequirements: ["language", "code"],
		outputFormat: "执行结果文本",
		cost: "medium",
		reliability: 0.85,
		speed: "medium",
		sideEffects: false,
	},
	web_search: {
		tool: "web_search",
		capabilities: ["搜索", "查找信息", "获取最新资讯", "检索网络内容"],
		useCases: ["搜索资料", "查找答案", "获取新闻", "了解事件"],
		inputRequirements: ["query"],
		outputFormat: "搜索结果列表",
		cost: "low",
		reliability: 0.9,
		speed: "fast",
		sideEffects: false,
	},
	kb_search_chunks: {
		tool: "kb_search_chunks",
		capabilities: ["本地检索", "资料库查询", "知识检索", "文档搜索"],
		useCases: ["查找本地资料", "检索笔记", "搜索文档"],
		inputRequirements: ["query"],
		outputFormat: "分块检索结果",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: false,
	},
	fetch_url: {
		tool: "fetch_url",
		capabilities: ["抓取网页", "获取正文", "解析内容"],
		useCases: ["获取网页详情", "阅读文章", "提取内容"],
		inputRequirements: ["url"],
		outputFormat: "网页正文",
		cost: "medium",
		reliability: 0.8,
		speed: "medium",
		sideEffects: false,
	},
	doc_create: {
		tool: "doc_create",
		capabilities: ["创建文档", "生成文章", "写作"],
		useCases: ["创建新文档", "写文章", "生成报告"],
		inputRequirements: ["title", "content"],
		outputFormat: "文档对象",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: true,
	},
	doc_update: {
		tool: "doc_update",
		capabilities: ["更新文档", "修改内容", "重写"],
		useCases: ["更新整个文档", "重写内容"],
		inputRequirements: ["content"],
		outputFormat: "更新结果",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: true,
	},
	doc_patch: {
		tool: "doc_patch",
		capabilities: ["局部修改", "插入内容", "替换文本", "小改动"],
		useCases: ["插入段落", "替换文字", "追加内容"],
		inputRequirements: ["edits"],
		outputFormat: "补丁结果",
		cost: "low",
		reliability: 0.9,
		speed: "fast",
		sideEffects: true,
	},
	mcp_call: {
		tool: "mcp_call",
		capabilities: ["外部服务调用", "MCP协议", "扩展工具"],
		useCases: ["调用MCP服务器", "使用外部工具"],
		inputRequirements: ["serverName", "toolName", "input"],
		outputFormat: "MCP响应",
		cost: "high",
		reliability: 0.7,
		speed: "slow",
		sideEffects: true,
	},
	file_read: {
		tool: "file_read",
		capabilities: ["读取文件", "获取文件内容"],
		useCases: ["读取本地文件", "获取文件内容"],
		inputRequirements: ["path"],
		outputFormat: "文件内容",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: false,
	},
	file_list: {
		tool: "file_list",
		capabilities: ["列出目录", "查看文件列表"],
		useCases: ["列出本地目录文件", "检查目录结构"],
		inputRequirements: ["path"],
		outputFormat: "文件列表",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: false,
	},
	file_write: {
		tool: "file_write",
		capabilities: ["写入文件", "保存内容"],
		useCases: ["保存文件", "写入内容"],
		inputRequirements: ["path", "content"],
		outputFormat: "写入结果",
		cost: "medium",
		reliability: 0.9,
		speed: "fast",
		sideEffects: true,
	},
	browser_open: {
		tool: "browser_open",
		capabilities: ["打开浏览器", "访问网页", "JS渲染"],
		useCases: ["访问需要渲染的网页", "浏览网站"],
		inputRequirements: ["url"],
		outputFormat: "浏览器状态",
		cost: "high",
		reliability: 0.8,
		speed: "slow",
		sideEffects: false,
	},
	browser_screenshot: {
		tool: "browser_screenshot",
		capabilities: ["截图", "屏幕捕获"],
		useCases: ["截取网页", "保存视觉"],
		inputRequirements: [],
		outputFormat: "截图图像",
		cost: "medium",
		reliability: 0.85,
		speed: "medium",
		sideEffects: false,
	},
	llm_call: {
		tool: "llm_call",
		capabilities: ["推理", "分析", "生成文本", "理解", "总结"],
		useCases: ["分析内容", "生成文本", "回答问题", "总结信息"],
		inputRequirements: ["prompt"],
		outputFormat: "文本响应",
		cost: "medium",
		reliability: 0.9,
		speed: "medium",
		sideEffects: false,
	},
	skill_call: {
		tool: "skill_call",
		capabilities: ["执行技能", "专业任务", "自动化工作流"],
		useCases: ["执行已定义的技能", "专业化任务处理"],
		inputRequirements: ["skill_name"],
		outputFormat: "技能执行结果",
		cost: "medium",
		reliability: 0.85,
		speed: "medium",
		sideEffects: true,
	},
	skill_invoke: {
		tool: "skill_invoke",
		capabilities: ["激活技能", "读取技能指令", "加载技能上下文"],
		useCases: ["读取SKILL.md", "激活专业技能"],
		inputRequirements: ["skill_name"],
		outputFormat: "技能指令内容",
		cost: "low",
		reliability: 0.95,
		speed: "fast",
		sideEffects: false,
	},
	custom: {
		tool: "custom",
		capabilities: ["自定义功能"],
		useCases: ["自定义操作"],
		inputRequirements: [],
		outputFormat: "自定义",
		cost: "medium",
		reliability: 0.7,
		speed: "medium",
		sideEffects: true,
	},
};

// 意图关键词映射
const INTENT_KEYWORDS: Record<string, { tools: ToolType[]; domain: string }> = {
	// 计算相关
	计算: { tools: ["code_execute"], domain: "computation" },
	算: { tools: ["code_execute"], domain: "computation" },
	求和: { tools: ["code_execute"], domain: "computation" },
	统计: { tools: ["code_execute"], domain: "computation" },
	数学: { tools: ["code_execute"], domain: "computation" },
	公式: { tools: ["code_execute"], domain: "computation" },
	阶乘: { tools: ["code_execute"], domain: "computation" },
	生成图表: { tools: ["code_execute"], domain: "computation" },
	词云: { tools: ["code_execute"], domain: "computation" },

	// 搜索相关
	搜索: { tools: ["web_search", "kb_search_chunks"], domain: "search" },
	查找: { tools: ["kb_search_chunks", "web_search"], domain: "search" },
	检索: { tools: ["kb_search_chunks", "web_search"], domain: "search" },
	查一下: { tools: ["web_search", "kb_search_chunks"], domain: "search" },
	了解: { tools: ["web_search", "kb_search_chunks"], domain: "search" },
	是什么: { tools: ["kb_search_chunks", "web_search"], domain: "search" },

	// 文档相关
	写: { tools: ["doc_create", "doc_update"], domain: "document" },
	创建文档: { tools: ["doc_create"], domain: "document" },
	新文档: { tools: ["doc_create"], domain: "document" },
	修改: { tools: ["doc_patch", "doc_update"], domain: "document" },
	编辑: { tools: ["doc_patch", "doc_update"], domain: "document" },
	插入: { tools: ["doc_patch"], domain: "document" },
	替换: { tools: ["doc_patch"], domain: "document" },
	更新: { tools: ["doc_update", "doc_patch"], domain: "document" },

	// 网页相关
	打开网页: { tools: ["browser_open"], domain: "browser" },
	访问: { tools: ["fetch_url", "browser_open"], domain: "browser" },
	抓取: { tools: ["fetch_url"], domain: "browser" },
	获取网页: { tools: ["fetch_url"], domain: "browser" },

	// 文件相关
	读取文件: { tools: ["file_read"], domain: "file" },
	写入文件: { tools: ["file_write"], domain: "file" },
	保存: { tools: ["file_write", "doc_create"], domain: "file" },

	// 分析相关
	分析: { tools: ["llm_call", "code_execute"], domain: "analysis" },
	总结: { tools: ["llm_call"], domain: "analysis" },
	解释: { tools: ["llm_call"], domain: "analysis" },
	理解: { tools: ["llm_call"], domain: "analysis" },
};

// ==================== 智能工具选择器类 ====================

export class IntelligentToolSelector {
	private usageHistory: Map<ToolType, { count: number; successRate: number }> =
		new Map();

	constructor() {
		this.initializeUsageHistory();
	}

	// 初始化使用历史
	private initializeUsageHistory(): void {
		for (const tool of Object.keys(TOOL_CAPABILITIES) as ToolType[]) {
			this.usageHistory.set(tool, { count: 0, successRate: 0.5 });
		}
	}

	// 分析任务意图
	async analyzeIntent(goal: string): Promise<TaskIntent> {
		// 基于关键词的快速分析
		const keywords: string[] = [];
		const matchedTools = new Set<ToolType>();
		let domain = "general";

		for (const [keyword, info] of Object.entries(INTENT_KEYWORDS)) {
			if (goal.includes(keyword)) {
				keywords.push(keyword);
				info.tools.forEach((t) => matchedTools.add(t));
				if (domain === "general") {
					domain = info.domain;
				}
			}
		}

		// 判断复杂度
		let complexity: TaskIntent["complexity"] = "simple";
		if (goal.length > 100 || keywords.length > 3) {
			complexity = "complex";
		} else if (goal.length > 50 || keywords.length > 1) {
			complexity = "moderate";
		}

		// 判断类型
		let type: TaskIntent["type"] = "query";
		if (/写|创建|生成|输出/.test(goal)) {
			type = "creation";
		} else if (/分析|评估|判断/.test(goal)) {
			type = "analysis";
		} else if (/修改|转换|格式化/.test(goal)) {
			type = "transformation";
		} else if (/执行|运行|调用/.test(goal)) {
			type = "action";
		}

		return {
			type,
			domain,
			complexity,
			requiresNetwork: /搜索|网络|在线|最新|新闻/.test(goal),
			requiresLocalData: /本地|资料库|文档|笔记/.test(goal),
			requiresComputation: /计算|算|数学|统计|图表/.test(goal),
			keywords,
		};
	}

	// 选择工具
	async selectTools(
		context: ToolSelectionContext,
		strategy: SelectionStrategy = "greedy",
	): Promise<ToolMatch[]> {
		// 1. 分析意图
		const intent = await this.analyzeIntent(context.goal);

		// 2. 获取可用工具
		const availableTools = toolRegistry.getAll();

		// 3. 计算每个工具的匹配分数
		const matches: ToolMatch[] = [];

		for (const tool of availableTools) {
			const capability = TOOL_CAPABILITIES[tool.type];
			if (!capability) continue;

			const score = this.calculateMatchScore(tool, intent, context, capability);
			const confidence = this.calculateConfidence(tool.type, context);

			if (score > 0.1) {
				matches.push({
					tool: tool.type,
					score,
					confidence,
					reasoning: this.generateReasoning(tool, intent, score),
					suggestedInput: this.suggestInput(tool.type, context.goal),
					alternatives: [],
				});
			}
		}

		// 4. 排序
		matches.sort((a, b) => {
			// 综合考虑分数和置信度
			const scoreA = a.score * 0.7 + a.confidence * 0.3;
			const scoreB = b.score * 0.7 + b.confidence * 0.3;
			return scoreB - scoreA;
		});

		// 5. 根据策略调整
		const adjusted = this.applyStrategy(matches, strategy, context);

		// 6. 添加备选工具
		for (const match of adjusted) {
			match.alternatives = matches
				.filter((m) => m.tool !== match.tool && m.score > 0.3)
				.slice(0, 3)
				.map((m) => m.tool);
		}

		return adjusted;
	}

	// 计算匹配分数
	private calculateMatchScore(
		tool: ToolDefinition,
		intent: TaskIntent,
		context: ToolSelectionContext,
		capability: ToolCapability,
	): number {
		let score = 0;

		// 1. 能力匹配（40%）
		for (const cap of capability.capabilities) {
			if (intent.keywords.some((k) => cap.includes(k) || k.includes(cap))) {
				score += 0.1;
			}
		}
		score = Math.min(score, 0.4);

		// 2. 用例匹配（30%）
		for (const useCase of capability.useCases) {
			if (
				context.goal.includes(useCase) ||
				useCase.includes(context.goal.slice(0, 10))
			) {
				score += 0.1;
			}
		}
		score = Math.min(score, 0.7);

		// 3. 领域匹配（15%）
		const domainMatch: Record<string, ToolType[]> = {
			computation: ["code_execute"],
			search: ["web_search", "kb_search_chunks"],
			document: ["doc_create", "doc_update", "doc_patch"],
			browser: ["browser_open", "fetch_url"],
			file: ["file_read", "file_write"],
			analysis: ["llm_call"],
		};

		if (domainMatch[intent.domain]?.includes(tool.type)) {
			score += 0.15;
		}

		// 4. 历史成功率（15%）
		const history = this.usageHistory.get(tool.type);
		if (history && history.count > 0) {
			score += history.successRate * 0.15;
		}

		// 5. 约束调整
		if (context.constraints) {
			if (context.constraints.preferSpeed && capability.speed === "slow") {
				score *= 0.8;
			}
			if (context.constraints.avoidSideEffects && capability.sideEffects) {
				score *= 0.7;
			}
			if (context.constraints.maxCost) {
				const costRank = { low: 1, medium: 2, high: 3 };
				if (costRank[capability.cost] > costRank[context.constraints.maxCost]) {
					score *= 0.6;
				}
			}
		}

		return Math.min(score, 1);
	}

	// 计算置信度
	private calculateConfidence(
		tool: ToolType,
		context: ToolSelectionContext,
	): number {
		let confidence = 0.5;

		// 之前使用过相同工具
		if (context.previousTools.includes(tool)) {
			const prevResult = context.previousResults.find((r) => r.tool === tool);
			if (prevResult?.success) {
				confidence += 0.2;
			} else {
				confidence -= 0.1;
			}
		}

		// 工具可靠性
		const capability = TOOL_CAPABILITIES[tool];
		if (capability) {
			confidence += capability.reliability * 0.3;
		}

		return Math.min(Math.max(confidence, 0), 1);
	}

	// 生成推理说明
	private generateReasoning(
		tool: ToolDefinition,
		intent: TaskIntent,
		score: number,
	): string {
		const capability = TOOL_CAPABILITIES[tool.type];
		if (!capability) return "未知工具";

		const reasons: string[] = [];

		if (intent.keywords.length > 0) {
			const matched = capability.capabilities.filter((c) =>
				intent.keywords.some((k) => c.includes(k) || k.includes(c)),
			);
			if (matched.length > 0) {
				reasons.push(`匹配能力: ${matched.join(", ")}`);
			}
		}

		if (score > 0.7) {
			reasons.push("高度匹配用户意图");
		} else if (score > 0.4) {
			reasons.push("适合完成此类任务");
		}

		if (capability.reliability > 0.8) {
			reasons.push("可靠性高");
		}

		if (capability.speed === "fast") {
			reasons.push("执行速度快");
		}

		return reasons.join("；") || "基于综合评估选择";
	}

	// 建议输入参数
	private suggestInput(
		tool: ToolType,
		goal: string,
	): Record<string, unknown> | undefined {
		switch (tool) {
			case "web_search":
			case "kb_search_chunks":
				return { query: this.extractSearchQuery(goal) };

			case "code_execute":
				return { language: "python", code: "" };

			case "doc_create":
				return { title: this.extractTitle(goal), content: "" };

			default:
				return undefined;
		}
	}

	// 提取搜索查询
	private extractSearchQuery(goal: string): string {
		// 移除常见的指令词
		let query = goal
			.replace(/^(请|帮我|帮忙|麻烦|能不能|可以).{0,10}/, "")
			.replace(/(一下|吗|呢|吧)$/, "")
			.trim();

		// 限制长度
		if (query.length > 50) {
			query = query.slice(0, 50);
		}

		return query || goal.slice(0, 30);
	}

	// 提取标题
	private extractTitle(goal: string): string {
		const titlePatterns = [
			/写一篇关于(.+?)的/,
			/创建(.+?)文档/,
			/生成(.+?)报告/,
			/《(.+?)》/,
		];

		for (const pattern of titlePatterns) {
			const match = goal.match(pattern);
			if (match) {
				return match[1].slice(0, 50);
			}
		}

		return goal.slice(0, 20);
	}

	// 应用选择策略
	private applyStrategy(
		matches: ToolMatch[],
		strategy: SelectionStrategy,
		context: ToolSelectionContext,
	): ToolMatch[] {
		switch (strategy) {
			case "greedy":
				// 选择最佳匹配
				return matches.slice(0, 1);

			case "conservative":
				// 优先低风险工具
				return matches
					.filter((m) => {
						const cap = TOOL_CAPABILITIES[m.tool];
						return cap && !cap.sideEffects;
					})
					.slice(0, 2);

			case "exploratory": {
				// 尝试新工具
				const unused = matches.filter(
					(m) => !context.previousTools.includes(m.tool),
				);
				return unused.length > 0 ? unused.slice(0, 2) : matches.slice(0, 1);
			}

			case "efficient":
				// 优先快速工具
				return matches
					.filter((m) => {
						const cap = TOOL_CAPABILITIES[m.tool];
						return cap && cap.speed !== "slow";
					})
					.slice(0, 2);

			case "comprehensive":
				// 多工具覆盖
				return matches.slice(0, 3);

			default:
				return matches.slice(0, 1);
		}
	}

	// 记录工具使用结果
	recordUsage(tool: ToolType, success: boolean): void {
		const current = this.usageHistory.get(tool) || {
			count: 0,
			successRate: 0.5,
		};
		const newCount = current.count + 1;
		const newSuccessRate =
			(current.successRate * current.count + (success ? 1 : 0)) / newCount;

		this.usageHistory.set(tool, {
			count: newCount,
			successRate: newSuccessRate,
		});

		// 同步到记忆系统
		enhancedMemory.recordToolUsage(tool);
	}

	// 获取工具推荐
	async getRecommendations(
		goal: string,
		limit: number = 3,
	): Promise<ToolMatch[]> {
		const context: ToolSelectionContext = {
			goal,
			previousTools: [],
			previousResults: [],
			availableContext: [],
		};

		const matches = await this.selectTools(context, "comprehensive");
		return matches.slice(0, limit);
	}

	// 快速选择（用于简单任务）
	quickSelect(goal: string): ToolType | null {
		// 快速关键词匹配
		for (const [keyword, info] of Object.entries(INTENT_KEYWORDS)) {
			if (goal.includes(keyword)) {
				return info.tools[0];
			}
		}

		// 默认使用 LLM
		return "llm_call";
	}

	// 获取工具能力描述
	getToolCapabilities(tool: ToolType): ToolCapability | undefined {
		return TOOL_CAPABILITIES[tool];
	}

	// 获取所有工具的摘要描述
	getAllToolsSummary(): string {
		return Object.entries(TOOL_CAPABILITIES)
			.map(([tool, cap]) => {
				return `**${tool}**\n  能力: ${cap.capabilities.join(", ")}\n  速度: ${cap.speed}, 可靠性: ${(cap.reliability * 100).toFixed(0)}%`;
			})
			.join("\n\n");
	}
}

// 单例导出
export const toolSelector = new IntelligentToolSelector();
