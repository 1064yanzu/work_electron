import { Activity, ChevronUp, GitBranchPlus, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
	createWorkflowNode,
	invokeLlm,
	listWorkflowNodes,
	updateWorkflowNode,
} from "../lib/api";
import { EVENTS, events } from "../lib/events";
import { useSettingsStore } from "../lib/settingsStore";
import { NodeStatus, type WorkflowNode, WorkflowNodeType } from "../types";
import {
	type ContextItem as ComposerContextItem,
	EnhancedInput,
} from "./ui/EnhancedInput";
import { inputDialog } from "./ui/InputDialog";
import type { SlashCommand } from "./ui/SlashCommandMenu";
import { toast } from "./ui/Toast";

export default function ProcessLab() {
	const { providers, activeModel, settingsStore } = useSettingsStore();
	const [nodes, setNodes] = useState<WorkflowNode[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

	const enabledModels = providers
		.filter((provider) => provider.isEnabled)
		.flatMap((provider) =>
			provider.models.map((modelId) => ({
				id: modelId,
				provider: provider.name,
			})),
		)
		.sort((a, b) => a.id.localeCompare(b.id));

	const currentModel =
		enabledModels.find((m) => m.id === activeModel) || enabledModels[0];

	const fetchNodes = async () => {
		try {
			setIsLoading(true);
			const data = await listWorkflowNodes();
			setNodes(data);
		} catch (error) {
			console.error("获取工作流失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchNodes();
	}, []);

	const handleAddNode = async () => {
		const name = await inputDialog.show({
			title: "新建工作流",
			message: "请输入工作流名称",
			placeholder: "例如：资料摘要流程",
			confirmText: "创建",
			cancelText: "取消",
			validate: (value) => {
				if (!value.trim()) return "工作流名称不能为空";
				return null;
			},
		});
		if (!name) return;

		try {
			await createWorkflowNode({
				name,
				node_type: WorkflowNodeType.Llm,
				status: NodeStatus.Pending,
			});
			fetchNodes();
		} catch (error) {
			console.error("创建工作流失败:", error);
			toast.error("创建失败");
		}
	};

	const handleRunWorkflow = async (node: WorkflowNode) => {
		if (!activeModel) {
			toast.warning("请先在模型设置中选择一个模型");
			return;
		}

		try {
			await updateWorkflowNode({ id: node.id, status: NodeStatus.Running });
			fetchNodes();

			setTimeout(async () => {
				await updateWorkflowNode({ id: node.id, status: NodeStatus.Completed });
				fetchNodes();
			}, 2000);
		} catch (error) {
			console.error("执行工作流失败:", error);
			toast.error(
				`执行失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const handleSlashCommand = async (
		command: SlashCommand,
	): Promise<boolean> => {
		switch (command.id) {
			case "run-workflow":
				await handleAddNode();
				return true;
			default:
				return false;
		}
	};

	const handleComposerSubmit = async (
		text: string,
		contexts: ComposerContextItem[],
		command?: SlashCommand,
	) => {
		const trimmed = text.trim();

		if (command) {
			const handled = await handleSlashCommand(command);
			if (handled && !trimmed) {
				return;
			}
		}

		if (!trimmed) {
			return;
		}

		if (!activeModel) {
			toast.warning("请先在模型设置中选择一个模型");
			return;
		}

		try {
			const contextRefs = contexts.map((ctx) => ctx.id);
			const response = await invokeLlm({
				model: activeModel,
				prompt: trimmed,
				context: contextRefs,
				temperature: 0.7,
			});

			events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
				prompt: trimmed,
				model: activeModel,
				content: `\n\n## AI 生成内容 (${activeModel})\n\n${response.content}\n\n---\n*Token 使用: ${response.usage?.total_tokens || "N/A"}*\n`,
			});
		} catch (error) {
			console.error("LLM 调用失败:", error);
			events.emit(EVENTS.AI_WRITE_TO_OUTPUT, {
				prompt: trimmed,
				model: activeModel,
				content: `\n\n## ⚠️ 生成失败\n\n错误: ${error}\n\n请检查模型配置和 API Key。\n`,
			});
		}
	};

	const getStatusColor = (status: NodeStatus) => {
		switch (status) {
			case NodeStatus.Completed:
				return "bg-green-50 text-green-700 border-green-100";
			case NodeStatus.Failed:
				return "bg-red-50 text-red-700 border-red-100";
			case NodeStatus.Running:
				return "bg-blue-50 text-blue-700 border-blue-100";
			default:
				return "bg-surface text-text-secondary border-border";
		}
	};

	return (
		<main className="flex-1 bg-panel-process dark:bg-gray-850 flex flex-col h-full font-sans min-w-0">
			<div className="p-4 border-b border-border dark:border-gray-700 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2">
					<GitBranchPlus className="w-5 h-5 text-primary" />
					<h2 className="font-serif font-medium text-sm tracking-wide text-text-secondary">
						处理实验室
					</h2>
				</div>
			</div>

			<div className="flex-1 p-6 overflow-y-auto min-h-0">
				{isLoading ? (
					<div className="text-center py-12 text-text-muted font-serif italic">
						加载中...
					</div>
				) : nodes.length === 0 ? (
					<div className="text-center py-12 text-text-muted">
						<div className="mb-2 font-serif text-lg text-text-secondary">
							暂无活跃流程
						</div>
						<div className="text-sm">在下方输入框创建新流程</div>
					</div>
				) : (
					<div className="max-w-3xl mx-auto space-y-6">
						{nodes.map((node) => (
							<div
								key={node.id}
								className="bg-white dark:bg-gray-700 rounded-xl border border-border dark:border-gray-600 shadow-sm p-6 hover:shadow-md hover:border-primary/20 transition-all group"
							>
								<div className="flex items-center gap-4 mb-4">
									<div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-primary border border-border">
										<Activity className="w-5 h-5" />
									</div>
									<div className="flex-1">
										<div className="font-serif font-medium text-lg text-text-primary group-hover:text-primary transition-colors">
											{node.name}
										</div>
										<div className="flex items-center gap-2 mt-1">
											<span className="text-xs text-text-secondary uppercase tracking-wider font-medium">
												{node.node_type} 节点
											</span>
											<span className="text-border">•</span>
											<span className="text-xs text-text-muted">
												{new Date(node.updated_at).toLocaleString()}
											</span>
										</div>
									</div>
									<span
										className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(node.status)} capitalize`}
									>
										{node.status}
									</span>
								</div>

								<div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-dashed border-border">
									<button
										onClick={() => handleRunWorkflow(node)}
										className="text-sm text-text-secondary hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-surface transition-colors"
									>
										<Play className="w-3.5 h-3.5" />
										运行
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-t border-border dark:border-gray-700 shrink-0">
				<div className="max-w-3xl mx-auto space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-col gap-1">
							<span className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
								当前模型
							</span>
							<div className="relative inline-block">
								<button
									onClick={() => setIsModelMenuOpen((prev) => !prev)}
									className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-text-primary hover:border-primary transition-colors"
								>
									<span>{currentModel?.id || "未配置"}</span>
									<ChevronUp
										className={`w-3 h-3 transition-transform ${isModelMenuOpen ? "rotate-180" : ""}`}
									/>
								</button>

								{isModelMenuOpen && (
									<>
										<div
											className="fixed inset-0 z-10"
											onClick={() => setIsModelMenuOpen(false)}
										/>
										<div className="absolute left-0 top-full mt-2 z-20 w-64 bg-white border border-border rounded-xl shadow-xl overflow-hidden">
											<div className="px-3 py-2 text-xs font-medium text-text-muted bg-surface border-b border-border">
												选择模型
											</div>
											<div className="max-h-[250px] overflow-y-auto p-1">
												{enabledModels.length === 0 ? (
													<div className="px-3 py-4 text-xs text-text-muted">
														暂无可用模型
													</div>
												) : (
													enabledModels.map((model) => (
														<button
															key={model.id}
															onClick={() => {
																settingsStore.setActiveModel(model.id);
																setIsModelMenuOpen(false);
															}}
															className={`w-full flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors ${
																activeModel === model.id
																	? "bg-primary/5 text-primary"
																	: "text-text-secondary hover:bg-surface"
															}`}
														>
															<span className="font-medium text-sm">
																{model.id}
															</span>
															<span className="text-[10px] text-text-muted">
																{model.provider}
															</span>
														</button>
													))
												)}
											</div>
										</div>
									</>
								)}
							</div>
						</div>

						<div className="flex items-center gap-2">
							<button
								onClick={handleAddNode}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-text-secondary hover:text-primary hover:border-primary transition-colors"
							>
								<Plus className="w-3.5 h-3.5" />
								新建流程
							</button>
						</div>
					</div>

					<EnhancedInput
						onSubmit={handleComposerSubmit}
						placeholder="输入 / 查看命令，或描述你希望自动化完成的任务..."
					/>

					<p className="text-xs text-center text-text-muted">
						💡 输入{" "}
						<kbd className="px-1 py-0.5 bg-surface border border-border rounded">
							/
						</kbd>{" "}
						调出命令，使用{" "}
						<kbd className="px-1 py-0.5 bg-surface border border-border rounded">
							⌘ + Enter
						</kbd>{" "}
						立即执行
					</p>
				</div>
			</div>
		</main>
	);
}
