/**
 * AddProviderModal.tsx — 创建自定义服务商的弹窗
 *
 * Phase 4 · 对应 tasks.md 4.7。
 * - 名称输入与类型下拉替换成 SettingsTextInput / Select；
 * - 底部按钮统一用 SettingsButton；
 * - 创建成功后由父组件负责关闭弹窗并选中新建的服务商。
 */
import { useState } from "react";
import { useSettingsStore } from "../../../../../lib/settingsStore";
import Select from "../../../../ui/Select";
import { toast } from "../../../../ui/Toast";
import { Modal } from "../../../components";
import { PROVIDER_TEMPLATES } from "../../../constants";
import { ProviderType } from "../../../../../types";
import { SettingsButton } from "../../../ui/SettingsPrimitives";
import { SettingsTextInput } from "../../../ui/SettingsPrimitives";

export interface AddProviderModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreated: (id: string) => void;
}

export function AddProviderModal({
	isOpen,
	onClose,
	onCreated,
}: AddProviderModalProps) {
	const { settingsStore } = useSettingsStore();
	const [providerName, setProviderName] = useState("");
	const [providerType, setProviderType] = useState<ProviderType>(
		ProviderType.OpenAi,
	);
	const [isCreating, setIsCreating] = useState(false);

	const handleClose = () => {
		if (isCreating) return;
		setProviderName("");
		onClose();
	};

	const handleCreate = async () => {
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
			setProviderName("");
			onClose();
			if (created?.id) onCreated(created.id);
		} catch (e) {
			toast.error(`创建失败: ${e}`);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={handleClose} title="添加提供商">
			<div className="mb-8 flex justify-center">
				<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-warm-200 text-3xl font-bold text-text-light shadow-inner">
					{providerName?.[0]?.toUpperCase() || "P"}
				</div>
			</div>
			<div className="space-y-5">
				<div>
					<label className="mb-2 block text-sm font-medium text-text-secondary">
						提供商名称
					</label>
					<SettingsTextInput
						value={providerName}
						onChange={setProviderName}
						placeholder="例如 OpenAI"
						size="lg"
						aria-label="提供商名称"
					/>
				</div>
				<div>
					<label className="mb-2 block text-sm font-medium text-text-secondary">
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
			<div className="mt-8 flex justify-end gap-3">
				<SettingsButton
					variant="ghost"
					size="md"
					pill={false}
					onClick={handleClose}
					disabled={isCreating}
				>
					取消
				</SettingsButton>
				<SettingsButton
					variant="primary"
					size="md"
					pill={false}
					onClick={handleCreate}
					loading={isCreating}
					disabled={!providerName.trim()}
				>
					确定
				</SettingsButton>
			</div>
		</Modal>
	);
}
