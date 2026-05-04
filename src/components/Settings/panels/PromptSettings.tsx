import {
	ChevronDown,
	ChevronUp,
	FileText,
	RotateCcw,
	Save,
	ScrollText,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";

// 默认提示词配置
export const DEFAULT_PROMPTS: Record<string, string> = {
	titleGeneration: `请为以下用户提问生成一个非常简短的对话标题（不超过10个字），直接返回标题内容，不要有任何引号或额外文字：

{message}`,
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
				icon={ScrollText}
				title="提示词配置"
				description="自定义提示词。"
				actions={
					<>
						<button
							onClick={handleResetAll}
							className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary hover:bg-warm-200 rounded-lg transition-colors"
						>
							<RotateCcw className="w-3.5 h-3.5" />
							<span>重置全部</span>
						</button>
						<button
							onClick={handleSaveAll}
							disabled={!hasChanges || isSaving}
							className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-all ${
								hasChanges && !isSaving
									? "bg-dark-muted text-white hover:bg-dark-surface"
									: "bg-warm-200 text-text-light cursor-not-allowed"
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
									? "border-cream-400 dark:border-cream-500 shadow-sm"
									: "border-border hover:border-cream-400 dark:hover:border-cream-500"
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
												? "bg-warm-200 text-text-primary"
												: "bg-warm-200 text-text-muted"
										}`}
									>
										<config.icon className="w-4 h-4" />
									</div>
									<div>
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium text-text-primary dark:text-zinc-200">
												{config.label}
											</span>
											{isModified && (
												<span className="px-1.5 py-0.5 text-[10px] font-medium bg-mint-500/15 text-mint-600 rounded-full">
													已修改
												</span>
											)}
										</div>
										<p className="text-xs text-text-muted mt-0.5">
											{config.description}
										</p>
									</div>
								</div>
								<div className="flex items-center gap-2">
									{isExpanded ? (
										<ChevronUp className="w-4 h-4 text-text-light" />
									) : (
										<ChevronDown className="w-4 h-4 text-text-light" />
									)}
								</div>
							</button>

							{/* 展开内容 */}
							{isExpanded && (
								<div className="px-4 pb-4 border-t border-border">
									<div className="pt-4 space-y-3">
										<textarea
											value={currentValue}
											onChange={(e) =>
												handlePromptChange(config.id, e.target.value)
											}
											placeholder={config.placeholder}
											rows={12}
											className="w-full px-4 py-3 bg-warm-50/50 border border-border rounded-xl text-sm text-text-primary dark:text-zinc-200 placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 resize-none font-mono leading-relaxed"
										/>
										<div className="flex items-center justify-between">
											<p className="text-xs text-text-light">
												{currentValue.length} 字符
											</p>
											<button
												onClick={() => handleReset(config.id)}
												disabled={!isModified}
												className={`flex items-center gap-1 text-xs transition-colors ${
													isModified
														? "text-text-muted hover:text-text-secondary dark:hover:text-text-light"
														: "text-text-light cursor-not-allowed"
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
			<div className="mt-8 p-4 bg-warm-50/50 rounded-xl">
				<h4 className="text-sm font-medium text-text-secondary mb-2">
					使用说明
				</h4>
				<ul className="text-xs text-text-muted space-y-1.5">
					<li>
						• 标题生成提示词支持变量占位符{" "}
						<code className="px-1 py-0.5 bg-warm-300 dark:bg-cream-700 rounded">
							{"{message}"}
						</code>
					</li>
					<li>• 修改后需要点击「保存更改」按钮才会生效</li>
					<li>• 点击「恢复默认」可以将单个提示词重置为默认值</li>
					<li>• Agent 运行提示词由 Claude Agent SDK 原生管理，不在这里注入</li>
				</ul>
			</div>
		</SettingsPageContainer>
	);
}
