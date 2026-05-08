import type { MemoryCategory } from "../../../../lib/agent/memoryStore";
import Select from "../../../ui/Select";
import {
	SettingsButton,
	SettingsField,
	SettingsTextArea,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";
import { cn } from "../../../../lib/utils";
import {
	MEMORY_CATEGORY_OPTIONS,
	MEMORY_CATEGORY_STYLES,
} from "./categoryConfig";

interface MemoryAddInlineProps {
	newKey: string;
	newContent: string;
	newCategory: MemoryCategory;
	onKeyChange: (v: string) => void;
	onContentChange: (v: string) => void;
	onCategoryChange: (v: MemoryCategory) => void;
	onSave: () => void;
	onCancel: () => void;
}

/**
 * 内联新增记忆表单 — 出现在搜索栏和列表之间。
 *
 * 视觉：弱边框 + 当前所选分类的 accent 浅底，让用户对将存入的分类有视觉预期。
 */
export function MemoryAddInline({
	newKey,
	newContent,
	newCategory,
	onKeyChange,
	onContentChange,
	onCategoryChange,
	onSave,
	onCancel,
}: MemoryAddInlineProps) {
	const categoryStyle = MEMORY_CATEGORY_STYLES[newCategory];
	return (
		<div
			className={cn(
				"rounded-2xl border bg-surface p-4 animate-in slide-in-from-top-2 duration-200",
				categoryStyle.accentBorder,
			)}
		>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
				<SettingsField label="标识 Key" hint="使用英文与下划线，便于检索。">
					<SettingsTextInput
						value={newKey}
						onChange={(value) => onKeyChange(value)}
						placeholder="如 user_writing_style"
						mono
					/>
				</SettingsField>
				<SettingsField label="分类" hint="决定 Agent 引用时的优先级。">
					<Select
						value={newCategory}
						onChange={(e) => onCategoryChange(e.target.value as MemoryCategory)}
						variant="default"
						options={MEMORY_CATEGORY_OPTIONS.map((opt) => ({
							value: opt.value,
							label: opt.label,
						}))}
					/>
				</SettingsField>
			</div>
			<SettingsField
				label="内容"
				hint="完整描述这条记忆，越具体 Agent 命中率越高。"
			>
				<SettingsTextArea
					value={newContent}
					onChange={(value) => onContentChange(value)}
					placeholder="例如：用户偏好简洁的代码注释，避免冗长的描述…"
					rows={3}
					minHeight={88}
				/>
			</SettingsField>
			<div className="mt-2 flex items-center justify-end gap-2">
				<SettingsButton variant="secondary" onClick={onCancel}>
					取消
				</SettingsButton>
				<SettingsButton variant="primary" onClick={onSave}>
					添加记忆
				</SettingsButton>
			</div>
		</div>
	);
}
