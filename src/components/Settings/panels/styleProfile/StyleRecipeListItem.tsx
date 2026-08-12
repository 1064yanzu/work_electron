/**
 * StyleRecipeListItem — 混搭配方列表项
 *
 * 展示配方名称、各层级来源标注，支持选中/删除操作。
 */
import { Blend, Check, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { StyleProfileRecipe } from "../../../../../electron/shared/ipc-schema";

interface Props {
	recipe: StyleProfileRecipe;
	isActive: boolean;
	onSetActive: () => void;
	onDelete: () => void;
}

const LAYER_DISPLAY = [
	// v2 层级
	{
		key: "soul_profile_name" as const,
		label: "灵魂",
		color: "text-violet-500 dark:text-violet-400",
	},
	{
		key: "thinking_profile_name" as const,
		label: "思维",
		color: "text-blue-500 dark:text-blue-400",
	},
	{
		key: "articulation_profile_name" as const,
		label: "篇章",
		color: "text-cyan-500 dark:text-cyan-400",
	},
	{
		key: "texture_profile_name" as const,
		label: "血肉",
		color: "text-amber-500 dark:text-amber-400",
	},
	{
		key: "relational_profile_name" as const,
		label: "关系",
		color: "text-emerald-500 dark:text-emerald-400",
	},
	// v1 层级（向后兼容旧配方）
	{
		key: "cognitive_profile_name" as const,
		label: "认知",
		color: "text-blue-500 dark:text-blue-400",
	},
	{
		key: "rhetorical_profile_name" as const,
		label: "话语",
		color: "text-emerald-500 dark:text-emerald-400",
	},
	{
		key: "aesthetic_profile_name" as const,
		label: "审美",
		color: "text-violet-500 dark:text-violet-400",
	},
	{
		key: "anchors_profile_name" as const,
		label: "锚点",
		color: "text-amber-500 dark:text-amber-400",
	},
] as const;

export function StyleRecipeListItem({
	recipe,
	isActive,
	onSetActive,
	onDelete,
}: Props) {
	const [confirmDelete, setConfirmDelete] = useState(false);

	const handleDelete = useCallback(() => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			setTimeout(() => setConfirmDelete(false), 3000);
			return;
		}
		onDelete();
	}, [confirmDelete, onDelete]);

	// 收集使用的层级标签
	const usedLayers = LAYER_DISPLAY.filter((l) => recipe[l.key]);

	return (
		<div
			className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
				isActive
					? "border-amber-400/40 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10"
					: "border-cream-200/70 dark:border-cream-600/30 bg-transparent hover:bg-cream-50 dark:hover:bg-cream-800/20 hover:border-cream-300 dark:hover:border-cream-500/40"
			}`}
		>
			{/* Radio 选择器 */}
			<button
				type="button"
				onClick={onSetActive}
				className="mt-0.5 shrink-0"
				title={isActive ? "当前已激活" : "点击激活此配方"}
			>
				<div
					className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ${
						isActive
							? "border-amber-600 dark:border-amber-400"
							: "border-cream-300 dark:border-cream-500/60"
					}`}
				>
					{isActive && (
						<div className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400" />
					)}
				</div>
			</button>

			{/* 内容 */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<Blend
						className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0"
						strokeWidth={1.5}
					/>
					<span
						className={`text-sm font-medium truncate ${
							isActive ? "text-text-primary" : "text-text-secondary"
						}`}
					>
						{recipe.name}
					</span>
					{isActive && (
						<Check
							className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0"
							strokeWidth={2.5}
						/>
					)}
				</div>

				{recipe.description && (
					<div className="mt-0.5 text-xs text-text-muted truncate">
						{recipe.description}
					</div>
				)}

				{/* 层级来源标注 */}
				{usedLayers.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1.5">
						{usedLayers.map((layer) => (
							<span
								key={layer.key}
								className="inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-0.5 rounded-md bg-cream-100/80 dark:bg-cream-800/50 border border-cream-200/50 dark:border-cream-600/20"
							>
								<span className={`font-medium ${layer.color}`}>
									{layer.label}
								</span>
								<span className="text-text-muted">
									{recipe[layer.key]?.slice(0, 6) ?? ""}
								</span>
							</span>
						))}
					</div>
				)}
			</div>

			{/* 删除按钮 */}
			<button
				type="button"
				onClick={handleDelete}
				title={confirmDelete ? "再次点击确认删除" : "删除配方"}
				className={`shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-lg transition-colors duration-150 ${
					confirmDelete
						? "text-red-500 bg-red-50 dark:bg-red-900/20"
						: "text-text-muted/40 hover:text-red-500 hover:bg-cream-100 dark:hover:bg-cream-800/40"
				}`}
			>
				<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
			</button>
		</div>
	);
}
