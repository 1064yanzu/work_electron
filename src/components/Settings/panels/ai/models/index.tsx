/**
 * panels/ai/models/index.tsx — ModelSettings 组合层（Phase 4 入口）
 *
 * Phase 4 · 对应 tasks.md 4.1 / 4.7 / 4.9 / R9.1 / R9.2。
 * - 本文件承担「顶层状态 + Modal 开关 + 各子组件组合」的角色；
 * - 把原 `panels/ModelSettings.tsx` 的副作用（自动选中第一个服务商）保留；
 * - 删除、打开弹窗、Discovery 模型合并等写操作留在 index 里，便于共享 `selected` 引用；
 * - 字段级改动（API Key / API Base / 模型 CRUD）全部下沉到对应子组件里。
 *
 * 单文件行数保持在 ≤ 400（实际约 220），子组件平均 100–280。
 */
import { Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "../../../../../lib/settingsStore";
import { ModelDiscoveryModal } from "../../../components";
import { confirmDialog } from "../../../../ui/ConfirmDialog";
import { toast } from "../../../../ui/Toast";
import { settingsAnchorProps } from "../../../fieldRegistry";
import { getTemplateForProvider, openUrl } from "../../../utils";
import { SettingsPanelHeader } from "../../../components/SettingsPanelHeader";
import { AddModelModal } from "./AddModelModal";
import { AddProviderModal } from "./AddProviderModal";
import { ApiKeyModal } from "./ApiKeyModal";
import { ProviderApiBaseSection } from "./ProviderApiBaseSection";
import { ProviderApiKeySection } from "./ProviderApiKeySection";
import { ProviderDetailHeader } from "./ProviderDetailHeader";
import { ProviderList } from "./ProviderList";
import { ProviderModelSection } from "./ProviderModelSection";

export function ModelSettings() {
	const { providers, settingsStore } = useSettingsStore();

	// 基础状态
	const [selectedId, setSelectedId] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");

	// Modal 开关
	const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
	const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
	const [isAddModelOpen, setIsAddModelOpen] = useState(false);
	const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

	const [isDeleting, setIsDeleting] = useState(false);

	// 初始化：选中第一个服务商
	useEffect(() => {
		if (providers.length > 0 && !selectedId) {
			setSelectedId(providers[0].id);
		}
	}, [providers, selectedId]);

	const selected = providers.find((p) => p.id === selectedId);
	const template = selected ? getTemplateForProvider(selected) : undefined;
	const docsUrl = template?.docsUrl;
	const modelsUrl = template?.modelsUrl;

	const handleToggle = useCallback(
		(id: string) => {
			const p = providers.find((x) => x.id === id);
			if (p) settingsStore.updateProvider(id, { isEnabled: !p.isEnabled });
		},
		[providers, settingsStore],
	);

	const handleSaveApiKey = useCallback(
		(joined: string) => {
			if (!selected) return;
			settingsStore.updateProvider(selected.id, { apiKey: joined });
			setIsApiKeyModalOpen(false);
		},
		[selected, settingsStore],
	);

	const handleAddModel = useCallback(
		(modelId: string) => {
			if (!selected) return;
			settingsStore.addModel(selected.id, modelId);
			setIsAddModelOpen(false);
		},
		[selected, settingsStore],
	);

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

	return (
		// 本页是 master-detail（左列表 / 右详情），不走 SettingsPageContainer 的单列布局，
		// 但页面 H1 标题要和其它二级页保持一致，所以在分栏之上单独起一行
		<div
			className="flex min-h-0 flex-1 flex-col"
			style={{ backgroundColor: "var(--t-bg)" }}
		>
			<div className="shrink-0 px-10 pt-10">
				<SettingsPanelHeader
					title="服务商与模型"
					description="配置各家 API 的密钥与可用模型。左侧选择服务商，右侧编辑它的接入信息。"
				/>
			</div>

			<div className="flex min-h-0 flex-1 border-t border-border">
				{/* 左侧：服务商列表 */}
				<div
					className="flex min-h-0 shrink-0"
					{...settingsAnchorProps("ai.models.providerList")}
				>
					<ProviderList
						providers={providers}
						selectedId={selectedId}
						searchQuery={searchQuery}
						onSearchChange={setSearchQuery}
						onSelect={setSelectedId}
						onAdd={() => setIsAddProviderOpen(true)}
					/>
				</div>

				{/* 右侧：配置详情 */}
				<div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-surface">
					{selected ? (
						<div className="max-w-2xl p-8">
							<ProviderDetailHeader
								provider={selected}
								onToggle={handleToggle}
							/>

							<ProviderApiKeySection
								provider={selected}
								onOpenManageModal={() => setIsApiKeyModalOpen(true)}
							/>

							<ProviderApiBaseSection provider={selected} />

							<ProviderModelSection
								provider={selected}
								onOpenAddModel={() => setIsAddModelOpen(true)}
								onOpenDiscovery={() => setIsDiscoveryOpen(true)}
							/>

							{(docsUrl || modelsUrl) && (
								<p className="mb-8 text-xs text-text-light">
									{docsUrl && (
										<>
											查看{" "}
											<button
												type="button"
												onClick={() => openUrl(docsUrl)}
												className="text-text-secondary transition-colors duration-150 hover:text-text-primary hover:underline"
											>
												{selected.name} 文档
											</button>
										</>
									)}
									{docsUrl && modelsUrl ? " 和 " : ""}
									{modelsUrl && (
										<button
											type="button"
											onClick={() => openUrl(modelsUrl)}
											className="text-text-secondary transition-colors duration-150 hover:text-text-primary hover:underline"
										>
											模型列表
										</button>
									)}{" "}
									获取更多详情
								</p>
							)}

							<div className="border-t border-border/80 pt-8">
								<button
									type="button"
									onClick={handleDelete}
									disabled={isDeleting}
									className="-ml-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-error transition-[color,background-color] duration-150 hover:bg-error/8"
								>
									<Trash2 className="h-4 w-4" />
									{isDeleting ? "删除中…" : "删除此服务商"}
								</button>
							</div>
						</div>
					) : (
						<div className="flex h-full items-center justify-center">
							<div className="text-center">
								<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warm-200">
									<Settings className="h-8 w-8 text-text-light" />
								</div>
								<p className="text-text-muted">选择一个服务商进行配置</p>
							</div>
						</div>
					)}
				</div>

				{/* 弹窗 */}
				<AddProviderModal
					isOpen={isAddProviderOpen}
					onClose={() => setIsAddProviderOpen(false)}
					onCreated={(id) => setSelectedId(id)}
				/>

				<ApiKeyModal
					isOpen={isApiKeyModalOpen}
					initialValue={selected?.apiKey || ""}
					onClose={() => setIsApiKeyModalOpen(false)}
					onSave={handleSaveApiKey}
				/>

				<AddModelModal
					isOpen={isAddModelOpen}
					onClose={() => setIsAddModelOpen(false)}
					onConfirm={handleAddModel}
				/>

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
		</div>
	);
}

export default ModelSettings;
