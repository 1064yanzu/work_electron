import {
	AlertCircle,
	Bot,
	Brain,
	CheckCircle,
	ChevronDown,
	ChevronUp,
	FileText,
	Image,
	MessageSquare,
	PenTool,
	RefreshCw,
	RotateCcw,
	Save,
	Search,
	Sparkles,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

// 默认提示词配置
export const DEFAULT_PROMPTS: Record<string, string> = {
	// ============ 基础提示词 ============

	// 会话标题生成提示词
	titleGeneration: `请为以下用户提问生成一个非常简短的对话标题（不超过10个字），直接返回标题内容，不要有任何引号或额外文字：

{message}`,

	// AI 写作助手系统提示词
	chatSystem: `你是一个专业的 AI 写作助手。

当前用户正在编辑文档，文档内容如下：
\`\`\`
{document}
\`\`\`

如果你决定修改或续写当前文档，请遵循以下步骤：
1. (可选) 简要说明你的修改意图或计划。
2. 使用以下协议包裹新的文档内容：
:::update-doc
这里是新的完整文档内容
:::
3. (可选) 在修改完成后，可以补充说明变更的细节或询问用户意见。

如果你认为需要创建新文档：
:::create-doc
标题: 新文档标题
摘要: 简短摘要
内容:
这里是新文档的完整内容
:::

如果是普通聊天，直接回答即可。`,

	// 深度研究系统提示词
	researchSystem: `你是一个专业的研究助手。用户请求你对某个主题进行深度研究。
以下是通过网络搜索获取的相关资料：

{sources}

请基于以上资料，为用户提供全面、深入的研究报告。报告应该：
1. 概述主题的核心要点
2. 分析不同来源的观点和信息
3. 总结关键发现和结论
4. 如有必要，指出信息的局限性或需要进一步研究的方向

请用清晰、专业的语言撰写报告。`,

	// 图像信息提取
	imageExtraction: `你是一个专业的信息抽取助手。用户将提供一张图片（可能是截图、图文混排、表格、海报、证件或数据面板）。

请你完成以下任务：
1. 识别图片中的可读文字与关键信息，并尽可能完整转写。
2. 若存在结构化内容（表格、列表、字段/值），请保持结构输出。
3. 结合图片内容提炼要点，输出可用于资料库的摘要与标签建议。

请按以下结构输出（使用 Markdown）：

## 摘要

## 关键信息
- 

## 原文转写

## 建议标签
- 

如果图片无法识别，请说明原因（例如分辨率过低、遮挡、语言不支持等），并给出可操作的改进建议。`,

	// ============ Agent 相关提示词 ============

	// 任务意图识别
	intentRecognition: `你是一个任务意图识别助手，快速准确地判断用户请求的类型和需要的工具。只返回 JSON，不要有其他文字。`,

	// Agent 格式规范
	agentFormat: `你是一个严格遵循格式的 Agent，只输出 JSON，不要输出其他文字。`,

	// 最终综合回答
	finalSynthesis: `请综合所有信息，给出清晰、有条理的回答。`,

	// 任务重规划
	taskReplan: `你是一个专业的任务规划助手，擅长根据执行结果调整计划。`,

	// Agent 循环系统提示词
	agentSystem: `你是一个智能助手，可以使用工具来帮助用户完成任务。

## 可用工具
{tools}

## 响应格式
1. 如果需要思考，使用 <thinking>...</thinking> 标签
2. 如果需要调用工具，使用 <tool_call>{"tool": "工具名", "input": {...}, "reason": "原因"}</tool_call>
3. 如果有最终答案，使用 <answer>...</answer> 标签
4. 可以在一次响应中调用多个工具

## 工作原则
- **理解任务本质**：仔细分析用户请求，选择最合适的工具和策略
- **优先本地资源**：优先使用本地资料库，避免不必要的网络请求
- **基于事实**：所有回答必须基于工具调用的实际结果，不要编造信息
- **高效执行**：选择最直接、最高效的方式完成任务

{context}`,

	// 错误分析
	errorAnalysis: `你是一个专业的错误分析助手，擅长分析工具调用失败的原因并提供修正建议。`,

	// Skill 内容生成
	skillGenerate: `你是一个专业的写作助手，请根据提供的风格指南和上下文生成内容。`,

	// ============ 推理相关提示词 ============

	// 任务规划
	taskPlanning: `你是一个任务规划专家，擅长将复杂任务分解为可执行的子任务。只输出JSON。`,

	// 信息综合
	informationSynthesis: `你是一个专业的信息综合助手，基于收集的信息生成高质量的回答。`,

	// 内容改进
	contentImprovement: `你是一个专业的内容改进助手，根据反馈改进回答质量。`,

	// 链式思考
	chainOfThought: `你是一个智能推理引擎，正在进行链式思考。请详细展示你的思考过程。`,

	// 决策引擎
	decisionEngine: `你是一个智能决策引擎，根据思考结果选择最佳行动。只输出JSON。`,

	// 自我反思
	selfReflection: `你是一个自我反思模块，客观评估执行进度并提供改进建议。`,

	// 质量评估
	qualityAssessment: `你是一个质量评估专家，客观评估输出内容的质量。只输出JSON。`,
};

// 提示词配置项
interface PromptConfig {
	id: string;
	label: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	configKey: string;
	defaultValue: string;
	placeholder?: string;
	category: "basic" | "agent" | "reasoning";
}

const PROMPT_CONFIGS: PromptConfig[] = [
	// ============ 基础提示词 ============
	{
		id: "titleGeneration",
		label: "会话标题生成",
		description: "用于自动根据对话内容生成简短标题。可用变量：{message}",
		icon: FileText,
		configKey: "prompt_title_generation",
		defaultValue: DEFAULT_PROMPTS.titleGeneration,
		placeholder: "输入标题生成提示词...",
		category: "basic",
	},
	{
		id: "chatSystem",
		label: "AI 对话系统提示词",
		description: "定义 AI 助手的行为和能力。可用变量：{document}",
		icon: MessageSquare,
		configKey: "prompt_chat_system",
		defaultValue: DEFAULT_PROMPTS.chatSystem,
		placeholder: "输入系统提示词...",
		category: "basic",
	},
	{
		id: "researchSystem",
		label: "深度研究系统提示词",
		description: "用于深度研究任务的系统提示词。可用变量：{sources}",
		icon: Search,
		configKey: "prompt_research_system",
		defaultValue: DEFAULT_PROMPTS.researchSystem,
		placeholder: "输入研究提示词...",
		category: "basic",
	},
	{
		id: "imageExtraction",
		label: "图像信息提取",
		description: "用于图片导入后的信息提取与结构化整理。",
		icon: Image,
		configKey: "prompt_image_extraction",
		defaultValue: DEFAULT_PROMPTS.imageExtraction,
		placeholder: "输入图像信息提取提示词...",
		category: "basic",
	},

	// ============ Agent 相关提示词 ============
	{
		id: "intentRecognition",
		label: "任务意图识别",
		description: "Agent 判断用户请求类型和所需工具时使用。",
		icon: Zap,
		configKey: "prompt_intent_recognition",
		defaultValue: DEFAULT_PROMPTS.intentRecognition,
		placeholder: "输入意图识别提示词...",
		category: "agent",
	},
	{
		id: "agentSystem",
		label: "Agent 系统提示词",
		description: "Agent 核心循环的系统提示词。可用变量：{tools}、{context}",
		icon: Bot,
		configKey: "prompt_agent_system",
		defaultValue: DEFAULT_PROMPTS.agentSystem,
		placeholder: "输入 Agent 系统提示词...",
		category: "agent",
	},
	{
		id: "agentFormat",
		label: "Agent 格式规范",
		description: "Agent 输出格式控制，确保返回结构化 JSON。",
		icon: Bot,
		configKey: "prompt_agent_format",
		defaultValue: DEFAULT_PROMPTS.agentFormat,
		placeholder: "输入格式规范提示词...",
		category: "agent",
	},
	{
		id: "finalSynthesis",
		label: "最终综合回答",
		description: "Agent 综合所有工具调用结果生成最终回答时使用。",
		icon: CheckCircle,
		configKey: "prompt_final_synthesis",
		defaultValue: DEFAULT_PROMPTS.finalSynthesis,
		placeholder: "输入综合回答提示词...",
		category: "agent",
	},
	{
		id: "taskReplan",
		label: "任务重规划",
		description: "Agent 根据执行结果动态调整计划时使用。",
		icon: RefreshCw,
		configKey: "prompt_task_replan",
		defaultValue: DEFAULT_PROMPTS.taskReplan,
		placeholder: "输入重规划提示词...",
		category: "agent",
	},
	{
		id: "errorAnalysis",
		label: "错误分析",
		description: "分析工具调用失败原因并提供修正建议。",
		icon: AlertCircle,
		configKey: "prompt_error_analysis",
		defaultValue: DEFAULT_PROMPTS.errorAnalysis,
		placeholder: "输入错误分析提示词...",
		category: "agent",
	},
	{
		id: "skillGenerate",
		label: "Skill 内容生成",
		description:
			"Skill 执行时用于生成内容的系统提示词。可用变量：{style}、{context}",
		icon: PenTool,
		configKey: "prompt_skill_generate",
		defaultValue: DEFAULT_PROMPTS.skillGenerate,
		placeholder: "输入 Skill 内容生成提示词...",
		category: "agent",
	},

	// ============ 推理相关提示词 ============
	{
		id: "taskPlanning",
		label: "任务规划",
		description: "将复杂任务分解为可执行的子任务。",
		icon: Brain,
		configKey: "prompt_task_planning",
		defaultValue: DEFAULT_PROMPTS.taskPlanning,
		placeholder: "输入任务规划提示词...",
		category: "reasoning",
	},
	{
		id: "informationSynthesis",
		label: "信息综合",
		description: "基于收集的信息生成高质量的回答。",
		icon: Brain,
		configKey: "prompt_information_synthesis",
		defaultValue: DEFAULT_PROMPTS.informationSynthesis,
		placeholder: "输入信息综合提示词...",
		category: "reasoning",
	},
	{
		id: "contentImprovement",
		label: "内容改进",
		description: "根据反馈改进回答质量。",
		icon: Brain,
		configKey: "prompt_content_improvement",
		defaultValue: DEFAULT_PROMPTS.contentImprovement,
		placeholder: "输入内容改进提示词...",
		category: "reasoning",
	},
	{
		id: "chainOfThought",
		label: "链式思考",
		description: "智能推理引擎的思考过程提示词。",
		icon: Brain,
		configKey: "prompt_chain_of_thought",
		defaultValue: DEFAULT_PROMPTS.chainOfThought,
		placeholder: "输入链式思考提示词...",
		category: "reasoning",
	},
	{
		id: "decisionEngine",
		label: "决策引擎",
		description: "根据思考结果选择最佳行动。",
		icon: Brain,
		configKey: "prompt_decision_engine",
		defaultValue: DEFAULT_PROMPTS.decisionEngine,
		placeholder: "输入决策引擎提示词...",
		category: "reasoning",
	},
	{
		id: "selfReflection",
		label: "自我反思",
		description: "客观评估执行进度并提供改进建议。",
		icon: Brain,
		configKey: "prompt_self_reflection",
		defaultValue: DEFAULT_PROMPTS.selfReflection,
		placeholder: "输入自我反思提示词...",
		category: "reasoning",
	},
	{
		id: "qualityAssessment",
		label: "质量评估",
		description: "客观评估输出内容的质量。",
		icon: Brain,
		configKey: "prompt_quality_assessment",
		defaultValue: DEFAULT_PROMPTS.qualityAssessment,
		placeholder: "输入质量评估提示词...",
		category: "reasoning",
	},
];

// 分类标签（预留，未来可用于分类显示）
// const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
//   basic: { label: '基础', description: '核心对话和内容生成' },
//   agent: { label: 'Agent', description: '智能任务执行和工具调用' },
//   reasoning: { label: '推理', description: '思考、规划和反思' },
// };

export function PromptSettings() {
	const [prompts, setPrompts] = useState<Record<string, string>>({});
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);

	// 加载提示词配置
	useEffect(() => {
		loadPrompts();
	}, []);

	const loadPrompts = async () => {
		const loadedPrompts: Record<string, string> = {};

		for (const config of PROMPT_CONFIGS) {
			try {
				const value = await getConfig(config.configKey);
				loadedPrompts[config.id] = value || config.defaultValue;
			} catch (error) {
				console.error(`加载提示词 ${config.id} 失败:`, error);
				loadedPrompts[config.id] = config.defaultValue;
			}
		}

		setPrompts(loadedPrompts);
	};

	// 更新提示词
	const handlePromptChange = useCallback((id: string, value: string) => {
		setPrompts((prev) => ({ ...prev, [id]: value }));
		setHasChanges(true);
	}, []);

	// 重置单个提示词
	const handleReset = useCallback((id: string) => {
		const config = PROMPT_CONFIGS.find((c) => c.id === id);
		if (config) {
			setPrompts((prev) => ({ ...prev, [id]: config.defaultValue }));
			setHasChanges(true);
		}
	}, []);

	// 重置所有提示词
	const handleResetAll = useCallback(() => {
		const defaultPrompts: Record<string, string> = {};
		for (const config of PROMPT_CONFIGS) {
			defaultPrompts[config.id] = config.defaultValue;
		}
		setPrompts(defaultPrompts);
		setHasChanges(true);
	}, []);

	// 保存所有提示词
	const handleSaveAll = async () => {
		setIsSaving(true);

		try {
			for (const config of PROMPT_CONFIGS) {
				const value = prompts[config.id];
				if (value !== undefined) {
					await setConfig(config.configKey, value);
				}
			}
			setHasChanges(false);
			console.log("[PromptSettings] 提示词保存成功");
		} catch (error) {
			console.error("[PromptSettings] 保存提示词失败:", error);
			toast.error("保存失败，请重试");
		} finally {
			setIsSaving(false);
		}
	};

	// 切换展开/折叠
	const toggleExpand = (id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	};

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-8">
			<SettingsPanelHeader
				icon={Sparkles}
				title="提示词配置"
				description="自定义提示词。"
				actions={
					<>
						<button
							onClick={handleResetAll}
							className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
						>
							<RotateCcw className="w-3.5 h-3.5" />
							<span>重置全部</span>
						</button>
						<button
							onClick={handleSaveAll}
							disabled={!hasChanges || isSaving}
							className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
								hasChanges && !isSaving
									? "bg-zinc-900 text-white hover:bg-zinc-800"
									: "bg-zinc-100 text-zinc-400 cursor-not-allowed"
							}`}
						>
							<Save className="w-3.5 h-3.5" />
							<span>{isSaving ? "保存中..." : "保存更改"}</span>
						</button>
					</>
				}
			/>

				{/* 提示词列表 */}
				<div className="space-y-4">
					{PROMPT_CONFIGS.map((config) => {
						const isExpanded = expandedId === config.id;
						const currentValue = prompts[config.id] || "";
						const isModified = currentValue !== config.defaultValue;

						return (
							<div
								key={config.id}
								className={`rounded-xl border transition-all ${
									isExpanded
										? "border-zinc-300 dark:border-zinc-600 shadow-sm"
										: "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
								}`}
							>
								{/* 折叠头部 */}
								<button
									onClick={() => toggleExpand(config.id)}
									className="w-full flex items-center justify-between px-4 py-3 text-left"
								>
									<div className="flex items-center gap-3">
										<div
											className={`w-8 h-8 rounded-lg flex items-center justify-center ${
												isModified
													? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
													: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
											}`}
										>
											<config.icon className="w-4 h-4" />
										</div>
										<div>
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
													{config.label}
												</span>
												{isModified && (
													<span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
														已修改
													</span>
												)}
											</div>
											<p className="text-xs text-zinc-500 mt-0.5">
												{config.description}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										{isExpanded ? (
											<ChevronUp className="w-4 h-4 text-zinc-400" />
										) : (
											<ChevronDown className="w-4 h-4 text-zinc-400" />
										)}
									</div>
								</button>

								{/* 展开内容 */}
								{isExpanded && (
									<div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
										<div className="pt-4 space-y-3">
											<textarea
												value={currentValue}
												onChange={(e) =>
													handlePromptChange(config.id, e.target.value)
												}
												placeholder={config.placeholder}
												rows={12}
												className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 resize-none font-mono leading-relaxed"
											/>
											<div className="flex items-center justify-between">
												<p className="text-xs text-zinc-400">
													{currentValue.length} 字符
												</p>
												<button
													onClick={() => handleReset(config.id)}
													disabled={!isModified}
													className={`flex items-center gap-1 text-xs transition-colors ${
														isModified
															? "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
															: "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
													}`}
												>
													<RotateCcw className="w-3 h-3" />
													<span>恢复默认</span>
												</button>
											</div>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{/* 使用说明 */}
				<div className="mt-8 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
					<h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
						使用说明
					</h4>
					<ul className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5">
						<li>
							• 提示词中可以使用变量占位符，如{" "}
							<code className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded">
								{"{message}"}
							</code>
							、
							<code className="px-1 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded">
								{"{document}"}
							</code>{" "}
							等
						</li>
						<li>• 修改后需要点击「保存更改」按钮才会生效</li>
						<li>• 点击「恢复默认」可以将单个提示词重置为默认值</li>
						<li>• 提示词的质量直接影响 AI 的响应效果，请谨慎修改</li>
					</ul>
				</div>
		</SettingsPageContainer>
	);
}
