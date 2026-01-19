// 增强记忆系统 - 三层架构
// 工作记忆（Working Memory）- 当前任务上下文
// 短期记忆（Short-term Memory）- 会话级别记忆
// 长期记忆（Long-term Memory）- 跨会话持久化记忆

import * as api from "../api";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ToolCall as _ToolCall } from "../types";

// ==================== 类型定义 ====================

// 记忆类型
export type MemoryType =
	| "fact" // 事实：确认的信息
	| "preference" // 偏好：用户习惯
	| "skill" // 技能：学到的方法
	| "episode" // 情节：任务经历
	| "semantic" // 语义：概念和关系
	| "procedural"; // 程序：操作步骤

// 记忆重要性
export type MemoryImportance =
	| "critical"
	| "high"
	| "medium"
	| "low"
	| "trivial";

// 基础记忆条目
export interface MemoryEntry {
	id: string;
	type: MemoryType;
	content: string;
	summary?: string; // 简短摘要
	importance: MemoryImportance;
	confidence: number; // 置信度 0-1

	// 元数据
	source: string; // 来源
	context?: string; // 上下文
	tags: string[]; // 标签

	// 关联
	relatedMemories: string[]; // 关联的记忆ID
	entities: string[]; // 相关实体

	// 时间
	createdAt: number;
	lastAccessedAt: number;
	accessCount: number;

	// 衰减
	decayRate: number; // 衰减率
	strength: number; // 当前强度 0-1
}

// 工作记忆
export interface WorkingMemoryState {
	// 当前焦点
	currentGoal: string;
	currentContext: string[];

	// 活跃信息
	activeEntities: Map<string, EntityInfo>;
	activeFacts: MemoryEntry[];
	activeHypotheses: Hypothesis[];

	// 注意力
	attentionFocus: string[];
	recentObservations: Observation[];

	// 容量
	capacity: number;
	used: number;
}

// 实体信息
export interface EntityInfo {
	name: string;
	type: string;
	attributes: Record<string, string>;
	lastMentioned: number;
	importance: number;
}

// 假设
export interface Hypothesis {
	id: string;
	content: string;
	confidence: number;
	evidence: string[];
	counterEvidence: string[];
}

// 观察
export interface Observation {
	id: string;
	content: string;
	source: string;
	timestamp: number;
	processed: boolean;
}

// 短期记忆
export interface ShortTermMemoryState {
	sessionId: string;
	conversationHistory: ConversationTurn[];
	recentTasks: TaskSummary[];
	sessionEntities: Map<string, EntityInfo>;
	sessionFacts: MemoryEntry[];

	// 会话统计
	startedAt: number;
	lastActivityAt: number;
	turnCount: number;
}

// 对话轮次
export interface ConversationTurn {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	metadata?: {
		toolCalls?: string[];
		references?: string[];
	};
}

// 任务摘要
export interface TaskSummary {
	id: string;
	goal: string;
	result: string;
	success: boolean;
	toolsUsed: string[];
	duration: number;
	timestamp: number;
}

// 长期记忆
export interface LongTermMemoryState {
	// 用户画像
	userProfile: UserProfile;

	// 知识库
	factualKnowledge: MemoryEntry[];
	proceduralKnowledge: MemoryEntry[];
	episodicMemory: MemoryEntry[];

	// 学习
	learnedPatterns: Pattern[];
	skillLibrary: Skill[];

	// 统计
	totalMemories: number;
	lastConsolidation: number;
}

// 用户画像
export interface UserProfile {
	preferences: Record<string, string>;
	writingStyle?: string;
	commonTopics: string[];
	toolPreferences: Record<string, number>;
	interactionPatterns: string[];
}

// 模式
export interface Pattern {
	id: string;
	description: string;
	triggers: string[];
	actions: string[];
	successRate: number;
	occurrences: number;
}

// 技能
export interface Skill {
	id: string;
	name: string;
	description: string;
	steps: string[];
	context: string;
	proficiency: number;
}

// 记忆系统配置
export interface MemorySystemConfig {
	workingMemoryCapacity: number;
	shortTermRetentionMinutes: number;
	consolidationInterval: number;
	decayEnabled: boolean;
	importanceThreshold: number;
	enableSemanticSearch: boolean;
}

const DEFAULT_CONFIG: MemorySystemConfig = {
	workingMemoryCapacity: 10,
	shortTermRetentionMinutes: 60,
	consolidationInterval: 300000, // 5分钟
	decayEnabled: true,
	importanceThreshold: 0.3,
	enableSemanticSearch: true,
};

// ==================== 增强记忆系统类 ====================

export class EnhancedMemorySystem {
	private config: MemorySystemConfig;

	// 三层记忆
	private workingMemory: WorkingMemoryState;
	private shortTermMemory: ShortTermMemoryState;
	private longTermMemory: LongTermMemoryState;

	// 缓存
	private memoryCache: Map<string, MemoryEntry> = new Map();
	private consolidationTimer: ReturnType<typeof setInterval> | null = null;

	constructor(config: Partial<MemorySystemConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		// 初始化工作记忆
		this.workingMemory = {
			currentGoal: "",
			currentContext: [],
			activeEntities: new Map(),
			activeFacts: [],
			activeHypotheses: [],
			attentionFocus: [],
			recentObservations: [],
			capacity: this.config.workingMemoryCapacity,
			used: 0,
		};

		// 初始化短期记忆
		this.shortTermMemory = {
			sessionId: this.generateId(),
			conversationHistory: [],
			recentTasks: [],
			sessionEntities: new Map(),
			sessionFacts: [],
			startedAt: Date.now(),
			lastActivityAt: Date.now(),
			turnCount: 0,
		};

		// 初始化长期记忆
		this.longTermMemory = {
			userProfile: {
				preferences: {},
				commonTopics: [],
				toolPreferences: {},
				interactionPatterns: [],
			},
			factualKnowledge: [],
			proceduralKnowledge: [],
			episodicMemory: [],
			learnedPatterns: [],
			skillLibrary: [],
			totalMemories: 0,
			lastConsolidation: Date.now(),
		};

		// 启动记忆巩固
		this.startConsolidation();
	}

	// ==================== 工作记忆操作 ====================

	// 设置当前目标
	setCurrentGoal(goal: string): void {
		this.workingMemory.currentGoal = goal;
		this.workingMemory.attentionFocus = this.extractKeyTerms(goal);
		this.updateActivity();
	}

	// 添加上下文
	addContext(context: string): void {
		this.workingMemory.currentContext.push(context);
		if (
			this.workingMemory.currentContext.length >
			this.config.workingMemoryCapacity
		) {
			this.workingMemory.currentContext.shift();
		}
		this.updateActivity();
	}

	// 添加观察
	addObservation(content: string, source: string): void {
		const observation: Observation = {
			id: this.generateId(),
			content,
			source,
			timestamp: Date.now(),
			processed: false,
		};

		this.workingMemory.recentObservations.push(observation);
		if (this.workingMemory.recentObservations.length > 10) {
			this.workingMemory.recentObservations.shift();
		}

		// 异步处理观察结果
		this.processObservation(observation);
		this.updateActivity();
	}

	// 处理观察结果
	private async processObservation(observation: Observation): Promise<void> {
		// 提取实体
		const entities = this.extractEntities(observation.content);
		for (const entity of entities) {
			this.workingMemory.activeEntities.set(entity.name, entity);
		}

		// 检查是否可以形成事实
		if (observation.content.length > 50) {
			const fact = this.createMemoryEntry(
				"fact",
				observation.content.slice(0, 500),
				observation.source,
				"medium",
				0.7,
			);
			this.workingMemory.activeFacts.push(fact);
		}

		observation.processed = true;
	}

	// 添加假设
	addHypothesis(content: string, evidence: string[] = []): void {
		const hypothesis: Hypothesis = {
			id: this.generateId(),
			content,
			confidence: evidence.length > 0 ? 0.5 + evidence.length * 0.1 : 0.3,
			evidence,
			counterEvidence: [],
		};
		this.workingMemory.activeHypotheses.push(hypothesis);
	}

	// 更新假设置信度
	updateHypothesis(
		id: string,
		evidence?: string,
		isSupporting: boolean = true,
	): void {
		const hypothesis = this.workingMemory.activeHypotheses.find(
			(h) => h.id === id,
		);
		if (!hypothesis) return;

		if (evidence) {
			if (isSupporting) {
				hypothesis.evidence.push(evidence);
				hypothesis.confidence = Math.min(1, hypothesis.confidence + 0.1);
			} else {
				hypothesis.counterEvidence.push(evidence);
				hypothesis.confidence = Math.max(0, hypothesis.confidence - 0.15);
			}
		}
	}

	// 获取工作记忆状态
	getWorkingMemory(): WorkingMemoryState {
		return { ...this.workingMemory };
	}

	// 清空工作记忆
	clearWorkingMemory(): void {
		this.workingMemory = {
			currentGoal: "",
			currentContext: [],
			activeEntities: new Map(),
			activeFacts: [],
			activeHypotheses: [],
			attentionFocus: [],
			recentObservations: [],
			capacity: this.config.workingMemoryCapacity,
			used: 0,
		};
	}

	// ==================== 短期记忆操作 ====================

	// 添加对话轮次
	addConversationTurn(
		role: "user" | "assistant" | "system",
		content: string,
		metadata?: any,
	): void {
		const turn: ConversationTurn = {
			id: this.generateId(),
			role,
			content,
			timestamp: Date.now(),
			metadata,
		};

		this.shortTermMemory.conversationHistory.push(turn);
		this.shortTermMemory.turnCount++;
		this.updateActivity();

		// 限制历史长度
		if (this.shortTermMemory.conversationHistory.length > 50) {
			// 压缩旧对话
			this.compressOldConversations();
		}
	}

	// 添加任务摘要
	addTaskSummary(task: TaskSummary): void {
		this.shortTermMemory.recentTasks.push(task);
		if (this.shortTermMemory.recentTasks.length > 10) {
			this.shortTermMemory.recentTasks.shift();
		}
	}

	// 获取最近对话
	getRecentConversation(limit: number = 10): ConversationTurn[] {
		return this.shortTermMemory.conversationHistory.slice(-limit);
	}

	// 压缩旧对话
	private compressOldConversations(): void {
		const toCompress = this.shortTermMemory.conversationHistory.splice(0, 20);

		// 生成摘要并存入长期记忆
		const summary = toCompress
			.map((t) => `[${t.role}] ${t.content.slice(0, 100)}`)
			.join("\n");

		const episodeEntry = this.createMemoryEntry(
			"episode",
			`对话摘要 (${toCompress.length}轮):\n${summary.slice(0, 500)}`,
			"conversation",
			"low",
			0.5,
		);

		this.longTermMemory.episodicMemory.push(episodeEntry);
	}

	// ==================== 长期记忆操作 ====================

	// 存储长期记忆
	async storeLongTermMemory(
		type: MemoryType,
		content: string,
		importance: MemoryImportance = "medium",
		tags: string[] = [],
	): Promise<MemoryEntry> {
		const entry = this.createMemoryEntry(
			type,
			content,
			"user",
			importance,
			0.8,
		);
		entry.tags = tags;

		// 存入本地缓存
		this.memoryCache.set(entry.id, entry);

		// 持久化到数据库
		try {
			await api.createAgentMemory(entry.id, content, type as any);
		} catch (error) {
			console.warn("[MemorySystem] 持久化失败:", error);
		}

		// 添加到相应类别
		switch (type) {
			case "fact":
			case "semantic":
				this.longTermMemory.factualKnowledge.push(entry);
				break;
			case "procedural":
			case "skill":
				this.longTermMemory.proceduralKnowledge.push(entry);
				break;
			case "episode":
				this.longTermMemory.episodicMemory.push(entry);
				break;
		}

		this.longTermMemory.totalMemories++;
		return entry;
	}

	// 检索相关记忆
	async retrieveRelevantMemories(
		query: string,
		limit: number = 5,
	): Promise<MemoryEntry[]> {
		const results: MemoryEntry[] = [];

		// 1. 从工作记忆检索
		const workingResults = this.workingMemory.activeFacts
			.filter((f) => this.isRelevant(f.content, query))
			.slice(0, 2);
		results.push(...workingResults);

		// 2. 从短期记忆检索
		const shortTermResults = this.shortTermMemory.sessionFacts
			.filter((f) => this.isRelevant(f.content, query))
			.slice(0, 2);
		results.push(...shortTermResults);

		// 3. 从长期记忆检索
		try {
			const longTermResults = await api.searchAgentMemories(query, limit);
			for (const r of longTermResults) {
				const entry = this.createMemoryEntry(
					r.category as MemoryType,
					r.content,
					"long_term",
					"medium",
					r.relevance_score,
				);
				entry.id = r.id;
				entry.accessCount = r.access_count;
				results.push(entry);
			}
		} catch (error) {
			console.warn("[MemorySystem] 长期记忆检索失败:", error);
		}

		// 按相关性排序并去重
		const unique = this.deduplicateMemories(results);
		return unique.slice(0, limit);
	}

	// 更新用户偏好
	updateUserPreference(key: string, value: string): void {
		this.longTermMemory.userProfile.preferences[key] = value;
	}

	// 记录工具使用
	recordToolUsage(tool: string): void {
		const current = this.longTermMemory.userProfile.toolPreferences[tool] || 0;
		this.longTermMemory.userProfile.toolPreferences[tool] = current + 1;
	}

	// 学习模式
	learnPattern(
		description: string,
		triggers: string[],
		actions: string[],
	): void {
		const existingPattern = this.longTermMemory.learnedPatterns.find(
			(p) => p.description === description,
		);

		if (existingPattern) {
			existingPattern.occurrences++;
			existingPattern.successRate = existingPattern.successRate * 0.9 + 0.1;
		} else {
			this.longTermMemory.learnedPatterns.push({
				id: this.generateId(),
				description,
				triggers,
				actions,
				successRate: 0.5,
				occurrences: 1,
			});
		}
	}

	// ==================== 记忆巩固 ====================

	// 启动记忆巩固
	private startConsolidation(): void {
		if (this.consolidationTimer) return;

		this.consolidationTimer = setInterval(() => {
			this.consolidateMemories();
		}, this.config.consolidationInterval);
	}

	// 巩固记忆
	private async consolidateMemories(): Promise<void> {
		// 1. 从工作记忆转移重要信息到短期记忆
		const importantFacts = this.workingMemory.activeFacts.filter(
			(f) => f.importance === "high" || f.importance === "critical",
		);
		this.shortTermMemory.sessionFacts.push(...importantFacts);

		// 2. 从短期记忆提取并存入长期记忆
		const toConsolidate = this.shortTermMemory.sessionFacts.filter(
			(f) => f.accessCount > 2 || f.importance === "critical",
		);

		for (const entry of toConsolidate) {
			await this.storeLongTermMemory(
				entry.type,
				entry.content,
				entry.importance,
				entry.tags,
			);
		}

		// 3. 应用记忆衰减
		if (this.config.decayEnabled) {
			this.applyDecay();
		}

		// 4. 提取模式
		await this.extractPatterns();

		this.longTermMemory.lastConsolidation = Date.now();
	}

	// 应用记忆衰减
	private applyDecay(): void {
		const now = Date.now();

		// 短期记忆衰减
		this.shortTermMemory.sessionFacts =
			this.shortTermMemory.sessionFacts.filter((f) => {
				const age = (now - f.lastAccessedAt) / 1000 / 60; // 分钟
				if (age > this.config.shortTermRetentionMinutes) {
					// 衰减过期
					return false;
				}
				return true;
			});

		// 长期记忆强度衰减
		for (const entry of this.longTermMemory.factualKnowledge) {
			const daysSinceAccess =
				(now - entry.lastAccessedAt) / 1000 / 60 / 60 / 24;
			entry.strength = Math.max(
				0.1,
				entry.strength - entry.decayRate * daysSinceAccess,
			);
		}
	}

	// 提取模式
	private async extractPatterns(): Promise<void> {
		// 分析最近任务中的共同模式
		const recentTasks = this.shortTermMemory.recentTasks;
		if (recentTasks.length < 3) return;

		const successfulTasks = recentTasks.filter((t) => t.success);
		if (successfulTasks.length < 2) return;

		// 统计工具使用频率
		const toolFrequency: Record<string, number> = {};
		for (const task of successfulTasks) {
			for (const tool of task.toolsUsed) {
				toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
			}
		}

		// 识别常用工具组合
		for (const [tool, count] of Object.entries(toolFrequency)) {
			if (count >= 2) {
				this.recordToolUsage(tool);
			}
		}
	}

	// ==================== 辅助方法 ====================

	// 创建记忆条目
	private createMemoryEntry(
		type: MemoryType,
		content: string,
		source: string,
		importance: MemoryImportance,
		confidence: number,
	): MemoryEntry {
		return {
			id: this.generateId(),
			type,
			content,
			importance,
			confidence,
			source,
			tags: [],
			relatedMemories: [],
			entities: [],
			createdAt: Date.now(),
			lastAccessedAt: Date.now(),
			accessCount: 0,
			decayRate: this.getDecayRate(importance),
			strength: 1.0,
		};
	}

	// 获取衰减率
	private getDecayRate(importance: MemoryImportance): number {
		const rates: Record<MemoryImportance, number> = {
			critical: 0.01,
			high: 0.02,
			medium: 0.05,
			low: 0.1,
			trivial: 0.2,
		};
		return rates[importance];
	}

	// 提取关键词
	private extractKeyTerms(text: string): string[] {
		// 简单实现：分词并过滤
		return text
			.replace(/[^\w\u4e00-\u9fa5]/g, " ")
			.split(/\s+/)
			.filter((t) => t.length > 1)
			.slice(0, 10);
	}

	// 提取实体
	private extractEntities(text: string): EntityInfo[] {
		// 简化实现：识别引号内容和特殊格式
		const entities: EntityInfo[] = [];

		// 匹配引号内容
		const quoted = text.match(/"([^"]+)"|'([^']+)'|「([^」]+)」|《([^》]+)》/g);
		if (quoted) {
			for (const match of quoted) {
				const name = match.slice(1, -1);
				entities.push({
					name,
					type: "other",
					attributes: {},
					lastMentioned: Date.now(),
					importance: 0.5,
				});
			}
		}

		return entities;
	}

	// 判断相关性
	private isRelevant(content: string, query: string): boolean {
		const queryTerms = this.extractKeyTerms(query);
		const contentLower = content.toLowerCase();

		let matchCount = 0;
		for (const term of queryTerms) {
			if (contentLower.includes(term.toLowerCase())) {
				matchCount++;
			}
		}

		return matchCount >= Math.ceil(queryTerms.length * 0.3);
	}

	// 去重
	private deduplicateMemories(memories: MemoryEntry[]): MemoryEntry[] {
		const seen = new Set<string>();
		return memories.filter((m) => {
			const key = m.content.slice(0, 100);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	// 更新活动时间
	private updateActivity(): void {
		this.shortTermMemory.lastActivityAt = Date.now();
	}

	// 生成ID
	private generateId(): string {
		return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
	}

	// 格式化记忆为上下文
	formatMemoriesAsContext(memories: MemoryEntry[]): string {
		if (memories.length === 0) return "";

		const lines = memories.map((m) => {
			const typeLabel =
				{
					fact: "事实",
					preference: "偏好",
					skill: "技能",
					episode: "经历",
					semantic: "知识",
					procedural: "方法",
				}[m.type] || "记忆";

			return `[${typeLabel}] ${m.content.slice(0, 200)}`;
		});

		return `## 相关记忆\n${lines.join("\n")}\n`;
	}

	// 获取用户画像摘要
	getUserProfileSummary(): string {
		const profile = this.longTermMemory.userProfile;
		const parts: string[] = [];

		if (profile.writingStyle) {
			parts.push(`写作风格: ${profile.writingStyle}`);
		}

		if (profile.commonTopics.length > 0) {
			parts.push(`常见话题: ${profile.commonTopics.slice(0, 5).join(", ")}`);
		}

		const topTools = Object.entries(profile.toolPreferences)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 3)
			.map(([tool]) => tool);

		if (topTools.length > 0) {
			parts.push(`常用工具: ${topTools.join(", ")}`);
		}

		return parts.length > 0 ? parts.join("\n") : "暂无用户画像信息";
	}

	// 停止
	stop(): void {
		if (this.consolidationTimer) {
			clearInterval(this.consolidationTimer);
			this.consolidationTimer = null;
		}
	}
}

// 单例导出
export const enhancedMemory = new EnhancedMemorySystem();
