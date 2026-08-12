/**
 * ThemesManagerSection — 主题目录 CRUD
 *
 * 对应 `data.storage` 面板的「主题目录」卡片。
 *   - 新增（输入后回车或点击新增按钮）
 *   - 重命名（行内按钮弹窗）
 *   - 删除（行内按钮 + `confirmUI.danger`）
 *
 * 使用原子组件 `SettingsSectionCard` / `SettingsTextInput` / `SettingsButton` /
 * `SettingsHint`；禁止 `transition-[color,background-color,border-color,box-shadow]` 与手写 `<input>`。
 */
import { useCallback, useState } from "react";
import {
	createTheme,
	deleteTheme,
	listThemes,
	renameTheme,
	type Theme,
} from "../../../../../lib/api";
import { confirmDialog as confirmUI } from "../../../../ui/ConfirmDialog";
import { Modal } from "../../../../ui/Modal";
import { toast } from "../../../../ui/Toast";
import {
	SettingsButton,
	SettingsHint,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsTextInput,
} from "../../../ui/SettingsPrimitives";

interface ThemesManagerSectionProps {
	themes: Theme[];
	onThemesChange: (themes: Theme[]) => void;
}

export function ThemesManagerSection({
	themes,
	onThemesChange,
}: ThemesManagerSectionProps) {
	const [newThemeName, setNewThemeName] = useState("");
	const [themeBeingRenamed, setThemeBeingRenamed] = useState<Theme | null>(
		null,
	);
	const [renameName, setRenameName] = useState("");

	const reload = useCallback(async () => {
		const next = await listThemes();
		onThemesChange(next);
	}, [onThemesChange]);

	const handleAdd = useCallback(async () => {
		const name = newThemeName.trim();
		if (!name) return;
		try {
			await createTheme(name);
			setNewThemeName("");
			await reload();
			toast.success("主题已创建");
		} catch (error) {
			console.error("创建主题失败:", error);
			toast.error(`创建主题失败：${String(error)}`);
		}
	}, [newThemeName, reload]);

	const handleRename = useCallback(async () => {
		if (!themeBeingRenamed) return;
		const nextName = renameName.trim();
		if (!nextName) return;
		try {
			await renameTheme(themeBeingRenamed.id, nextName);
			await reload();
			setThemeBeingRenamed(null);
			setRenameName("");
			toast.success("主题已重命名");
		} catch (error) {
			console.error("重命名主题失败:", error);
			toast.error(`重命名失败：${String(error)}`);
		}
	}, [renameName, themeBeingRenamed, reload]);

	const handleDelete = useCallback(
		async (theme: Theme) => {
			const ok = await confirmUI.danger(
				`确定删除主题「${theme.name}」吗？`,
				"删除主题",
			);
			if (!ok) return;
			try {
				await deleteTheme(theme.id);
				await reload();
				toast.success("主题已删除");
			} catch (error) {
				toast.error(
					`删除失败：${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[reload],
	);

	return (
		<SettingsSectionCard>
			<div
				className="p-5 space-y-4"
				id="data.storage.themes"
				data-settings-anchor="data.storage.themes"
			>
				<SettingsSectionTitle>主题目录</SettingsSectionTitle>

				<div className="flex items-center gap-2">
					<SettingsTextInput
						value={newThemeName}
						onChange={setNewThemeName}
						placeholder="新主题名称"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void handleAdd();
							}
						}}
					/>
					<SettingsButton
						variant="primary"
						onClick={() => void handleAdd()}
						disabled={newThemeName.trim().length === 0}
					>
						新增
					</SettingsButton>
				</div>

				{themes.length === 0 ? (
					<SettingsHint>暂无主题目录，可用上方输入框创建。</SettingsHint>
				) : (
					<div className="space-y-2">
						{themes.map((theme) => (
							<div
								key={theme.id}
								className="flex items-center justify-between rounded-lg border border-border/60 bg-cream-50/60 px-3 py-2"
							>
								<div className="min-w-0">
									<div className="truncate text-sm text-text-secondary">
										{theme.name}
									</div>
									<div className="truncate text-xs text-text-light">
										Themes/{theme.slug}
									</div>
								</div>
								<div className="flex items-center gap-2">
									<SettingsButton
										size="sm"
										variant="ghost"
										onClick={() => {
											setThemeBeingRenamed(theme);
											setRenameName(theme.name);
										}}
									>
										重命名
									</SettingsButton>
									<SettingsButton
										size="sm"
										variant="danger"
										onClick={() => void handleDelete(theme)}
									>
										删除
									</SettingsButton>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<Modal
				isOpen={!!themeBeingRenamed}
				onClose={() => {
					setThemeBeingRenamed(null);
					setRenameName("");
				}}
				title="重命名主题"
				size="sm"
			>
				<div className="space-y-4">
					<div className="space-y-2">
						<label className="text-xs text-text-muted">主题名称</label>
						<SettingsTextInput
							value={renameName}
							onChange={setRenameName}
							placeholder="请输入新的主题名称"
							autoComplete="off"
						/>
					</div>
					<div className="flex justify-end gap-2">
						<SettingsButton
							variant="ghost"
							onClick={() => {
								setThemeBeingRenamed(null);
								setRenameName("");
							}}
						>
							取消
						</SettingsButton>
						<SettingsButton
							variant="primary"
							onClick={() => void handleRename()}
							disabled={renameName.trim().length === 0}
						>
							保存
						</SettingsButton>
					</div>
				</div>
			</Modal>
		</SettingsSectionCard>
	);
}
