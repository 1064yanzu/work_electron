/**
 * ProviderApiKeySection.tsx — API 密钥 + 测试 + 多密钥管理按钮
 *
 * Phase 4 · 对应 tasks.md 4.4。
 * - 密钥输入改用 `SettingsPasswordInput`（R3.7），内置显示 / 隐藏；
 * - 「管理」按钮改用 `SettingsButton`；
 * - 「检测」按钮沿用项目已有的 `CheckButton`；
 * - 失败 / 成功反馈仍由 `CheckButton` 的状态承接，与原 ModelSettings 一致。
 */
import { useCallback, useState } from "react";
import { checkProviderApiKey } from "../../../../../lib/api";
import { useSettingsStore } from "../../../../../lib/settingsStore";
import type { Provider } from "../../../constants";
import { CheckButton, type CheckStatus } from "../../../components";
import { SettingsButton } from "../../../ui/SettingsPrimitives";
import { SettingsPasswordInput } from "../../../ui/SettingsPrimitives";
import { getTemplateForProvider, openUrl } from "../../../utils";
import { settingsAnchorProps } from "../../../fieldRegistry";

export interface ProviderApiKeySectionProps {
	provider: Provider;
	onOpenManageModal: () => void;
}

export function ProviderApiKeySection({
	provider,
	onOpenManageModal,
}: ProviderApiKeySectionProps) {
	const { settingsStore } = useSettingsStore();
	const [checkStatus, setCheckStatus] = useState<CheckStatus>("idle");

	const template = getTemplateForProvider(provider);
	const apiKeyUrl = template?.apiKeyUrl || template?.docsUrl;

	const handleCheck = useCallback(async () => {
		setCheckStatus("checking");
		try {
			const result = await checkProviderApiKey(provider.id);
			setCheckStatus(result.valid ? "success" : "error");
		} catch {
			setCheckStatus("error");
		}
		setTimeout(() => setCheckStatus("idle"), 3000);
	}, [provider.id]);

	return (
		<div className="mb-8" {...settingsAnchorProps("ai.models.apiKey")}>
			<div className="mb-3 flex items-center justify-between">
				<label className="text-sm font-medium text-text-secondary">
					API 密钥
				</label>
				<SettingsButton
					variant="secondary"
					size="sm"
					pill
					onClick={onOpenManageModal}
				>
					管理
				</SettingsButton>
			</div>
			<div className="flex gap-3">
				<div className="flex-1">
					<SettingsPasswordInput
						value={provider.apiKey || ""}
						onChange={(next) =>
							settingsStore.updateProvider(provider.id, { apiKey: next })
						}
						placeholder="sk-..."
						mono
						size="lg"
						aria-label="API 密钥"
					/>
				</div>
				<CheckButton status={checkStatus} onClick={handleCheck} />
			</div>
			<p className="mt-2 text-xs text-text-light">
				支持多个密钥，用逗号或换行分隔
			</p>
			{apiKeyUrl && (
				<button
					type="button"
					onClick={() => openUrl(apiKeyUrl)}
					className="mt-3 text-sm text-text-secondary transition-colors duration-150 hover:text-text-primary hover:underline"
				>
					点击这里获取密钥 →
				</button>
			)}
		</div>
	);
}
