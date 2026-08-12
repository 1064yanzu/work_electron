/**
 * StorageSection — Vault 根目录 + Obsidian 互通 + 冲突策略 + 数据目录概要
 *
 * 对应 `data.storage` 面板的「存储与互通」卡片。
 * 设计要点：
 *   - Vault 根与「打开目录」按钮常驻；Frontmatter/WikiLink/冲突策略收到
 *     `SettingsDisclosure id="data.storage.advanced"` 下。
 *   - 每个字段容器挂 `id={anchorId}` + `data-settings-anchor`，供 SettingsSearch 滚定位。
 *   - 原子组件复用 `SettingsSectionCard` / `SettingsRow` / `SettingsSwitch` /
 *     `SettingsButton` / `SettingsHint`，禁用手写 button 样式与 `transition-[color,background-color,border-color,box-shadow]`。
 */
import { FolderOpen, HardDrive } from "lucide-react";
import { useCallback } from "react";
import {
	pickStorageDirectory,
	revealVaultRoot,
	type StorageSettings,
} from "../../../../../lib/api";
import { confirmDialog as confirmUI } from "../../../../ui/ConfirmDialog";
import { toast } from "../../../../ui/Toast";
import { Select } from "../../../../ui/Select";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsRow,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../../ui/SettingsDisclosure";

interface StorageSectionProps {
	storageSettings: StorageSettings;
	onUpdate: (
		updates: Partial<StorageSettings>,
		options?: { migrate_existing?: boolean },
	) => Promise<void>;
	isUpdating: boolean;
}

export function StorageSection({
	storageSettings,
	onUpdate,
	isUpdating,
}: StorageSectionProps) {
	const handlePickVault = useCallback(async () => {
		const picked = await pickStorageDirectory();
		if (!picked.path) return;
		const confirmed = await confirmUI.warning(
			`确定要迁移到新的 Vault 目录吗？\n\n${picked.path}\n\n将自动备份并把资料与文档迁移过去。`,
			"迁移 Vault",
		);
		if (!confirmed) return;
		try {
			await onUpdate({ vault_root: picked.path }, { migrate_existing: true });
			toast.success("Vault 目录迁移完成");
		} catch (error) {
			toast.error(
				`迁移失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [onUpdate]);

	const handleRevealVault = useCallback(async () => {
		const result = await revealVaultRoot();
		if (!result.success) {
			toast.error(result.error || "打开目录失败");
		}
	}, []);

	return (
		<SettingsCardSection title="存储与互通" bodyClassName="p-5 space-y-2">
			<div
				id="data.storage.vault_root"
				data-settings-anchor="data.storage.vault_root"
			>
				<SettingsRow
					label="Vault 根目录"
					description={storageSettings.vault_root}
					action={
						<div className="flex items-center gap-2">
							<SettingsButton
								icon={FolderOpen}
								onClick={handlePickVault}
								disabled={isUpdating}
							>
								选择目录
							</SettingsButton>
							<SettingsButton
								icon={HardDrive}
								variant="ghost"
								onClick={handleRevealVault}
							>
								打开目录
							</SettingsButton>
						</div>
					}
				/>
			</div>

			<SettingsDisclosure
				id="data.storage.advanced"
				title="Obsidian 互通与冲突策略"
			>
				<div className="rounded-xl border border-border/70 bg-cream-50/60 px-4 py-2">
					<div
						id="data.storage.obsidian_frontmatter"
						data-settings-anchor="data.storage.obsidian_frontmatter"
					>
						<SettingsRow
							label="Obsidian Frontmatter"
							description="为 Markdown 文件写入 YAML 元信息，方便被 Obsidian 索引"
							action={
								<SettingsSwitch
									checked={storageSettings.obsidian_frontmatter}
									onChange={(v) => void onUpdate({ obsidian_frontmatter: v })}
									disabled={isUpdating}
								/>
							}
						/>
					</div>
					<div
						id="data.storage.obsidian_wiki_links"
						data-settings-anchor="data.storage.obsidian_wiki_links"
					>
						<SettingsRow
							label="Wiki Link"
							description="优先使用 [[文档]] 互链风格"
							action={
								<SettingsSwitch
									checked={storageSettings.obsidian_wiki_links}
									onChange={(v) => void onUpdate({ obsidian_wiki_links: v })}
									disabled={isUpdating}
								/>
							}
						/>
					</div>
					<div
						id="data.storage.conflict_strategy"
						data-settings-anchor="data.storage.conflict_strategy"
					>
						<SettingsRow
							label="重名冲突策略"
							description="同名文件存在时的处理方式"
							action={
								<Select
									value={storageSettings.conflict_strategy}
									onChange={(e) =>
										void onUpdate({
											conflict_strategy: e.target
												.value as StorageSettings["conflict_strategy"],
										})
									}
									disabled={isUpdating}
									variant="inline"
									containerClassName="w-auto"
									options={[
										{ value: "append_suffix", label: "追加后缀" },
										{ value: "prevent_overwrite", label: "阻止覆盖" },
									]}
								/>
							}
						/>
					</div>
				</div>
			</SettingsDisclosure>
		</SettingsCardSection>
	);
}
