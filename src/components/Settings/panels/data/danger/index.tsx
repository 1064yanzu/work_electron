/**
 * panels/data/danger/index.tsx — 「危险区」二级 Tab
 *
 * 承载从原 `DataSettings` 拆出的"清空全部数据"不可逆操作：
 *   - 顶部头部提示
 *   - `SettingsHint tone="error"` 强提示列出清空范围
 *   - 输入 `DELETE ALL` 确认短语 + 确认按钮
 *
 * 所有 UI 走统一原子组件 `SettingsHint` / `SettingsTextInput` / `SettingsButton`，
 * 禁止 `transition-[color,background-color,border-color,box-shadow]` 与手写样式。
 */
import { ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { clearAllData } from "../../../../../lib/api";
import { toast } from "../../../../ui/Toast";
import { SettingsPanelHeader } from "../../../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsHint,
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsTextInput,
} from "../../../ui/SettingsPrimitives";

const CONFIRM_PHRASE = "DELETE ALL";

export function DataDangerSettings() {
	const [confirmPhrase, setConfirmPhrase] = useState("");
	const [isClearing, setIsClearing] = useState(false);

	const phraseOk = confirmPhrase.trim().toUpperCase() === CONFIRM_PHRASE;

	const handleClear = async () => {
		if (!phraseOk) return;
		setIsClearing(true);
		try {
			await clearAllData();
			toast.success("所有数据已删除，页面即将刷新", 1800);
			setTimeout(() => window.location.reload(), 1800);
		} catch (error) {
			toast.error(
				`重置失败：${error instanceof Error ? error.message : String(error)}`,
			);
			setIsClearing(false);
		}
	};

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={ShieldAlert}
				title="危险区"
				description="这里的操作不可撤销。执行前请先用 WebDAV / 本地备份导出你的数据。"
			/>

			<SettingsHint
				tone="error"
				icon={ShieldAlert}
				title="清空全部数据将移除以下内容"
			>
				<ul className="mt-1 space-y-1 text-xs leading-relaxed">
					<li>• 所有资料、笔记与同步配置</li>
					<li>• 所有工作流与输出文稿</li>
					<li>• 所有模型服务商配置</li>
					<li>• 应用内的个性化设置（主题、桌宠、偏好等）</li>
				</ul>
			</SettingsHint>

			<SettingsSectionCard className="ring-1 ring-[rgba(181,51,51,0.2)]">
				<div
					className="p-5 space-y-4"
					id="data.danger.clear_all"
					data-settings-anchor="data.danger.clear_all"
				>
					<SettingsSectionTitle className="text-error">
						清空全部数据
					</SettingsSectionTitle>
					<p className="text-xs leading-relaxed text-text-muted">
						请输入
						<span className="mx-1 font-mono font-semibold text-error">
							{CONFIRM_PHRASE}
						</span>
						以确认执行。操作无法撤销，执行后页面会自动刷新。
					</p>
					<SettingsTextInput
						value={confirmPhrase}
						onChange={setConfirmPhrase}
						placeholder={CONFIRM_PHRASE}
						disabled={isClearing}
						autoComplete="off"
						aria-label="确认短语"
					/>
					<div className="flex justify-end">
						<SettingsButton
							variant="danger-solid"
							icon={Trash2}
							loading={isClearing}
							disabled={!phraseOk || isClearing}
							onClick={() => void handleClear()}
						>
							{isClearing ? "重置中…" : "确认重置全部数据"}
						</SettingsButton>
					</div>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}

export default DataDangerSettings;
