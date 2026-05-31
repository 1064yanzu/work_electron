/**
 * StyleProfileCreateModal — 新建风格包对话框
 *
 * 使用全局 Modal 组件，对齐 B.AI 暖调极简设计规范。
 */
import { useCallback, useRef, useState } from "react";
import { createStyleProfile } from "../../../../lib/api/styleProfile";
import { Modal } from "../../../ui/Modal";
import {
	SettingsTextInput,
	SettingsTextArea,
} from "../../ui/SettingsPrimitives";

interface Props {
	onClose: () => void;
	/** 传入新建的 profile ID，用于面板自动展开 */
	onCreated: (profileId: string) => void;
}

const LANGUAGE_OPTIONS = [
	{ value: "zh", label: "中文" },
	{ value: "en", label: "英文" },
	{ value: "zh-en", label: "中英混合" },
] as const;

export function StyleProfileCreateModal({ onClose, onCreated }: Props) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [language, setLanguage] = useState("zh");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = useCallback(async () => {
		if (!name.trim()) {
			setError("风格包名称不能为空");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const profile = await createStyleProfile({
				name: name.trim(),
				description: description.trim() || undefined,
				language,
			});
			onCreated(profile.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : "创建失败");
		} finally {
			setSaving(false);
		}
	}, [name, description, language, onCreated]);

	const footer = (
		<>
			<button
				type="button"
				onClick={onClose}
				className="px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:text-text-primary hover:bg-warm-200/70 dark:hover:bg-cream-700/40 transition-colors duration-150"
			>
				取消
			</button>
			<button
				type="button"
				onClick={() => void handleSubmit()}
				disabled={saving}
				className="px-5 py-2 text-sm font-medium rounded-full bg-cream-900 dark:bg-cream-100 text-cream-50 dark:text-cream-900 hover:opacity-90 disabled:opacity-50 transition-opacity duration-150"
			>
				{saving ? "创建中…" : "创建风格包"}
			</button>
		</>
	);

	return (
		<Modal
			isOpen
			onClose={onClose}
			title="新建语言风格包"
			size="sm"
			footer={footer}
			initialFocusRef={nameInputRef}
		>
			<div className="space-y-5">
				<div>
					<label className="mb-1.5 block text-xs font-medium text-text-secondary">
						名称 <span className="text-peach-500">*</span>
					</label>
					<SettingsTextInput
						value={name}
						onChange={(v) => setName(v)}
						placeholder="例如：科技博客风格"
					/>
				</div>

				<div>
					<label className="mb-1.5 block text-xs font-medium text-text-secondary">
						描述
						<span className="ml-1 text-text-muted font-normal">可选</span>
					</label>
					<SettingsTextArea
						value={description}
						onChange={(v) => setDescription(v)}
						placeholder="简述这个风格包的用途或特点"
						rows={3}
					/>
				</div>

				<div>
					<label className="mb-1.5 block text-xs font-medium text-text-secondary">
						语言
					</label>
					<div className="flex gap-2">
						{LANGUAGE_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => setLanguage(opt.value)}
								className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors duration-150 ${
									language === opt.value
										? "border-cream-900/30 dark:border-cream-300/30 bg-cream-900/8 dark:bg-cream-100/8 text-text-primary"
										: "border-cream-300 dark:border-cream-500/50 text-text-secondary hover:text-text-primary hover:border-cream-400 dark:hover:border-cream-400/50"
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>

				{error && (
					<p className="text-xs text-peach-600 dark:text-peach-400 bg-peach-50 dark:bg-peach-900/20 rounded-lg px-3 py-2">
						{error}
					</p>
				)}
			</div>
		</Modal>
	);
}
