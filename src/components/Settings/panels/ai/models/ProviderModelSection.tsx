/**
 * ProviderModelSection.tsx — 右侧详情区的「模型」区段
 *
 * Phase 4 · 对应 tasks.md 4.6 / R6.2。
 * - 顶部：模型总数 + 管理 / 同步 / 添加按钮（`SettingsButton` 系列）；
 * - 专家向的「模型级端点类型覆盖」统一收到一个 `SettingsDisclosure`：
 *   折叠时每行不渲染 Select，只有展开后才按模型展示覆盖下拉，避免默认暴露给普通用户；
 * - 单模型行：测试连接 / 删除（管理模式）；
 * - 底部：文档 / 模型列表外链由父组件另行承担。
 */
import {
	ChevronDown,
	ChevronRight,
	Loader2,
	Plus,
	RefreshCw,
	Trash2,
	Wifi,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { invokeLlm } from "../../../../../lib/api";
import { useSettingsStore } from "../../../../../lib/settingsStore";
import { cn } from "../../../../../lib/utils";
import Select from "../../../../ui/Select";
import { toast } from "../../../../ui/Toast";
import { getModelBadges, ModelBadge } from "../../../components";
import type { Provider } from "../../../constants";
import { settingsAnchorProps } from "../../../fieldRegistry";
import { getModelIcon } from "../../../modelIcons";
import { SettingsButton } from "../../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../../ui/SettingsDisclosure";
import {
	formatGroupName,
	getProviderColorProps,
	groupModels,
} from "../../../utils";
import {
	getModelEndpointTypes,
	isEndpointConfigurableProvider,
	type ModelEndpointSelection,
} from "./types";

export interface ProviderModelSectionProps {
	provider: Provider;
	onOpenAddModel: () => void;
	onOpenDiscovery: () => void;
}

export function ProviderModelSection({
	provider,
	onOpenAddModel,
	onOpenDiscovery,
}: ProviderModelSectionProps) {
	const { settingsStore } = useSettingsStore();
	const [isManaging, setIsManaging] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const [testingModel, setTestingModel] = useState<string | null>(null);
	const [showEndpointOverrides, setShowEndpointOverrides] = useState(false);

	// 切换到新服务商后自动展开所有分组
	useEffect(() => {
		setExpandedGroups(new Set(Object.keys(groupModels(provider.models))));
	}, [provider.id]);

	const modelGroups = groupModels(provider.models);
	const modelEndpointTypes = getModelEndpointTypes(
		provider.metadata as Record<string, unknown> | undefined,
	);
	const canConfigureEndpoint = isEndpointConfigurableProvider(
		provider.providerType,
	);

	const toggleGroup = useCallback((group: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(group)) next.delete(group);
			else next.add(group);
			return next;
		});
	}, []);

	const handleRemoveModel = useCallback(
		(model: string) => {
			settingsStore.removeModel(provider.id, model);
		},
		[provider.id, settingsStore],
	);

	const handleTestModel = useCallback(async (model: string) => {
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
	}, []);

	const handleModelEndpointChange = useCallback(
		(model: string, value: ModelEndpointSelection) => {
			const metadata = {
				...(provider.metadata || {}),
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

			settingsStore.updateProvider(provider.id, { metadata });
		},
		[provider.id, provider.metadata, settingsStore],
	);

	return (
		<section className="mb-8" {...settingsAnchorProps("ai.models.models")}>
			{/* 顶部工具条 */}
			<div className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<span className="text-sm font-medium text-text-secondary">模型</span>
					<span className="rounded-lg bg-warm-200 px-2 py-0.5 text-xs text-text-muted">
						({provider.models.length})
					</span>
				</div>
				<div className="flex items-center gap-2">
					<SettingsButton
						variant={isManaging ? "primary" : "secondary"}
						size="sm"
						pill
						onClick={() => setIsManaging((v) => !v)}
					>
						{isManaging ? "完成" : "管理"}
					</SettingsButton>
					<SettingsButton
						variant="secondary"
						size="sm"
						pill
						icon={RefreshCw}
						onClick={onOpenDiscovery}
						title="从服务商自动获取模型列表"
					>
						同步
					</SettingsButton>
					<SettingsButton
						variant="secondary"
						size="sm"
						pill
						icon={Plus}
						onClick={onOpenAddModel}
					>
						添加
					</SettingsButton>
				</div>
			</div>

			{Object.keys(modelGroups).length > 0 ? (
				<div className="space-y-3">
					{Object.entries(modelGroups).map(([groupName, models]) => {
						const expanded = expandedGroups.has(groupName);
						return (
							<div
								key={groupName}
								className="overflow-hidden rounded-2xl border border-border/80 bg-warm-50/30"
							>
								<button
									type="button"
									className="flex w-full items-center justify-between px-4 py-3 transition-[background-color] duration-150 hover:bg-warm-200/50"
									onClick={() => toggleGroup(groupName)}
								>
									<div className="flex items-center gap-2">
										{expanded ? (
											<ChevronDown className="h-4 w-4 text-text-light" />
										) : (
											<ChevronRight className="h-4 w-4 text-text-light" />
										)}
										<span className="text-sm font-medium text-text-secondary">
											{formatGroupName(groupName)}
										</span>
										<span className="text-xs text-text-light">
											({models.length})
										</span>
									</div>
								</button>
								{expanded && (
									<div className="border-t border-border/60">
										{models.map((model, idx) => (
											<ModelRow
												key={model}
												model={model}
												provider={provider}
												isLast={idx === models.length - 1}
												isManaging={isManaging}
												showEndpointSelect={
													canConfigureEndpoint && showEndpointOverrides
												}
												endpointSelection={
													modelEndpointTypes[model] ?? "inherit"
												}
												testing={testingModel === model}
												onTest={handleTestModel}
												onRemove={handleRemoveModel}
												onEndpointChange={handleModelEndpointChange}
											/>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			) : (
				<div className="rounded-2xl border border-dashed border-border bg-warm-50/50 py-12 text-center">
					<p className="text-sm text-text-light">暂无模型</p>
					<button
						type="button"
						onClick={onOpenAddModel}
						className="mt-3 text-sm text-text-secondary transition-colors duration-150 hover:text-text-primary"
					>
						添加第一个模型
					</button>
				</div>
			)}

			{canConfigureEndpoint && provider.models.length > 0 && (
				<div className="mt-4">
					<SettingsDisclosure
						id="ai.models.modelOverrides"
						title="高级：按模型覆盖端点类型"
					>
						<ExpandSyncBridge
							expanded={true}
							onChange={setShowEndpointOverrides}
						/>
						<p className="pt-3 text-xs leading-relaxed text-text-muted">
							展开后可为每个模型单独选择端点类型（兼容型 / Responses），
							未单独配置的模型会继承服务商默认端点类型。
						</p>
					</SettingsDisclosure>
				</div>
			)}
		</section>
	);
}

/**
 * 小桥组件：把 `SettingsDisclosure` 的展开态同步到父组件 state。
 * 由于 SettingsDisclosure 内部自管展开态（+ localStorage 持久化），
 * 这里挂载/卸载本身就是展开/折起的信号。
 */
function ExpandSyncBridge({
	expanded,
	onChange,
}: {
	expanded: boolean;
	onChange: (next: boolean) => void;
}) {
	useEffect(() => {
		onChange(expanded);
		return () => onChange(false);
	}, [expanded, onChange]);
	return null;
}

// =====================================================================
// ModelRow — 单条模型行
// =====================================================================

interface ModelRowProps {
	provider: Provider;
	model: string;
	isLast: boolean;
	isManaging: boolean;
	showEndpointSelect: boolean;
	endpointSelection: ModelEndpointSelection;
	testing: boolean;
	onTest: (model: string) => void;
	onRemove: (model: string) => void;
	onEndpointChange: (model: string, value: ModelEndpointSelection) => void;
}

function ModelRow({
	provider,
	model,
	isLast,
	isManaging,
	showEndpointSelect,
	endpointSelection,
	testing,
	onTest,
	onRemove,
	onEndpointChange,
}: ModelRowProps) {
	return (
		<div
			className={cn(
				"group flex items-center justify-between px-4 py-3 transition-[background-color] duration-150 hover:bg-surface",
				!isLast && "border-b border-border",
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface text-xs text-white shadow-sm">
					{getModelIcon(model) ? (
						<img
							src={getModelIcon(model)}
							alt={model}
							className="h-5 w-5 object-contain"
						/>
					) : (
						<div
							className={cn(
								"flex h-full w-full items-center justify-center",
								getProviderColorProps(provider.color).className,
							)}
							style={getProviderColorProps(provider.color).style}
						>
							{provider.icon && <provider.icon className="h-3.5 w-3.5" />}
						</div>
					)}
				</div>
				<span className="truncate text-sm font-medium text-text-primary">
					{model}
				</span>
				<div className="flex shrink-0 gap-1">
					{getModelBadges(model).map((b) => (
						<ModelBadge key={b} type={b} />
					))}
				</div>
			</div>

			{showEndpointSelect && (
				<div className="mx-3 w-36 shrink-0">
					<Select
						variant="compact"
						containerClassName="w-full"
						value={endpointSelection}
						onChange={(e) =>
							onEndpointChange(model, e.target.value as ModelEndpointSelection)
						}
					>
						<option value="inherit">继承默认</option>
						<option value="chat_completions">兼容型</option>
						<option value="responses">Responses</option>
					</Select>
				</div>
			)}

			<div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
				<button
					type="button"
					onClick={() => onTest(model)}
					disabled={testing}
					className="rounded-lg p-2 text-text-light transition-[color,background-color] duration-150 hover:bg-warm-200 hover:text-text-secondary"
					title="测试连接"
				>
					{testing ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Wifi className="h-4 w-4" />
					)}
				</button>
				{isManaging && (
					<button
						type="button"
						onClick={() => onRemove(model)}
						className="rounded-lg p-2 text-text-light transition-[color,background-color] duration-150 hover:bg-error/8 hover:text-error"
						title="删除"
					>
						<Trash2 className="h-4 w-4" />
					</button>
				)}
			</div>
		</div>
	);
}
