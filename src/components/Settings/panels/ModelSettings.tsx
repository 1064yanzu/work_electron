import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Eye,
	EyeOff,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Settings,
	Wifi,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { checkProviderApiKey, invokeLlm } from "../../../lib/api";
import { useSettingsStore } from "../../../lib/settingsStore";
import { ProviderType } from "../../../types";
import { confirmDialog } from "../../ui/ConfirmDialog";
import Select from "../../ui/Select";
import { toast } from "../../ui/Toast";
import {
	CheckButton,
	type CheckStatus,
	getModelBadges,
	Modal,
	ModelBadge,
	ModelDiscoveryModal,
	Toggle,
} from "../components";
import { PROVIDER_TEMPLATES } from "../constants";
import { getModelIcon } from "../modelIcons";
import { getProviderIcon } from "../providerIcons";
import {
	formatGroupName,
	getTemplateForProvider,
	groupModels,
	openUrl,
} from "../utils";

type EndpointType = "chat_completions" | "responses";
type ModelEndpointSelection = "inherit" | EndpointType;

function isEndpointConfigurableProvider(providerType: ProviderType) {
	return (
		providerType === ProviderType.OpenAi ||
		providerType === ProviderType.Custom ||
		providerType === ProviderType.Deepseek
	);
}

function getModelEndpointTypes(
	metadata: Record<string, unknown> | undefined,
): Record<string, EndpointType> {
	const raw = metadata?.model_endpoint_types;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

	const result: Record<string, EndpointType> = {};
	for (const [model, value] of Object.entries(raw)) {
		if (value === "chat_completions" || value === "responses") {
			result[model] = value;
		}
	}
	return result;
}

export function ModelSettings() {
	const { providers, settingsStore } = useSettingsStore();

	// 基础状态
	const [selectedId, setSelectedId] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [showApiKey, setShowApiKey] = useState(false);
	const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
	const [apiKeyDraft, setApiKeyDraft] = useState("");
	const [checkStatus, setCheckStatus] = useState<CheckStatus>("idle");
	const [isManaging, setIsManaging] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const [testingModel, setTestingModel] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	// 弹窗状态
	const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
	const [isAddModelOpen, setIsAddModelOpen] = useState(false);
	const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
	const [providerName, setProviderName] = useState("");
	const [providerType, setProviderType] = useState<ProviderType>(
		ProviderType.OpenAi,
	);
	const [isCreating, setIsCreating] = useState(false);
	const [newModelId, setNewModelId] = useState("");

	// 派生状态
	const selected = providers.find((p) => p.id === selectedId);
	const template = selected ? getTemplateForProvider(selected) : undefined;
	const apiKeyUrl = template?.apiKeyUrl || template?.docsUrl;
	const openaiEndpointType =
		selected?.metadata?.openai_endpoint_type === "responses"
			? "responses"
			: "chat_completions";
	const modelEndpointTypes = getModelEndpointTypes(
		selected?.metadata as Record<string, unknown> | undefined,
	);
	const canConfigureEndpoint =
		!!selected && isEndpointConfigurableProvider(selected.providerType);
	const docsUrl = template?.docsUrl;
	const modelsUrl = template?.modelsUrl;
	const filtered = providers.filter((p) =>
		p.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);
	const modelGroups = selected ? groupModels(selected.models) : {};
	const apiPreviewUrl = (() => {
		if (!selected?.apiBase) return "";
		const stripTrailingSlash = (s: string) =>
			String(s || "").replace(/\/+$/, "");
		const rawBase = stripTrailingSlash(selected.apiBase);

		if (selected.providerType === ProviderType.Anthropic) {
			const base = rawBase.endsWith("/v1")
				? rawBase.slice(0, -"/v1".length)
				: rawBase;
			return `${base}/v1/messages`;
		}

		const templateId = selected.templateId || selected.metadata?.templateId;
		const base = (() => {
			if (templateId === "gemini") {
				return rawBase.includes("/v1beta/openai")
					? rawBase
					: `${rawBase}/v1beta/openai`;
			}
			if (
				templateId === "perplexity" ||
				templateId === "github" ||
				templateId === "zhipu"
			) {
				return rawBase;
			}
			if (/\/v\d+(?:beta\d*)?(?:\/|$)/i.test(rawBase)) return rawBase;
			return `${rawBase}/v1`;
		})();

		return openaiEndpointType === "responses"
			? `${base}/responses`
			: `${base}/chat/completions`;
	})();

	// 初始化选中
	useEffect(() => {
		if (providers.length > 0 && !selectedId) {
			setSelectedId(providers[0].id);
		}
	}, [providers, selectedId]);

	// 展开所有分组
	useEffect(() => {
		if (selected) {
			setExpandedGroups(new Set(Object.keys(groupModels(selected.models))));
		}
	}, [selected?.id]);

	// 切换服务商启用
	const handleToggle = useCallback(
		(id: string) => {
			const p = providers.find((x) => x.id === id);
			if (p) settingsStore.updateProvider(id, { isEnabled: !p.isEnabled });
		},
		[providers, settingsStore],
	);

	// 检测 API
	const handleCheck = useCallback(async () => {
		if (!selected) return;
		setCheckStatus("checking");
		try {
			const result = await checkProviderApiKey(selected.id);
			setCheckStatus(result.valid ? "success" : "error");
		} catch {
			setCheckStatus("error");
		}
		setTimeout(() => setCheckStatus("idle"), 3000);
	}, [selected]);

	const normalizeApiKeys = useCallback((value: string) => {
		const items = value
			.split(/[\n,，]/g)
			.map((key) => key.trim())
			.filter(Boolean);
		const seen = new Set<string>();
		const ordered: string[] = [];
		for (const item of items) {
			if (seen.has(item)) continue;
			seen.add(item);
			ordered.push(item);
		}
		return ordered;
	}, []);

	const handleOpenApiKeyModal = useCallback(() => {
		if (!selected) return;
		setApiKeyDraft(normalizeApiKeys(selected.apiKey || "").join("\n"));
		setIsApiKeyModalOpen(true);
	}, [normalizeApiKeys, selected]);

	const handleSaveApiKeyModal = useCallback(() => {
		if (!selected) return;
		const keys = normalizeApiKeys(apiKeyDraft);
		settingsStore.updateProvider(selected.id, {
			apiKey: keys.join(","),
		});
		setIsApiKeyModalOpen(false);
	}, [apiKeyDraft, normalizeApiKeys, selected, settingsStore]);

	// 删除服务商
	const handleDelete = useCallback(async () => {
		if (!selected) return;
		const confirmed = await confirmDialog.danger(
			`确定要删除服务商 "${selected.name}" 吗？`,
			"删除服务商",
		);
		if (!confirmed) return;
		setIsDeleting(true);
		try {
			await settingsStore.deleteProvider(selected.id);
			const rest = providers.filter((p) => p.id !== selected.id);
			setSelectedId(rest[0]?.id || "");
		} catch (e) {
			toast.error(`删除失败: ${e}`);
		} finally {
			setIsDeleting(false);
		}
	}, [selected, providers, settingsStore]);

	// 添加模型
	const handleAddModel = useCallback(() => {
		if (!selected || !newModelId.trim()) return;
		settingsStore.addModel(selected.id, newModelId.trim());
		setNewModelId("");
		setIsAddModelOpen(false);
	}, [selected, newModelId, settingsStore]);

	// 删除模型
	const handleRemoveModel = useCallback(
		(model: string) => {
			if (selected) settingsStore.removeModel(selected.id, model);
		},
		[selected, settingsStore],
	);

	const handleModelEndpointChange = useCallback(
		(model: string, value: ModelEndpointSelection) => {
			if (!selected) return;
			const metadata = {
				...(selected.metadata || {}),
			} as Record<string, unknown>;
			const nextModelEndpointTypes = getModelEndpointTypes(metadata);

			if (value === "inherit") {
				delete nextModelEndpointTypes[model];
			} else {
				nextModelEndpointTypes[model] = value;
			}

			if (Object.keys(nextModelEndpointTypes).length > 0) {
				metadata.model_endpoint_types = nextModelEndpointTypes;
			} else {
				delete metadata.model_endpoint_types;
			}

			settingsStore.updateProvider(selected.id, { metadata });
		},
		[selected, settingsStore],
	);

	// 测试模型
	const handleTestModel = useCallback(
		async (model: string) => {
			if (!selected) return;
			setTestingModel(model);
			try {
				const result = await invokeLlm({
					model,
					prompt: 'Say "OK" to confirm.',
					temperature: 0.1,
				});
				if (result.content) {
					toast.success(`模型 ${model} 连接成功`);
				} else {
					toast.warning("返回了空响应");
				}
			} catch (e) {
				toast.error(`测试失败: ${e}`);
			} finally {
				setTestingModel(null);
			}
		},
		[selected],
	);

	// 创建服务商
	const handleCreate = useCallback(async () => {
		if (!providerName.trim()) return;
		setIsCreating(true);
		try {
			const tpl = PROVIDER_TEMPLATES.find(
				(t) => t.providerType === providerType,
			);
			const created = await settingsStore.createProvider({
				template: tpl,
				name: providerName.trim(),
				providerType,
				models: tpl?.defaultModels || [],
				apiBase: tpl?.defaultApiBase,
				isEnabled: true,
			});
			setIsAddProviderOpen(false);
			setProviderName("");
			if (created?.id) setSelectedId(created.id);
		} catch (e) {
			toast.error(`创建失败: ${e}`);
		} finally {
			setIsCreating(false);
		}
	}, [providerName, providerType, settingsStore]);

	// 切换分组展开
	const toggleGroup = useCallback((group: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			next.has(group) ? next.delete(group) : next.add(group);
			return next;
		});
	}, []);

	return (
		<div className="flex h-full">
			{/* 左侧：服务商列表 */}
			<div className="w-60 border-r border-zinc-200/80 bg-zinc-50/50 flex flex-col">
				<div className="p-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
						<input
							type="text"
							placeholder="搜索模型平台..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200/80 rounded-xl text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
						/>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-3 space-y-1">
					{filtered.map((provider) => (
						<div
							key={provider.id}
							onClick={() => setSelectedId(provider.id)}
							className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
								selectedId === provider.id
									? "bg-white shadow-sm ring-1 ring-zinc-200/80"
									: "hover:bg-white/60"
							}`}
						>
							<div
								className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${provider.color} overflow-hidden`}
							>
								{getProviderIcon(provider.templateId) ? (
									<img
										src={getProviderIcon(provider.templateId)}
										alt={provider.name}
										className="w-full h-full object-cover"
									/>
								) : (
									provider.icon && <provider.icon className="w-5 h-5" />
								)}
							</div>
							<span className="flex-1 text-sm font-medium text-zinc-800 truncate">
								{provider.name}
							</span>
						</div>
					))}
				</div>

				<div className="p-4 border-t border-zinc-200/80">
					<button
						onClick={() => setIsAddProviderOpen(true)}
						className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200/80 rounded-xl transition-colors shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
					>
						<Plus className="w-4 h-4" />
						添加服务商
					</button>
				</div>
			</div>

			{/* 右侧：配置详情 */}
			<div className="flex-1 overflow-y-auto bg-white">
				{selected ? (
					<div className="p-8 max-w-2xl">
						{/* 标题栏 */}
						<div className="flex items-center justify-between mb-10 pr-10">
							<div className="flex items-center gap-3">
								<div
									className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${selected.color} overflow-hidden`}
								>
									{getProviderIcon(selected.templateId) ? (
										<img
											src={getProviderIcon(selected.templateId)}
											alt={selected.name}
											className="w-full h-full object-cover"
										/>
									) : (
										selected.icon && <selected.icon className="w-6 h-6" />
									)}
								</div>
								<h2 className="text-xl font-semibold text-zinc-900">
									{selected.name}
								</h2>
								{template?.homeUrl && (
									<button
										onClick={() => openUrl(template.homeUrl!)}
										className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
									>
										<ExternalLink className="w-4 h-4" />
									</button>
								)}
							</div>
							<Toggle
								checked={selected.isEnabled}
								onChange={() => handleToggle(selected.id)}
							/>
						</div>

						{/* API 密钥 */}
						<div className="mb-8">
							<div className="flex items-center justify-between mb-3">
								<label className="text-sm font-medium text-zinc-700">
									API 密钥
								</label>
								<div className="flex items-center gap-2">
									<button
										onClick={handleOpenApiKeyModal}
										className="px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
									>
										管理
									</button>
									<button
										onClick={() => setShowApiKey(!showApiKey)}
										className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
									>
										{showApiKey ? (
											<EyeOff className="w-4 h-4" />
										) : (
											<Eye className="w-4 h-4" />
										)}
									</button>
								</div>
							</div>
							<div className="flex gap-3">
								<input
									type={showApiKey ? "text" : "password"}
									value={selected.apiKey || ""}
									onChange={(e) =>
										settingsStore.updateProvider(selected.id, {
											apiKey: e.target.value,
										})
									}
									placeholder="sk-..."
									className="flex-1 px-4 py-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 focus:bg-white transition-all"
								/>
								<CheckButton status={checkStatus} onClick={handleCheck} />
							</div>
							<p className="mt-2 text-xs text-zinc-400">
								支持多个密钥，用逗号或换行分隔
							</p>
							{apiKeyUrl && (
								<button
									onClick={() => openUrl(apiKeyUrl)}
									className="mt-3 text-sm text-blue-600 hover:text-blue-700 hover:underline transition-colors"
								>
									点击这里获取密钥 →
								</button>
							)}
						</div>

						{/* API 地址 */}
						<div className="mb-8">
							<div className="flex items-center gap-2 mb-3">
								<label className="text-sm font-medium text-zinc-700">
									API 地址
								</label>
								<span className="text-xs text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">
									可选
								</span>
							</div>
							<input
								type="text"
								value={selected.apiBase || ""}
								onChange={(e) =>
									settingsStore.updateProvider(selected.id, {
										apiBase: e.target.value,
									})
								}
								placeholder={
									template?.defaultApiBase || "https://api.openai.com/v1"
								}
								className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 focus:bg-white transition-all"
							/>
							{selected.apiBase && apiPreviewUrl && (
								<p className="mt-2 text-xs text-zinc-400">
									预览：{apiPreviewUrl}
								</p>
							)}
						</div>

						{canConfigureEndpoint && (
							<div className="mb-8">
								<label className="mb-3 block text-sm font-medium text-zinc-700">
									默认端点类型
								</label>
								<Select
									value={openaiEndpointType}
									onChange={(e) =>
										settingsStore.updateProvider(selected.id, {
											metadata: {
												...(selected.metadata || {}),
												openai_endpoint_type: e.target.value,
											},
										})
									}
								>
									<option value="chat_completions">兼容型</option>
									<option value="responses">Responses</option>
								</Select>
								<p className="mt-2 text-xs text-zinc-400">
									未单独配置的模型会继承此默认端点类型。
								</p>
							</div>
						)}

						{/* 模型区域 */}
						<div className="mb-8">
							<div className="flex items-center justify-between mb-4">
								<div className="flex items-center gap-3">
									<span className="text-sm font-medium text-zinc-700">
										模型
									</span>
									<span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md">
										({selected.models.length})
									</span>
								</div>
								<div className="flex items-center gap-2">
									<button
										onClick={() => setIsManaging(!isManaging)}
										className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${isManaging ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}
									>
										{isManaging ? "完成" : "管理"}
									</button>
									<button
										onClick={() => setIsDiscoveryOpen(true)}
										className="px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all flex items-center gap-1"
										title="从服务商自动获取模型列表"
									>
										<RefreshCw className="w-3.5 h-3.5" />
										同步
									</button>
									<button
										onClick={() => setIsAddModelOpen(true)}
										className="px-3 py-1.5 text-sm font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg transition-all flex items-center gap-1"
									>
										<Plus className="w-3.5 h-3.5" />
										添加
									</button>
								</div>
							</div>

							{Object.keys(modelGroups).length > 0 ? (
								<div className="space-y-3">
									{Object.entries(modelGroups).map(([groupName, models]) => (
										<div
											key={groupName}
											className="border border-zinc-200/80 rounded-2xl overflow-hidden bg-zinc-50/30"
										>
											<div
												className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-100/50 transition-colors"
												onClick={() => toggleGroup(groupName)}
											>
												<div className="flex items-center gap-2">
													{expandedGroups.has(groupName) ? (
														<ChevronDown className="w-4 h-4 text-zinc-400" />
													) : (
														<ChevronRight className="w-4 h-4 text-zinc-400" />
													)}
													<span className="text-sm font-medium text-zinc-700">
														{formatGroupName(groupName)}
													</span>
													<span className="text-xs text-zinc-400">
														({models.length})
													</span>
												</div>
											</div>
											{expandedGroups.has(groupName) && (
												<div className="border-t border-zinc-200/60">
													{models.map((model, idx) => (
														<div
															key={model}
															className={`flex items-center justify-between px-4 py-3 group hover:bg-white transition-colors ${idx !== models.length - 1 ? "border-b border-zinc-100" : ""}`}
														>
															<div className="flex min-w-0 flex-1 items-center gap-3">
																<div
																	className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs shadow-sm bg-white border border-zinc-200 overflow-hidden`}
																>
																	{getModelIcon(model) ? (
																		<img
																			src={getModelIcon(model)}
																			alt={model}
																			className="w-5 h-5 object-contain"
																		/>
																	) : (
																		<div
																			className={`w-full h-full flex items-center justify-center ${selected.color}`}
																		>
																			{selected.icon && (
																				<selected.icon className="w-3.5 h-3.5 text-white" />
																			)}
																		</div>
																	)}
																</div>
																<span className="truncate text-sm text-zinc-800 font-medium">
																	{model}
																</span>
																<div className="flex shrink-0 gap-1">
																	{getModelBadges(model).map((b) => (
																		<ModelBadge key={b} type={b} />
																	))}
																</div>
															</div>
															{canConfigureEndpoint && (
																<div className="mx-3 w-36 shrink-0">
																	<Select
																		variant="compact"
																		containerClassName="w-full"
																		value={
																			modelEndpointTypes[model] ?? "inherit"
																		}
																		onChange={(e) =>
																			handleModelEndpointChange(
																				model,
																				e.target
																					.value as ModelEndpointSelection,
																			)
																		}
																	>
																		<option value="inherit">继承默认</option>
																		<option value="chat_completions">
																			兼容型
																		</option>
																		<option value="responses">Responses</option>
																	</Select>
																</div>
															)}
															<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
																<button
																	onClick={() => handleTestModel(model)}
																	disabled={testingModel === model}
																	className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
																	title="测试连接"
																>
																	{testingModel === model ? (
																		<Loader2 className="w-4 h-4 animate-spin" />
																	) : (
																		<Wifi className="w-4 h-4" />
																	)}
																</button>
																{isManaging && (
																	<button
																		onClick={() => handleRemoveModel(model)}
																		className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
																		title="删除"
																	>
																		<Trash2 className="w-4 h-4" />
																	</button>
																)}
															</div>
														</div>
													))}
												</div>
											)}
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-12 border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
									<p className="text-sm text-zinc-400">暂无模型</p>
									<button
										onClick={() => setIsAddModelOpen(true)}
										className="mt-3 text-sm text-blue-600 hover:text-blue-700"
									>
										添加第一个模型
									</button>
								</div>
							)}

							{template && (docsUrl || modelsUrl) && (
								<p className="mt-4 text-xs text-zinc-400">
									{docsUrl && (
										<>
											查看{" "}
											<button
												onClick={() => openUrl(docsUrl)}
												className="text-blue-600 hover:underline"
											>
												{selected.name} 文档
											</button>
										</>
									)}
									{docsUrl && modelsUrl ? " 和 " : ""}
									{modelsUrl && (
										<button
											onClick={() => openUrl(modelsUrl)}
											className="text-blue-600 hover:underline"
										>
											模型列表
										</button>
									)}{" "}
									获取更多详情
								</p>
							)}
						</div>

						{/* 删除 */}
						<div className="pt-8 border-t border-zinc-200/80">
							<button
								onClick={handleDelete}
								disabled={isDeleting}
								className="text-sm text-red-500 hover:text-red-600 flex items-center gap-2 px-4 py-2 -ml-4 rounded-lg hover:bg-red-50 transition-colors"
							>
								<Trash2 className="w-4 h-4" />
								{isDeleting ? "删除中..." : "删除此服务商"}
							</button>
						</div>
					</div>
				) : (
					<div className="h-full flex items-center justify-center">
						<div className="text-center">
							<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 flex items-center justify-center">
								<Settings className="w-8 h-8 text-zinc-300" />
							</div>
							<p className="text-zinc-500">选择一个服务商进行配置</p>
						</div>
					</div>
				)}
			</div>

			{/* 添加服务商弹窗 */}
			<Modal
				isOpen={isAddProviderOpen}
				onClose={() => setIsAddProviderOpen(false)}
				title="添加提供商"
			>
				<div className="flex justify-center mb-8">
					<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-100 to-zinc-200 flex items-center justify-center text-3xl font-bold text-zinc-400 shadow-inner">
						{providerName?.[0]?.toUpperCase() || "P"}
					</div>
				</div>
				<div className="space-y-5">
					<div>
						<label className="text-sm font-medium text-zinc-700 mb-2 block">
							提供商名称
						</label>
						<input
							type="text"
							value={providerName}
							onChange={(e) => setProviderName(e.target.value)}
							placeholder="例如 OpenAI"
							className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 focus:bg-white transition-all"
						/>
					</div>
					<div>
						<label className="text-sm font-medium text-zinc-700 mb-2 block">
							提供商类型
						</label>
						<Select
							value={providerType}
							onChange={(e) => setProviderType(e.target.value as ProviderType)}
						>
							{Object.values(ProviderType).map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</Select>
					</div>
				</div>
				<div className="flex justify-end gap-3 mt-8">
					<button
						onClick={() => setIsAddProviderOpen(false)}
						className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
					>
						取消
					</button>
					<button
						onClick={handleCreate}
						disabled={isCreating || !providerName.trim()}
						className="px-5 py-2.5 text-sm font-medium bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
					>
						{isCreating ? "创建中..." : "确定"}
					</button>
				</div>
			</Modal>

			{/* 添加模型弹窗 */}
			<Modal
				isOpen={isApiKeyModalOpen}
				onClose={() => setIsApiKeyModalOpen(false)}
				title="管理 API 密钥"
			>
				<div className="space-y-5">
					<div>
						<label className="text-sm font-medium text-zinc-700 mb-2 block">
							密钥列表
						</label>
						<textarea
							value={apiKeyDraft}
							onChange={(e) => setApiKeyDraft(e.target.value)}
							placeholder="每行一个密钥"
							rows={6}
							className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 focus:bg-white transition-all resize-none"
						/>
						<p className="mt-2 text-xs text-zinc-400">
							支持逗号或换行分隔，系统会自动去重
						</p>
					</div>
				</div>
				<div className="flex justify-end gap-3 mt-8">
					<button
						onClick={() => setIsApiKeyModalOpen(false)}
						className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
					>
						取消
					</button>
					<button
						onClick={handleSaveApiKeyModal}
						className="px-5 py-2.5 text-sm font-medium bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors"
					>
						保存
					</button>
				</div>
			</Modal>

			{/* 添加模型弹窗 */}
			<Modal
				isOpen={isAddModelOpen}
				onClose={() => setIsAddModelOpen(false)}
				title="添加模型"
			>
				<div className="space-y-5">
					<div>
						<label className="text-sm font-medium text-zinc-700 mb-2 block">
							模型 ID <span className="text-red-500">*</span>
						</label>
						<input
							type="text"
							value={newModelId}
							onChange={(e) => setNewModelId(e.target.value)}
							placeholder="例如 gpt-4o-mini"
							className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 focus:bg-white transition-all"
						/>
						<p className="mt-2 text-xs text-zinc-400">
							请输入模型的完整 ID，如 gpt-4o、claude-3-5-sonnet-20241022
						</p>
					</div>
				</div>
				<div className="flex justify-end gap-3 mt-8">
					<button
						onClick={() => {
							setIsAddModelOpen(false);
							setNewModelId("");
						}}
						className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
					>
						取消
					</button>
					<button
						onClick={handleAddModel}
						disabled={!newModelId.trim()}
						className="px-5 py-2.5 text-sm font-medium bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
					>
						添加模型
					</button>
				</div>
			</Modal>

			{/* 自动获取模型弹窗 */}
			{selected && (
				<ModelDiscoveryModal
					isOpen={isDiscoveryOpen}
					onClose={() => setIsDiscoveryOpen(false)}
					provider={selected}
					onAddModels={async (models) => {
						const currentModels = new Set(selected.models);
						const modelsToAdd = models.filter((m) => !currentModels.has(m));

						if (modelsToAdd.length > 0) {
							const updatedModels = [...selected.models, ...modelsToAdd];
							await settingsStore.updateProvider(selected.id, {
								models: updatedModels,
							});
						}
						setIsDiscoveryOpen(false);
					}}
				/>
			)}
		</div>
	);
}
