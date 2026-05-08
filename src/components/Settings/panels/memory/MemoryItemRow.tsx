import { Edit3, Hash, Trash2 } from "lucide-react";
import type { Memory } from "../../../../lib/agent/memoryStore";
import { SettingsButton, SettingsTextArea } from "../../ui/SettingsPrimitives";
import { cn } from "../../../../lib/utils";
import { MEMORY_CATEGORY_STYLES } from "./categoryConfig";

interface MemoryItemRowProps {
	memory: Memory;
	isEditing: boolean;
	editContent: string;
	onEditStart: () => void;
	onEditCancel: () => void;
	onEditChange: (v: string) => void;
	onEditSave: () => void;
	onDelete: () => void;
}

/**
 * 单条记忆行 —
 *  - 左侧 1.5px 分类色 ribbon（鲜明锚点）
 *  - 主体内容 + 行内 hover 浮现的编辑/删除
 *  - 元数据用细线 footer，避免和正文挤在一起
 */
export function MemoryItemRow({
	memory,
	isEditing,
	editContent,
	onEditStart,
	onEditCancel,
	onEditChange,
	onEditSave,
	onDelete,
}: MemoryItemRowProps) {
	const cat = MEMORY_CATEGORY_STYLES[memory.category];
	const dateStr = new Date(memory.updatedAt).toLocaleDateString("zh-CN");
	const lastAccess = memory.lastAccessedAt
		? new Date(memory.lastAccessedAt).toLocaleDateString("zh-CN")
		: null;
	const relevancePct =
		memory.relevanceScore > 0.5
			? `${(memory.relevanceScore * 100).toFixed(0)}%`
			: null;

	return (
		<div className="group relative flex gap-3 bg-surface px-4 py-3 transition-colors hover:bg-cream-50">
			{/* 分类 accent ribbon */}
			<span
				className="mt-1 inline-block h-[calc(100%-12px)] w-[2px] shrink-0 rounded-full"
				style={{ backgroundColor: cat.accent }}
				aria-hidden
			/>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 flex-wrap">
					<code className="rounded-md border border-border bg-cream-100 px-1.5 py-0.5 font-mono text-[11px] text-text-secondary">
						{memory.key}
					</code>
					{relevancePct && (
						<span
							className={cn(
								"inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
								cat.accentBg,
								cat.accentText,
							)}
						>
							{relevancePct} 相关
						</span>
					)}
				</div>

				{isEditing ? (
					<div className="mt-2 space-y-2">
						<SettingsTextArea
							value={editContent}
							onChange={(value) => onEditChange(value)}
							rows={3}
							minHeight={80}
						/>
						<div className="flex justify-end gap-2">
							<SettingsButton
								variant="secondary"
								size="sm"
								onClick={onEditCancel}
							>
								取消
							</SettingsButton>
							<SettingsButton variant="primary" size="sm" onClick={onEditSave}>
								保存
							</SettingsButton>
						</div>
					</div>
				) : (
					<p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">
						{memory.content}
					</p>
				)}

				{!isEditing && (
					<div className="mt-2 flex items-center gap-3 text-[10.5px] text-text-light">
						<span>更新 {dateStr}</span>
						{memory.accessCount > 0 && (
							<span className="inline-flex items-center gap-0.5">
								<Hash className="h-2.5 w-2.5" strokeWidth={1.6} />
								{memory.accessCount} 次{lastAccess ? ` · ${lastAccess}` : ""}
							</span>
						)}
					</div>
				)}
			</div>

			{!isEditing && (
				<div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100">
					<button
						type="button"
						onClick={onEditStart}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-text-light transition hover:border-border hover:bg-surface hover:text-text-secondary"
						title="编辑"
					>
						<Edit3 className="h-3.5 w-3.5" strokeWidth={1.6} />
					</button>
					<button
						type="button"
						onClick={onDelete}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-text-light transition hover:border-[rgba(181,51,51,0.32)] hover:bg-[rgba(181,51,51,0.08)] hover:text-error"
						title="删除"
					>
						<Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
					</button>
				</div>
			)}
		</div>
	);
}
