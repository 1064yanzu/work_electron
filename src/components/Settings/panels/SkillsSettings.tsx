import { AlertCircle, FolderOpen, RefreshCw, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { openDirectory } from "../../../lib/dialogCompat";
import { useSkillsStore } from "../../../lib/skillsStore";

export function SkillsSettings() {
	const { skills, refresh, importSkill, deleteSkill, setEnabled } =
		useSkillsStore();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		handleRefresh();
	}, []);

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
		if (!confirm(`确定要删除技能 "${skillName}" 吗？`)) return;

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

	return (
		<div className="flex-1 h-full bg-white p-8 overflow-y-auto">
			<div className="max-w-3xl space-y-8">
				<div className="border-b border-border pb-4 mb-8">
					<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
						<Zap className="w-5 h-5" />
						Agent 技能
					</h3>
					<p className="text-sm text-text-secondary mt-1">
						管理 Agent 可以使用的技能，技能格式遵循 agentskills.io 规范
					</p>
				</div>

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
							className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-border text-text-primary rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
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
								className="p-4 border border-border rounded-lg hover:shadow-md transition-shadow"
							>
								<div className="flex items-start justify-between">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<h5 className="font-medium text-text-primary">
												{skill.name}
											</h5>
											{!skill.enabled && (
												<span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
													已禁用
												</span>
											)}
										</div>
										<p className="text-sm text-text-secondary line-clamp-2">
											{skill.description}
										</p>
										<p className="text-xs text-text-muted mt-2 truncate font-mono">
											{skill.location}
										</p>
									</div>

									<div className="flex items-center gap-2 ml-4">
										<label className="relative inline-flex items-center cursor-pointer">
											<input
												type="checkbox"
												checked={skill.enabled}
												onChange={(e) =>
													handleToggle(skill.name, e.target.checked)
												}
												className="sr-only peer"
											/>
											<div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
										</label>
										<button
											onClick={() => handleDelete(skill.name)}
											className="p-1.5 text-text-muted hover:text-red-600 transition-colors"
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

				{/* Info */}
				<div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
					<div className="flex items-start gap-3">
						<AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
						<div className="text-sm text-blue-900">
							<div className="font-medium mb-1">关于 Agent Skills</div>
							<p className="text-blue-700 mb-2">
								技能是一组指导 Agent 完成特定任务的指令和资源，遵循
								agentskills.io 开放标准。
							</p>
							<div className="text-xs text-blue-600">
								• 技能目录需包含 SKILL.md 文件
								<br />• 技能元数据包括 name 和 description
								<br />• 与 Claude Code 等应用共享技能库
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
