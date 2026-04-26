import { AlertCircle, FolderOpen, RefreshCw, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../../../lib/config";
import { openDirectory } from "../../../lib/dialogCompat";
import { useSettingsStore } from "../../../lib/settingsStore";
import { useSkillsStore } from "../../../lib/skillsStore";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { Select } from "../../ui/Select";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

export function SkillsSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const { providers } = useSettingsStore();
	const { skills, refresh, importSkill, deleteSkill, setEnabled } =
		useSkillsStore();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [skillLlmModel, setSkillLlmModel] = useState<string>("");

	// 获取所有可用模型
	const allModels = providers
		.filter((p) => p.isEnabled)
		.flatMap((p) => p.models.map((m) => ({ id: m, provider: p.name })));

	useEffect(() => {
		handleRefresh();
		loadSkillConfig();
	}, []);

	const loadSkillConfig = async () => {
		try {
			const model = await getConfig("skill_llm_model");
			if (model) setSkillLlmModel(model);
		} catch {
			// 配置读取失败，忽略
		}
	};

	const handleSkillModelChange = async (newModel: string) => {
		setSkillLlmModel(newModel);
		try {
			await setConfig("skill_llm_model", newModel);
		} catch (err) {
			console.error("保存 Skill 模型配置失败:", err);
		}
	};

	const handleRefresh = async () => {
		setIsLoading(true);
		setError(null);
		try {
			await refresh();
		} catch (err) {
			setError(`刷新失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleImport = async () => {
		try {
			const selected = await openDirectory({
				title: "选择技能文件夹",
			});

			if (!selected) return;

			setIsLoading(true);
			setError(null);
			await importSkill(selected as string);
		} catch (err) {
			setError(`导入失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleDelete = async (skillName: string) => {
		const confirmed = await confirmDialog.danger(
			`确定要删除技能 "${skillName}" 吗？`,
			"删除技能",
		);
		if (!confirmed) return;

		try {
			setIsLoading(true);
			setError(null);
			await deleteSkill(skillName);
		} catch (err) {
			setError(`删除失败: ${err}`);
		} finally {
			setIsLoading(false);
		}
	};

	const handleToggle = async (skillName: string, enabled: boolean) => {
		try {
			await setEnabled(skillName, enabled);
		} catch (err) {
			setError(`更新失败: ${err}`);
		}
	};

	const enabledCount = skills.filter((skill) => skill.enabled).length;

	if (showTechnicalSummaries) {
		return (
			<SettingsPageContainer contentClassName="max-w-3xl space-y-6">
				<SettingsPanelHeader
					icon={Zap}
					title="Agent 技能"
					description="管理 Agent 技能。"
				/>

				{error && (
					<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
						{error}
					</div>
				)}

				<div className="grid gap-4 sm:grid-cols-3">
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">已安装技能</div>
						<div className="mt-2 text-2xl font-semibold text-text-primary">
							{skills.length}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">启用中</div>
						<div className="mt-2 text-2xl font-semibold text-text-primary">
							{enabledCount}
						</div>
					</div>
					<div className="rounded-2xl border border-border/80 bg-surface p-4 shadow-sm">
						<div className="text-xs text-text-muted">状态</div>
						<div className="mt-2 text-sm font-medium text-text-primary">
							{isLoading ? "加载中" : skills.length > 0 ? "可用" : "尚未安装"}
						</div>
					</div>
				</div>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-8">
			<SettingsPanelHeader
				icon={Zap}
				title="Agent 技能"
				description="管理 Agent 技能。"
			/>

			{/* Error Message */}
			{error && (
				<div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
					<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
					<span>{error}</span>
				</div>
			)}

			{/* Actions */}
			<div className="flex items-center justify-between">
				<h4 className="font-medium text-text-primary">已安装的技能</h4>
				<div className="flex items-center gap-2">
					<button
						onClick={handleRefresh}
						disabled={isLoading}
						className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface border border-border text-text-primary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
					>
						<RefreshCw
							className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
						/>
						刷新
					</button>
					<button
						onClick={handleImport}
						disabled={isLoading}
						className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
					>
						<FolderOpen className="w-4 h-4" />
						导入技能
					</button>
				</div>
			</div>

			{/* Skills List */}
			<div className="space-y-4">
				{isLoading && skills.length === 0 ? (
					<div className="text-center py-8 text-text-muted">加载中...</div>
				) : skills.length === 0 ? (
					<div className="text-center py-12 text-text-muted">
						<Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
						<p>暂无已安装的技能</p>
						<p className="text-xs mt-2">点击"导入技能"添加技能文件夹</p>
					</div>
				) : (
					skills.map((skill) => (
						<div
							key={skill.name}
							className="p-4 border border-border/80 rounded-2xl hover:shadow-sm transition-all ring-1 ring-black/[0.03]"
							style={{ backgroundColor: "var(--t-bg-surface)" }}
						>
							<div className="flex items-start justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<h5 className="text-[13.5px] font-medium text-text-primary">
											{skill.name}
										</h5>
										{!skill.enabled && (
											<span className="px-2 py-0.5 text-[10px] font-medium bg-warm-200 text-text-muted rounded-md">
												已禁用
											</span>
										)}
									</div>
									<p className="text-[12px] text-text-muted leading-relaxed line-clamp-2">
										{skill.description}
									</p>
									<p className="text-[11px] text-text-light mt-2 truncate font-mono">
										{skill.location}
									</p>
								</div>

								<div className="flex items-center gap-2 ml-4">
									<SettingsSwitch
										checked={skill.enabled}
										onChange={(next) => handleToggle(skill.name, next)}
									/>
									<button
										onClick={() => handleDelete(skill.name)}
										className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
										title="删除"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{/* Skill LLM Model Config */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>Skill 执行模型</SettingsSectionTitle>
					<SettingsRow
						label="技能内容生成模型"
						description="Skill 执行时用于生成内容的 LLM 模型。未选择时使用当前活跃模型。"
						action={
							<Select
								value={skillLlmModel}
								onChange={(e) => handleSkillModelChange(e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[200px]"
							>
								<option value="">跟随活跃模型（默认）</option>
								{allModels.map((model) => (
									<option key={`${model.provider}-${model.id}`} value={model.id}>
										{model.id} ({model.provider})
									</option>
								))}
							</Select>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* Info */}
			<div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-2xl">
				<div className="flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
					<div className="text-sm text-blue-900 dark:text-blue-200">
						<div className="font-medium mb-1">关于 Agent Skills</div>
						<p className="text-blue-700 dark:text-blue-300 mb-2">
							技能是一组指导 Agent 完成特定任务的指令和资源，遵循 agentskills.io
							开放标准。
						</p>
						<div className="text-xs text-blue-600 dark:text-blue-400">
							• 技能目录需包含 SKILL.md 文件
							<br />• 技能元数据包括 name 和 description
							<br />• 运行 Agent 时只会同步当前启用的技能到任务沙盒
							<br />• 与 Claude Code 等应用共享 `~/.claude/skills` 技能库
						</div>
					</div>
				</div>
			</div>
		</SettingsPageContainer>
	);
}
