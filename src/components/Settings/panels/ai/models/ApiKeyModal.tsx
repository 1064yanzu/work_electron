/**
 * ApiKeyModal.tsx — 管理多 API 密钥的弹窗
 *
 * Phase 4 · 对应 tasks.md 4.7。
 * - 沿用项目已有的 Modal + SettingsButton + SettingsTextArea；
 * - 外部通过 `initialKeys` 传入当前的多密钥字符串，弹窗关闭时通过 `onSave` 回写；
 * - 保存时用 `normalizeApiKeys` 做去重和清理，与原 ModelSettings 行为一致。
 */
import { useEffect, useState } from "react";
import { Modal } from "../../../components";
import { SettingsButton } from "../../../ui/SettingsPrimitives";
import { SettingsTextArea } from "../../../ui/SettingsPrimitives";
import { normalizeApiKeys } from "./types";

export interface ApiKeyModalProps {
	isOpen: boolean;
	initialValue: string;
	onClose: () => void;
	onSave: (joined: string) => void;
}

export function ApiKeyModal({
	isOpen,
	initialValue,
	onClose,
	onSave,
}: ApiKeyModalProps) {
	const [draft, setDraft] = useState(initialValue);

	// 每次打开弹窗重置 draft 为最新值
	useEffect(() => {
		if (isOpen) {
			setDraft(normalizeApiKeys(initialValue).join("\n"));
		}
	}, [isOpen, initialValue]);

	const handleSave = () => {
		const keys = normalizeApiKeys(draft);
		onSave(keys.join(","));
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="管理 API 密钥">
			<div className="space-y-5">
				<div>
					<label className="mb-2 block text-sm font-medium text-text-secondary">
						密钥列表
					</label>
					<SettingsTextArea
						value={draft}
						onChange={setDraft}
						placeholder="每行一个密钥"
						rows={6}
						mono
						aria-label="API 密钥列表"
					/>
					<p className="mt-2 text-xs text-text-light">
						支持逗号或换行分隔，系统会自动去重
					</p>
				</div>
			</div>
			<div className="mt-8 flex justify-end gap-3">
				<SettingsButton variant="ghost" size="md" onClick={onClose} pill={false}>
					取消
				</SettingsButton>
				<SettingsButton
					variant="primary"
					size="md"
					onClick={handleSave}
					pill={false}
				>
					保存
				</SettingsButton>
			</div>
		</Modal>
	);
}
