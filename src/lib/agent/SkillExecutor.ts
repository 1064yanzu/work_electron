/**
 * Skill 执行器
 * 封装 Skill 的完整执行流程：读取 SKILL.md → 解析场景 → 读取风格文档 → 创建内容
 */

import { invokeLlmWithCallback } from "../chat/api";
import type { SkillMetadata } from "../config";
import { getPrompt } from "../prompts";
import { settingsStore } from "../settingsStore";
import { skillsStore } from "../skillsStore";
import { invoke } from "../tauriCompat";
import { agentStore } from "./store";
import { createToolCall } from "./types";

// Skill 执行状态
export type SkillExecutionStatus =
	| "matching" // 匹配技能中
	| "loading" // 加载 SKILL.md
	| "parsing" // 解析场景规则
	| "loading_style" // 加载风格文档
	| "generating" // 生成内容
	| "completed" // 完成
	| "error"; // 错误

// Skill 执行步骤
export interface SkillExecutionStep {
	id: string;
	label: string;
	status: "pending" | "running" | "completed" | "error";
	detail?: string;
}

// Skill 执行状态
export interface SkillExecution {
	skillName: string;
	skillPath: string;
	status: SkillExecutionStatus;
	error?: string;
	steps: SkillExecutionStep[];
	loadedFiles: Array<{ path: string; size: number }>;
	detectedScene?: string; // 检测到的场景（如 "academic-paper"）
	styleDocPath?: string; // 风格文档路径
	styleDocContent?: string; // 风格文档内容
	skillContent?: string; // SKILL.md 内容
}

// 场景识别规则
interface SceneRule {
	keywords: string[];
	scene: string;
	styleDoc: string;
}

// 默认场景规则（从 SKILL.md 解析或使用默认）
const DEFAULT_SCENE_RULES: SceneRule[] = [
	{
		keywords: ["论文", "学术", "研究", "文献"],
		scene: "学术论文",
		styleDoc: "academic-paper.md",
	},
	{
		keywords: ["公众号", "微信", "推文"],
		scene: "公众号文章",
		styleDoc: "wechat-article.md",
	},
	{
		keywords: ["知乎", "回答", "经验分享"],
		scene: "知乎回答",
		styleDoc: "zhihu-answer.md",
	},
	{
		keywords: ["散文", "随笔", "抒情", "感悟"],
		scene: "散文/随笔",
		styleDoc: "prose-essay.md",
	},
	{
		keywords: ["小红书", "种草", "笔记"],
		scene: "小红书笔记",
		styleDoc: "xiaohongshu.md",
	},
	{
		keywords: ["新闻", "报道", "资讯", "消息"],
		scene: "新闻报道",
		styleDoc: "news-report.md",
	},
	{
		keywords: ["技术", "开发", "教程", "API"],
		scene: "技术文档",
		styleDoc: "technical-doc.md",
	},
	{
		keywords: ["报告", "汇报", "方案", "分析"],
		scene: "商业报告",
		styleDoc: "business-report.md",
	},
	{
		keywords: ["文案", "广告", "营销", "卖点"],
		scene: "营销文案",
		styleDoc: "copywriting.md",
	},
	{
		keywords: ["邮件", "公文", "通知", "请示"],
		scene: "邮件公文",
		styleDoc: "email-document.md",
	},
];

/**
 * 检查查询是否匹配某个 Skill
 */
export async function matchSkill(query: string): Promise<SkillMetadata | null> {
	await skillsStore.init();
	let enabledSkills = skillsStore.getEnabledSkills();

	// 如果未加载到技能，尝试刷新
	if (enabledSkills.length === 0) {
		console.log("[SkillExecutor] No skills found, attempting refresh...");
		await skillsStore.refresh();
		enabledSkills = skillsStore.getEnabledSkills();
	}

	console.log("[SkillExecutor] matchSkill called. Query:", query);
	console.log(
		"[SkillExecutor] Enabled skills:",
		enabledSkills.map((s) => `${s.name} (${s.description})`),
	);

	const q = query.trim();
	const qLower = q.toLowerCase();

	const matchesTrigger = (trigger: string): boolean => {
		const t = trigger.trim();
		if (!t) return false;

		// Avoid ultra-short triggers to reduce false positives.
		const hasCjk = /[\u4e00-\u9fff]/.test(t);
		const minLen = hasCjk ? 2 : 4;
		if (t.length < minLen) return false;

		if (hasCjk) return q.includes(t);
		return qLower.includes(t.toLowerCase());
	};

	const extractDescriptionTriggers = (desc: string): string[] => {
		const triggers: string[] = [];
		const matches = [...desc.matchAll(/[（(]([^）)]+)[）)]/g)];
		for (const m of matches) {
			const inside = (m[1] || "").trim();
			if (!inside) continue;
			const parts = inside
				.split(/[/|,，;；、]/g)
				.map((s) => s.trim())
				.filter(Boolean);
			triggers.push(...parts);
		}
		return triggers;
	};

	for (const skill of enabledSkills) {
		// 1) 显式点名（支持 `$skill-name` 或直接包含名称）
		if (matchesTrigger(`$${skill.name}`) || matchesTrigger(skill.name)) {
			console.log("[SkillExecutor] Matched explicit skill name:", skill.name);
			return skill;
		}

		// 2) 从 description 括号中提取触发词（如 “(文献综述/文献回顾)”）
		const descTriggers = extractDescriptionTriggers(skill.description);
		if (descTriggers.some(matchesTrigger)) {
			console.log("[SkillExecutor] Matched description trigger:", skill.name);
			return skill;
		}

		// 3) 从 skill name 分词（英文/数字）做弱匹配
		const nameParts = skill.name.split(/[-_]/g).filter(Boolean);
		if (nameParts.some(matchesTrigger)) {
			console.log("[SkillExecutor] Matched skill name part:", skill.name);
			return skill;
		}

		// 检查技能描述中的触发场景
		const desc = skill.description.toLowerCase();
		const q2 = qLower;

		// 写作相关技能匹配
		if (
			skill.name.includes("writing") ||
			skill.name.includes("writer") ||
			desc.includes("写作")
		) {
			if (
				q2.includes("写") ||
				q2.includes("论文") ||
				q2.includes("文章") ||
				q2.includes("报告") ||
				q2.includes("创作") ||
				q2.includes("生成")
			) {
				console.log("[SkillExecutor] Matched writing skill:", skill.name);
				return skill;
			}
		}

		// Notebooklm and similar services: check for various name formats
		const normalizedQuery = q.replace(/\s+/g, "").toLowerCase();
		const normalizedSkillName = skill.name.replace(/[-_]/g, "").toLowerCase();
		if (normalizedQuery.includes(normalizedSkillName)) {
			console.log("[SkillExecutor] Matched normalized skill name:", skill.name);
			return skill;
		}

		// Extract intent keywords from description after "intent like" or similar markers
		const intentMatch = skill.description.match(
			/intent\s+like\s+["']([^"']+)["']|intent[:\s]+([^.。]+)/i,
		);
		if (intentMatch) {
			const intentText = (intentMatch[1] || intentMatch[2] || "").toLowerCase();
			// Extract key action words from intent
			const intentWords = intentText.split(/\s+/).filter((w) => w.length > 3);
			for (const word of intentWords) {
				if (qLower.includes(word)) {
					console.log(
						"[SkillExecutor] Matched intent keyword:",
						skill.name,
						word,
					);
					return skill;
				}
			}
		}

		// Check if description contains relevant keywords that match query
		// Split description into meaningful phrases
		const descPhrases = skill.description
			.toLowerCase()
			.split(/[,;.-]/)
			.map((p) => p.trim())
			.filter((p) => p.length > 5);

		for (const phrase of descPhrases) {
			// If the phrase shares 2+ significant words with query, it's a match
			const phraseWords = phrase.split(/\s+/).filter((w) => w.length >= 3);
			const queryWords = qLower.split(/\s+/).filter((w) => w.length >= 3);
			const commonWords = phraseWords.filter((w) => queryWords.includes(w));

			if (commonWords.length >= 2) {
				console.log(
					"[SkillExecutor] Matched description phrase:",
					skill.name,
					phrase,
				);
				return skill;
			}
		}

		// 通用匹配：检查描述中的关键词
		const keywords = desc.match(/\((\d+)\)\s*([^(]+)/g);
		if (keywords) {
			for (const kw of keywords) {
				const trigger = kw.replace(/\(\d+\)\s*/, "").trim();
				if (q2.includes(trigger.slice(0, 6))) {
					console.log(
						"[SkillExecutor] Matched keyword skill:",
						skill.name,
						trigger,
					);
					return skill;
				}
			}
		}
	}

	console.log("[SkillExecutor] No skill matched.");

	return null;
}

/**
 * Skill 执行器类
 */
export class SkillExecutor {
	private execution: SkillExecution | null = null;
	private currentToolCallId: string | null = null;
	private abortController: AbortController | null = null;

	/**
	 * 执行 Skill 完整流程
	 */
	async execute(
		skill: SkillMetadata,
		query: string,
		options?: {
			attachedContexts?: Array<{ title: string; content: string }>;
			attachedFiles?: Array<{ title: string; path: string }>;
			onProgress?: (execution: SkillExecution) => void;
			onChunk?: (chunk: string) => void; // 流式输出回调
		},
	): Promise<string> {
		console.log("[SkillExecutor] Starting execution for skill:", {
			name: skill.name,
			description: skill.description,
			location: skill.location,
			enabled: skill.enabled,
		});
		console.log("[SkillExecutor] Options received:", {
			attachedContextsCount: options?.attachedContexts?.length || 0,
			attachedFilesCount: options?.attachedFiles?.length || 0,
			attachedFiles: options?.attachedFiles?.map((f) => ({
				title: f.title,
				path: f.path,
			})),
		});
		this.abortController = new AbortController();

		// 初始化执行状态
		this.execution = {
			skillName: skill.name,
			skillPath: skill.location,
			status: "loading",
			steps: [
				{ id: "load-skill", label: "加载技能指南", status: "pending" },
				{ id: "detect-scene", label: "识别写作场景", status: "pending" },
				{ id: "load-style", label: "加载风格文档", status: "pending" },
				{ id: "generate", label: "生成内容", status: "pending" },
			],
			loadedFiles: [],
		};

		// 通知 store
		agentStore.setSkillExecution(this.execution);
		options?.onProgress?.(this.execution);

		// 创建 ToolCall
		const toolCall = createToolCall(
			"skill_call",
			skill.name,
			{
				query,
				skill: skill.name,
				location: skill.location,
			},
			skill.description,
		);
		toolCall.status = "running";
		toolCall.startedAt = Date.now();
		toolCall.metadata = {
			skillExecution: this.execution,
		};
		this.currentToolCallId = toolCall.id;
		agentStore.addToolCall(toolCall);

		try {
			// Step 1: 加载 SKILL.md
			console.log(
				"[SkillExecutor] Step 1: Loading SKILL.md from:",
				`${skill.location}/SKILL.md`,
			);
			await this.updateStep("load-skill", "running");
			const skillContent = await this.readFile(`${skill.location}/SKILL.md`);
			this.execution.skillContent = skillContent;
			this.execution.loadedFiles.push({
				path: `${skill.location}/SKILL.md`,
				size: skillContent.length,
			});
			await this.updateStep(
				"load-skill",
				"completed",
				`已读取 ${skillContent.length} 字节`,
			);

			// Step 2: 识别场景
			console.log("[SkillExecutor] Step 2: Detecting scene for query");
			await this.updateStep("detect-scene", "running");
			const { scene, styleDoc } = this.detectScene(query, skillContent);
			this.execution.detectedScene = scene;
			this.execution.styleDocPath = `${skill.location}/references/${styleDoc}`;
			await this.updateStep("detect-scene", "completed", `场景: ${scene}`);

			// Step 3: 加载风格文档
			console.log(
				"[SkillExecutor] Step 3: Loading style doc from:",
				this.execution.styleDocPath,
			);
			await this.updateStep("load-style", "running");
			const styleContent = await this.readFile(this.execution.styleDocPath);
			this.execution.styleDocContent = styleContent;
			this.execution.loadedFiles.push({
				path: this.execution.styleDocPath,
				size: styleContent.length,
			});
			await this.updateStep("load-style", "completed", `已加载 ${styleDoc}`);

			// Step 4: 生成内容
			console.log("[SkillExecutor] Step 4: Generating content");
			await this.updateStep("generate", "running");

			// 合并 attachedContexts 和 attachedFiles
			const allContexts = [...(options?.attachedContexts || [])];

			// 读取临时文件内容
			if (options?.attachedFiles?.length) {
				for (const file of options.attachedFiles) {
					try {
						const content = await this.readFile(file.path);
						allContexts.push({ title: file.title, content });
						console.log(
							`[SkillExecutor] Loaded attached file: ${file.title} (${content.length} bytes)`,
						);
					} catch (e) {
						console.warn(
							`[SkillExecutor] Failed to read attached file: ${file.path}`,
							e,
						);
					}
				}
			}

			const result = await this.generateContent(
				query,
				skillContent,
				styleContent,
				allContexts.length > 0 ? allContexts : undefined,
				options?.onChunk,
			);
			await this.updateStep("generate", "completed");

			// 完成
			console.log("[SkillExecutor] Execution completed successfully");
			this.execution.status = "completed";
			agentStore.setSkillExecution(this.execution);
			options?.onProgress?.(this.execution);

			if (this.currentToolCallId) {
				agentStore.updateToolCall(this.currentToolCallId, {
					status: "completed",
					output: result,
					metadata: {
						skillExecution: this.execution,
					},
					completedAt: Date.now(),
					duration: Date.now() - (toolCall.startedAt || 0),
				});
				this.currentToolCallId = null;
			}

			return result;
		} catch (error) {
			console.error("[SkillExecutor] Execution failed:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.execution.status = "error";
			this.execution.error = errorMsg;
			agentStore.setSkillExecution(this.execution);
			options?.onProgress?.(this.execution);

			if (this.currentToolCallId) {
				agentStore.updateToolCall(this.currentToolCallId, {
					status: "error",
					error: errorMsg,
					metadata: {
						skillExecution: this.execution,
					},
					completedAt: Date.now(),
				});
				this.currentToolCallId = null;
			}

			throw new Error(`Skill 执行失败: ${errorMsg}`);
		}
	}

	/**
	 * 取消执行
	 */
	cancel() {
		this.abortController?.abort();
		if (this.execution) {
			this.execution.status = "error";
			this.execution.error = "用户取消";
			agentStore.setSkillExecution(null);

			if (this.currentToolCallId) {
				agentStore.updateToolCall(this.currentToolCallId, {
					status: "cancelled",
					error: "用户取消",
					metadata: {
						skillExecution: this.execution,
					},
					completedAt: Date.now(),
				});
				this.currentToolCallId = null;
			}
		}
	}

	/**
	 * 读取文件
	 */
	private async readFile(path: string): Promise<string> {
		console.log("[SkillExecutor] readFile:", path);
		const result = await invoke<{ content: string }>("read_file_safe", {
			payload: { path },
		});
		return result.content;
	}

	/**
	 * 更新步骤状态
	 */
	private async updateStep(
		stepId: string,
		status: SkillExecutionStep["status"],
		detail?: string,
	) {
		if (!this.execution) return;

		this.execution.steps = this.execution.steps.map((step) =>
			step.id === stepId ? { ...step, status, detail } : step,
		);

		agentStore.setSkillExecution({ ...this.execution });

		// 同步更新 ToolCall
		if (this.currentToolCallId) {
			agentStore.updateToolCall(this.currentToolCallId, {
				metadata: {
					skillExecution: { ...this.execution },
				},
			});
		}
	}

	/**
	 * 检测写作场景
	 */
	private detectScene(
		query: string,
		_skillContent: string,
	): { scene: string; styleDoc: string } {
		const q = query.toLowerCase();

		// 遍历场景规则
		for (const rule of DEFAULT_SCENE_RULES) {
			if (rule.keywords.some((kw) => q.includes(kw))) {
				return { scene: rule.scene, styleDoc: rule.styleDoc };
			}
		}

		// 默认使用学术论文（如果提到"论文"）或公众号文章
		if (q.includes("论文")) {
			return { scene: "学术论文", styleDoc: "academic-paper.md" };
		}

		return { scene: "公众号文章", styleDoc: "wechat-article.md" };
	}

	/**
	 * 生成内容
	 */
	private async generateContent(
		query: string,
		skillContent: string,
		styleContent: string,
		attachedContexts?: Array<{ title: string; content: string }>,
		onChunk?: (chunk: string) => void,
	): Promise<string> {
		// 优先使用 Skill 专用模型，回退到全局 activeModel
		let modelToUse: string | null = null;
		try {
			const { getConfig } = await import("../config");
			const skillModel = await getConfig("skill_llm_model");
			if (typeof skillModel === "string" && skillModel.trim()) {
				modelToUse = skillModel.trim();
			}
		} catch {
			// 配置读取失败，忽略
		}
		if (!modelToUse) {
			modelToUse = settingsStore.getActiveModel();
		}
		if (!modelToUse) {
			throw new Error("请先配置并选择一个模型");
		}
		const activeModel = modelToUse;

		// 构建用户资料
		const attachedText = attachedContexts?.length
			? attachedContexts
					.map((ctx) => `### ${ctx.title}\n${ctx.content}`)
					.join("\n\n")
			: "";

		const systemPrompt =
			(await getPrompt("skillGenerate")) ||
			`你是一个专业的写作助手。请根据提供的技能指南和风格文档，生成高质量的内容。

## 技能指南（摘要）
${skillContent.slice(0, 2000)}

## 风格要求
${styleContent.slice(0, 3000)}

## 输出要求
1. 严格按照风格文档的要求撰写
2. 结构完整，逻辑清晰
3. 语言流畅，符合场景特点
4. 使用 :::create-doc 协议包裹输出`;

		const userPrompt = `## 用户请求
${query}

${attachedText ? `## 用户提供的资料\n${attachedText}` : ""}

请根据上述要求和资料，生成内容。`;

		let result = "";

		await new Promise<void>((resolve, reject) => {
			invokeLlmWithCallback({
				model: activeModel,
				prompt: userPrompt,
				systemPrompt,
				context: [],
				onChunk: (chunk: string) => {
					result += chunk;
					onChunk?.(chunk); // 实时调用回调
				},
				onComplete: () => resolve(),
				onError: (err: string) => reject(new Error(err)),
			});
		});

		return result;
	}
}

// 导出单例
export const skillExecutor = new SkillExecutor();
