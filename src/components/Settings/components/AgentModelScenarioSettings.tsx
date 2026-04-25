/**
 * Agent Model Scenario Settings Component
 *
 * DESIGN PHILOSOPHY:
 * Premium, modern, and delicate.
 * Using subtle shadows, refined typography, and smooth transitions.
 */
import {
	Cog,
	Plus,
	Cpu,
	Trash2,
	Zap,
	PenTool,
	Search,
	Code2,
	Microscope,
	Languages,
	FileJson,
	Bug,
	Box,
	Check,
	X,
	Archive,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type AgentScenario,
	type ScenarioModelConfig,
	SCENARIO_DESCRIPTIONS,
	SCENARIO_LABELS,
} from "../../../lib/models/agentModelConfig";
import { useAgentModelSettingsStore } from "../../../lib/models/agentModelSettingsStore";
import { useSettingsStore } from "../../../lib/settingsStore";
import { Modal } from "../components";
import {
	ScenarioSelect,
	type ScenarioSelectGroup,
	type ScenarioSelectOptionItem,
} from "./ScenarioSelect";

// Icon mapping for Scenarios
const SCENARIO_ICONS: Record<string, any> = {
	default: Zap,
	fast_search: Search,
	code_review: Code2,
	deep_analysis: Microscope,
	writing: PenTool,
	translation: Languages,
	data_processing: FileJson,
	debugging: Bug,
	custom: Box,
};

/**
 * Premium Card Component
 */
const Card = ({
	children,
	className = "",
	onClick,
}: {
	children: React.ReactNode;
	className?: string;
	onClick?: () => void;
}) => (
	<div
		onClick={onClick}
		className={`bg-surface rounded-xl border border-border/60 shadow-sm hover:shadow-md hover:border-zinc-300/80 transition-all duration-200 ${className}`}
	>
		{children}
	</div>
);

/**
 * Premium Badge Component
 */
const Badge = ({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<span
		className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${className}`}
	>
		{children}
	</span>
);

export function AgentModelScenarioSettings() {
	const { settings, store, isLoaded } = useAgentModelSettingsStore();
	const { providers } = useSettingsStore();

	// UI States
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<"preset" | "custom">("preset");

	// Form States
	const [selectedScenarioType, setSelectedScenarioType] =
		useState<AgentScenario>("fast_search");
	const [customScenarioName, setCustomScenarioName] = useState("");
	const [selectedModelId, setSelectedModelId] = useState("");
	const [selectedProviderId, setSelectedProviderId] = useState("");

	// Load store
	useEffect(() => {
		if (!isLoaded) {
			store.init();
		}
	}, [isLoaded, store]);

	// Derived Data
	const allModels = useMemo(() => {
		return providers
			.filter((p) => p.isEnabled)
			.flatMap((p) =>
				p.models.map((m) => ({
					id: m,
					provider: p.name,
					providerId: p.id,
				})),
			);
	}, [providers]);

	// Group models by provider for grouped select
	const modelGroups = useMemo<ScenarioSelectGroup[]>(() => {
		return providers
			.filter((p) => p.isEnabled)
			.map((p) => ({
				label: p.name,
				items: p.models.map((m) => ({
					label: m,
					value: m,
					// subLabel: p.name, // Redundant in grouped view
					badge: "", // Removed badge as header shows provider
				})),
			}))
			.filter((g) => g.items.length > 0);
	}, [providers]);

	const configuredScenarios = useMemo(() => {
		return new Set(
			settings.scenarioConfigs.map((c: ScenarioModelConfig) =>
				c.scenario === "custom" ? `custom:${c.customName}` : c.scenario,
			),
		);
	}, [settings.scenarioConfigs]);

	const availablePresetScenarios = useMemo(() => {
		const presets: AgentScenario[] = [
			"fast_search",
			"code_review",
			"deep_analysis",
			"writing",
			"translation",
			"data_processing",
			"debugging",
		];
		return presets.filter((s) => !configuredScenarios.has(s));
	}, [configuredScenarios]);

	const presetOptions = useMemo<ScenarioSelectOptionItem[]>(
		() =>
			availablePresetScenarios.map((s) => ({
				label: SCENARIO_LABELS[s],
				value: s,
				subLabel: SCENARIO_DESCRIPTIONS[s],
				icon: SCENARIO_ICONS[s],
			})),
		[availablePresetScenarios],
	);

	// Handlers
	const handleDefaultModelChange = async (modelId: string) => {
		const model = allModels.find((m) => m.id === modelId);
		if (model) {
			await store.setDefaultModel(modelId, model.providerId);
		}
	};

	const handleAddScenario = async () => {
		if (!selectedModelId || !selectedProviderId) return;

		const isCustom = activeTab === "custom";
		const scenario = isCustom ? "custom" : selectedScenarioType;

		// Validation
		if (isCustom && !customScenarioName.trim()) return;

		await store.addScenarioConfig({
			scenario,
			customName: isCustom ? customScenarioName.trim() : undefined,
			modelId: selectedModelId,
			providerId: selectedProviderId,
		});

		setIsAddModalOpen(false);
		resetForm();
	};

	const resetForm = () => {
		setSelectedModelId("");
		setSelectedProviderId("");
		setCustomScenarioName("");
		setSelectedScenarioType(availablePresetScenarios[0] || "fast_search");
	};

	const handleRemove = async (config: ScenarioModelConfig) => {
		await store.removeScenarioConfig(config.scenario, config.customName);
	};

	const handleToggle = async (config: ScenarioModelConfig) => {
		await store.updateScenarioConfig(
			config.scenario,
			{ enabled: !config.enabled },
			config.customName,
		);
	};

	const handleScenarioModelChange = async (
		config: ScenarioModelConfig,
		modelId: string,
	) => {
		const model = allModels.find((m) => m.id === modelId);
		if (model) {
			await store.updateScenarioConfig(
				config.scenario,
				{
					modelId,
					providerId: model.providerId,
				},
				config.customName,
			);
		}
	};

	const getModelDisplay = (modelId: string, providerId: string) => {
		const model = allModels.find(
			(m) => m.id === modelId && m.providerId === providerId,
		);
		return model
			? { name: model.id, provider: model.provider }
			: { name: modelId, provider: providerId };
	};

	return (
		<div className="space-y-8 animate-in fade-in duration-500">
			{/* Header Section */}
			<div className="flex flex-col gap-1">
				<h4 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
					<Cog className="w-5 h-5 text-primary" />
					模型场景配置
				</h4>
				<p className="text-sm text-text-muted">
					针对不同任务配置专用的 AI 模型，平衡性能与成本。
				</p>
			</div>

			{/* Global Settings Group */}
			<div className="space-y-4">
				{/* Default Model & Smart Switch */}
				<div className="bg-surface rounded-xl border border-border/60 shadow-sm p-1 grid grid-cols-2 divide-x divide-zinc-100">
					<div className="p-4 flex flex-col justify-between">
						<div className="mb-2">
							<div className="flex items-center gap-2 font-medium text-text-primary text-sm">
								<Zap className="w-4 h-4 text-amber-500" />
								默认模型
							</div>
							<p className="text-xs text-text-light mt-1">兜底使用的基础模型</p>
						</div>
						<ScenarioSelect
							value={settings.defaultModelId}
							groups={modelGroups}
							onChange={handleDefaultModelChange}
							placeholder="选择默认模型..."
							label={
								settings.defaultProviderId
									? getModelDisplay(
											settings.defaultModelId,
											settings.defaultProviderId,
										).provider
									: undefined
							}
						/>
					</div>

					<div
						className="p-4 flex flex-col justify-between cursor-pointer hover:bg-warm-50/50 transition-colors"
						onClick={() => store.toggleSmartScenarioSwitch()}
					>
						<div>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2 font-medium text-text-primary text-sm">
									<Cpu
										className={`w-4 h-4 ${settings.enableSmartScenarioSwitch ? "text-primary" : "text-text-light"}`}
									/>
									智能场景推断
								</div>
								<div
									className={`w-8 h-5 rounded-full p-0.5 transition-colors ${settings.enableSmartScenarioSwitch ? "bg-primary" : "bg-warm-300"}`}
								>
									<div
										className={`w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${settings.enableSmartScenarioSwitch ? "translate-x-3" : "translate-x-0"}`}
									/>
								</div>
							</div>
							<p className="text-xs text-text-light mt-1">
								根据任务自动选择最佳模型
							</p>
						</div>
						<span
							className={`text-[10px] font-medium px-2 py-1 rounded inline-block w-fit mt-3 ${settings.enableSmartScenarioSwitch ? "bg-primary/10 text-primary" : "bg-warm-200 text-text-light"}`}
						>
							{settings.enableSmartScenarioSwitch
								? "已启用 · 动态优化"
								: "已禁用 · 手动控制"}
						</span>
					</div>
				</div>

				{/* Context & Memory Settings - NEW */}
				<Card className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="p-2 rounded-lg bg-blue-50 text-blue-600">
								<Archive className="w-4 h-4" />
							</div>
							<div>
								<span className="font-semibold text-text-primary block text-sm">
									上下文与记忆管理
								</span>
								<span className="text-xs text-text-muted">
									自动压缩历史对话，防止 Token 溢出
								</span>
							</div>
						</div>
						<div
							className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${settings.contextCompression?.enabled ? "bg-blue-600" : "bg-warm-300"}`}
							onClick={() =>
								store.updateContextCompression({
									enabled: !settings.contextCompression?.enabled,
								})
							}
						>
							<div
								className={`w-4 h-4 rounded-full bg-surface shadow-sm transition-transform ${settings.contextCompression?.enabled ? "translate-x-4" : "translate-x-0"}`}
							/>
						</div>
					</div>

					{/* Expandable settings if enabled */}
					{settings.contextCompression?.enabled && (
						<div className="grid grid-cols-2 gap-6 pt-4 mt-4 border-t border-border animate-in slide-in-from-top-2 fade-in">
							{/* Threshold */}
							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="text-xs font-medium text-text-muted">
										压缩阈值
									</label>
									<span className="text-xs font-mono font-medium text-text-primary bg-warm-200 px-1.5 py-0.5 rounded">
										{(settings.contextCompression.threshold / 1000).toFixed(0)}k
									</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-[10px] text-text-light">4k</span>
									<input
										type="range"
										min="4000"
										max="100000"
										step="1000"
										value={settings.contextCompression.threshold}
										onChange={(e) =>
											store.updateContextCompression({
												threshold: parseInt(e.target.value),
											})
										}
										className="flex-1 h-1.5 bg-warm-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700"
									/>
									<span className="text-[10px] text-text-light">100k</span>
								</div>
							</div>
							{/* Strategy */}
							<div>
								<label className="text-xs font-medium text-text-muted mb-2 block">
									压缩策略
								</label>
								<div className="flex p-0.5 bg-warm-200 rounded-lg">
									<button
										onClick={() =>
											store.updateContextCompression({ strategy: "summary" })
										}
										className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.contextCompression.strategy === "summary" ? "bg-surface shadow-sm text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
									>
										智能摘要
									</button>
									<button
										onClick={() =>
											store.updateContextCompression({ strategy: "selection" })
										}
										className={`flex-1 py-1.5 text-[10px] font-medium rounded transition-all ${settings.contextCompression.strategy === "selection" ? "bg-surface shadow-sm text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
									>
										关键筛选
									</button>
								</div>
							</div>
						</div>
					)}
				</Card>
			</div>

			{/* Scenarios List Section */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h5 className="font-medium text-text-primary text-sm">已生效场景</h5>
					<button
						onClick={() => {
							setIsAddModalOpen(true);
							resetForm();
						}}
						className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-dark-muted rounded-lg hover:bg-dark-surface transition-colors shadow-sm hover:shadow"
					>
						<Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" />
						添加场景
					</button>
				</div>

				<div className="grid grid-cols-1 gap-3">
					{settings.scenarioConfigs.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl border-2 border-dashed border-border bg-warm-50/50">
							<div className="w-12 h-12 rounded-full bg-warm-200 flex items-center justify-center mb-3 text-text-light">
								<Box className="w-6 h-6" />
							</div>
							<h6 className="text-sm font-medium text-text-primary">
								暂未配置场景
							</h6>
							<p className="text-xs text-text-muted text-center max-w-[250px] mt-1">
								添加场景映射后，特定任务将自动路由到专用模型，提升效率。
							</p>
						</div>
					) : (
						settings.scenarioConfigs.map((config, index) => {
							const Icon = SCENARIO_ICONS[config.scenario] || Box;

							// Z-index staging for dropdowns to appear over subsequent items
							const zIndex = 50 - index;

							return (
								<div
									key={
										config.scenario === "custom"
											? `custom-${config.customName}`
											: config.scenario
									}
									style={{ zIndex }}
									className={`group relative flex items-center justify-between p-4 bg-surface rounded-xl border transition-all duration-200 ${config.enabled ? "border-border/80 shadow-sm hover:border-primary/40 hover:shadow-md" : "border-border bg-warm-50/50 opacity-70"}`}
								>
									<div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
										<div
											className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${config.enabled ? "bg-primary/10 text-primary" : "bg-warm-300 text-text-light"}`}
										>
											<Icon className="w-5 h-5" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="font-semibold text-sm text-text-primary truncate">
													{config.scenario === "custom"
														? config.customName
														: SCENARIO_LABELS[config.scenario]}
												</span>
												{config.scenario === "custom" && (
													<Badge className="bg-warm-200 text-text-muted border-border text-[10px] shrink-0">
														自定义
													</Badge>
												)}
											</div>
											<p className="text-xs text-text-muted mt-0.5 truncate max-w-[90%]">
												{config.scenario === "custom"
													? "用户自定义场景规则"
													: SCENARIO_DESCRIPTIONS[config.scenario]}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-3 shrink-0">
										{/* Model Selector in List */}
										<div className="w-40 relative">
											<ScenarioSelect
												value={config.modelId}
												groups={modelGroups}
												onChange={(val) =>
													handleScenarioModelChange(config, val)
												}
												placeholder="选择模型"
											/>
										</div>

										{/* Actions */}
										<div className="flex items-center border-l pl-3 ml-2 border-border gap-1">
											<button
												onClick={() => handleToggle(config)}
												className={`p-2 rounded-lg transition-colors ${config.enabled ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-text-light hover:bg-warm-200"}`}
												title={config.enabled ? "禁用" : "启用"}
											>
												{config.enabled ? (
													<Check className="w-4 h-4" />
												) : (
													<X className="w-4 h-4" />
												)}
											</button>
											<button
												onClick={() => handleRemove(config)}
												className="p-2 text-text-light hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
												title="删除"
											>
												<Trash2 className="w-4 h-4" />
											</button>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* Add Modal */}
			<Modal
				isOpen={isAddModalOpen}
				onClose={() => setIsAddModalOpen(false)}
				title="配置新场景"
			>
				<div className="space-y-6 pt-2">
					{/* Tabs */}
					<div className="flex p-1 bg-warm-200/80 rounded-xl">
						<button
							onClick={() => setActiveTab("preset")}
							className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === "preset" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
						>
							预设场景
						</button>
						<button
							onClick={() => setActiveTab("custom")}
							className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${activeTab === "custom" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
						>
							自定义
						</button>
					</div>

					<div className="space-y-4">
						{/* Scenario Selection */}
						<div className="relative z-20">
							<label className="text-xs font-medium text-text-muted mb-1.5 block uppercase tracking-wider">
								场景类型
							</label>
							{activeTab === "preset" ? (
								<ScenarioSelect
									value={selectedScenarioType}
									options={presetOptions}
									onChange={(val) =>
										setSelectedScenarioType(val as AgentScenario)
									}
									placeholder="选择预设场景..."
								/>
							) : (
								<div className="space-y-2">
									<input
										type="text"
										value={customScenarioName}
										onChange={(e) => setCustomScenarioName(e.target.value)}
										placeholder="例如: 创意写作 creative_writing"
										className="w-full px-4 py-2.5 bg-warm-50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
									/>
									<p className="text-xs text-text-light px-1">
										输入唯一的场景标识符（推荐英文），Agent
										将尝试从您的指令中匹配。
									</p>
								</div>
							)}
						</div>

						{/* Model Selection */}
						<div className="relative z-10">
							<label className="text-xs font-medium text-text-muted mb-1.5 block uppercase tracking-wider">
								目标模型
							</label>
							<ScenarioSelect
								value={selectedModelId}
								groups={modelGroups}
								onChange={(val) => {
									const model = allModels.find((m) => m.id === val);
									if (model) {
										setSelectedModelId(model.id);
										setSelectedProviderId(model.providerId);
									}
								}}
								placeholder="选择最适合的模型..."
								label={
									selectedProviderId
										? getModelDisplay(selectedModelId, selectedProviderId)
												.provider
										: undefined
								}
							/>
						</div>
					</div>

					<div className="flex justify-end gap-3 pt-6 border-t border-border">
						<button
							onClick={() => setIsAddModalOpen(false)}
							className="px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary hover:bg-warm-50 rounded-lg transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleAddScenario}
							disabled={
								!selectedModelId ||
								(activeTab === "custom" && !customScenarioName)
							}
							className="px-6 py-2 text-xs font-medium bg-dark-muted text-white rounded-lg hover:bg-dark-surface disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
						>
							确认添加
						</button>
					</div>
				</div>
			</Modal>
		</div>
	);
}
