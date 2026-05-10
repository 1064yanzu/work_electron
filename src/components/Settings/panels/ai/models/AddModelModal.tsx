/**
 * AddModelModal.tsx — 向服务商手动添加模型的弹窗
 *
 * Phase 4 · 对应 tasks.md 4.7。
 */
import { useState } from "react";
import { Modal } from "../../../components";
import { SettingsButton } from "../../../ui/SettingsPrimitives";
import { SettingsTextInput } from "../../../ui/SettingsPrimitives";

export interface AddModelModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (modelId: string) => void;
}

export function AddModelModal({
	isOpen,
	onClose,
	onConfirm,
}: AddModelModalProps) {
	const [modelId, setModelId] = useState("");

	const handleClose = () => {
		setModelId("");
		onClose();
	};

	const handleConfirm = () => {
		const trimmed = modelId.trim();
		if (!trimmed) return;
		onConfirm(trimmed);
		setModelId("");
	};

	return (
		<Modal isOpen={isOpen} onClose={handleClose} title="添加模型">
			<div className="space-y-5">
				<div>
					<label className="mb-2 block text-sm font-medium text-text-secondary">
						模型 ID <span className="text-error">*</span>
					</label>
					<SettingsTextInput
						value={modelId}
						onChange={setModelId}
						placeholder="例如 gpt-4o-mini"
						mono
						size="lg"
						aria-label="模型 ID"
						onKeyDown={(e) => {
							if (e.key === "Enter" && modelId.trim()) {
								e.preventDefault();
								handleConfirm();
							}
						}}
					/>
					<p className="mt-2 text-xs text-text-light">
						请输入模型的完整 ID，如 gpt-4o、claude-3-5-sonnet-20241022
					</p>
				</div>
			</div>
			<div className="mt-8 flex justify-end gap-3">
				<SettingsButton
					variant="ghost"
					size="md"
					pill={false}
					onClick={handleClose}
				>
					取消
				</SettingsButton>
				<SettingsButton
					variant="primary"
					size="md"
					onClick={handleConfirm}
					disabled={!modelId.trim()}
				>
					添加模型
				</SettingsButton>
			</div>
		</Modal>
	);
}
