// Agent 设置 - 上下文治理区段
//
// 从 AgentSettings 主文件抽出。包含 context policy / max turns / budget /
// 多 Agent 协作（实验）等所有上下文治理相关配置。

import { Clock, Users } from "lucide-react";
import type { AgentModelSettings } from "../../../../lib/models/agentModelConfig";
import { Select } from "../../../ui/Select";
import { Toggle } from "../../components";

type ContextRuntime = NonNullable<AgentModelSettings["contextRuntime"]>;

type ContextRuntimePatch = Partial<
	Omit<ContextRuntime, "contextBudget" | "teammateBudget">
> & {
	contextBudget?: Partial<ContextRuntime["contextBudget"]>;
	teammateBudget?: Partial<ContextRuntime["teammateBudget"]>;
};

interface ContextRuntimeSectionProps {
	contextRuntime: ContextRuntime;
	saveContextRuntime: (patch: ContextRuntimePatch) => Promise<void>;
}

export function ContextRuntimeSection({
	contextRuntime,
	saveContextRuntime,
}: ContextRuntimeSectionProps) {
	return (
		<div className="space-y-4">
			<h4 className="font-medium text-text-primary flex items-center gap-2">
				<Clock className="w-4 h-4" />
				上下文治理
			</h4>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						context_policy
					</label>
					<Select
						value={contextRuntime.contextPolicy}
						onChange={(event) =>
							void saveContextRuntime({
								contextPolicy: event.target.value as
									| "balanced"
									| "strict"
									| "aggressive",
							})
						}
						options={[
							{ value: "balanced", label: "balanced" },
							{ value: "strict", label: "strict" },
							{ value: "aggressive", label: "aggressive" },
						]}
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						subagent_context_mode
					</label>
					<Select
						value={contextRuntime.subagentContextMode}
						onChange={(event) =>
							void saveContextRuntime({
								subagentContextMode: event.target.value as
									| "capsule"
									| "inherit",
							})
						}
						options={[
							{ value: "capsule", label: "capsule（推荐）" },
							{ value: "inherit", label: "inherit" },
						]}
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						max_turns
					</label>
					<input
						type="number"
						min={1}
						max={200}
						value={contextRuntime.maxTurns}
						onChange={(event) =>
							void saveContextRuntime({
								maxTurns: Math.max(
									1,
									Math.min(200, Number(event.target.value) || 24),
								),
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						max_thinking_tokens
					</label>
					<input
						type="number"
						min={256}
						max={131072}
						step={256}
						value={contextRuntime.maxThinkingTokens}
						onChange={(event) =>
							void saveContextRuntime({
								maxThinkingTokens: Math.max(
									256,
									Math.min(131072, Number(event.target.value) || 8192),
								),
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						max_budget_usd（可空）
					</label>
					<input
						type="number"
						min={0}
						step={0.1}
						value={contextRuntime.maxBudgetUsd ?? ""}
						onChange={(event) =>
							void saveContextRuntime({
								maxBudgetUsd:
									event.target.value.trim() === ""
										? undefined
										: Math.max(0, Number(event.target.value) || 0),
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						enable_tool_search
					</label>
					<Select
						value={contextRuntime.enableToolSearch}
						onChange={(event) =>
							void saveContextRuntime({
								enableToolSearch: event.target.value as
									| "auto"
									| "auto:5"
									| "true"
									| "false",
							})
						}
						options={[
							{ value: "auto:5", label: "auto:5（推荐）" },
							{ value: "auto", label: "auto" },
							{ value: "true", label: "true" },
							{ value: "false", label: "false" },
						]}
					/>
				</div>
			</div>
			<div className="space-y-2">
				<div className="text-sm text-text-primary">setting_sources</div>
				<div className="flex flex-wrap gap-3 text-sm text-text-secondary">
					{(["user", "project", "local"] as const).map((source) => {
						const checked = contextRuntime.settingSources.includes(source);
						return (
							<label key={source} className="inline-flex items-center gap-2">
								<input
									type="checkbox"
									checked={checked}
									onChange={(event) => {
										const next = event.target.checked
											? Array.from(
													new Set([...contextRuntime.settingSources, source]),
												)
											: contextRuntime.settingSources.filter(
													(item) => item !== source,
												);
										void saveContextRuntime({
											settingSources:
												next.length > 0 ? next : ["user", "project"],
										});
									}}
								/>
								<span>{source}</span>
							</label>
						);
					})}
				</div>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						context_budget.max_context_chars
					</label>
					<input
						type="number"
						min={1000}
						step={500}
						value={contextRuntime.contextBudget.maxContextChars}
						onChange={(event) =>
							void saveContextRuntime({
								contextBudget: {
									maxContextChars: Math.max(
										1000,
										Number(event.target.value) || 16000,
									),
								},
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						context_budget.max_files
					</label>
					<input
						type="number"
						min={1}
						max={100}
						value={contextRuntime.contextBudget.maxFiles}
						onChange={(event) =>
							void saveContextRuntime({
								contextBudget: {
									maxFiles: Math.max(1, Number(event.target.value) || 12),
								},
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
				<div>
					<label className="text-sm text-text-primary mb-1.5 block">
						context_budget.max_file_chars
					</label>
					<input
						type="number"
						min={500}
						step={100}
						value={contextRuntime.contextBudget.maxFileChars}
						onChange={(event) =>
							void saveContextRuntime({
								contextBudget: {
									maxFileChars: Math.max(
										500,
										Number(event.target.value) || 6000,
									),
								},
							})
						}
						className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
					/>
				</div>
			</div>
			<div className="rounded-2xl border border-border/70 bg-warm-50/60/30 p-4 space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="text-sm font-medium text-text-primary flex items-center gap-2">
							<Users className="w-4 h-4" />多 Agent 协作（实验）
						</div>
						<div className="text-xs text-text-muted mt-1">
							开启后允许 leader 结合 Task / Teammate 做编排；Teammate
							失败会自动回退到稳定子代理。
						</div>
					</div>
					<Toggle
						checked={contextRuntime.experimentalMultiAgentEnabled}
						onChange={() =>
							void saveContextRuntime({
								experimentalMultiAgentEnabled:
									!contextRuntime.experimentalMultiAgentEnabled,
							})
						}
					/>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							multi_agent_mode
						</label>
						<Select
							value={contextRuntime.multiAgentMode}
							onChange={(event) =>
								void saveContextRuntime({
									multiAgentMode: event.target.value as
										| "subagent_only"
										| "hybrid"
										| "teammate_preferred",
								})
							}
							options={[
								{ value: "hybrid", label: "hybrid（推荐）" },
								{ value: "subagent_only", label: "subagent_only" },
								{
									value: "teammate_preferred",
									label: "teammate_preferred",
								},
							]}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							teammate_mode
						</label>
						<Select
							value={contextRuntime.teammateMode}
							onChange={(event) =>
								void saveContextRuntime({
									teammateMode: event.target.value as
										| "auto"
										| "tmux"
										| "in-process",
								})
							}
							options={[
								{ value: "auto", label: "auto（推荐）" },
								{ value: "in-process", label: "in-process" },
								{ value: "tmux", label: "tmux" },
							]}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							max_teammates
						</label>
						<input
							type="number"
							min={1}
							max={8}
							value={contextRuntime.maxTeammates}
							onChange={(event) =>
								void saveContextRuntime({
									maxTeammates: Math.max(
										1,
										Math.min(8, Number(event.target.value) || 2),
									),
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							leader_summary_model（可空）
						</label>
						<input
							type="text"
							value={contextRuntime.leaderSummaryModel ?? ""}
							onChange={(event) =>
								void saveContextRuntime({
									leaderSummaryModel: event.target.value.trim() || undefined,
								})
							}
							placeholder="留空则沿用主模型"
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div className="md:col-span-2">
						<label className="text-sm text-text-primary mb-1.5 block">
							teammate_execution_model（可空）
						</label>
						<input
							type="text"
							value={contextRuntime.teammateExecutionModel ?? ""}
							onChange={(event) =>
								void saveContextRuntime({
									teammateExecutionModel:
										event.target.value.trim() || undefined,
								})
							}
							placeholder="例如 claude-sonnet-4-5；留空则由 SDK/场景配置决定"
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							teammate_budget.max_turns
						</label>
						<input
							type="number"
							min={1}
							max={100}
							value={contextRuntime.teammateBudget.maxTurns}
							onChange={(event) =>
								void saveContextRuntime({
									teammateBudget: {
										maxTurns: Math.max(
											1,
											Math.min(100, Number(event.target.value) || 12),
										),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							teammate_budget.max_thinking_tokens
						</label>
						<input
							type="number"
							min={256}
							max={65536}
							step={256}
							value={contextRuntime.teammateBudget.maxThinkingTokens}
							onChange={(event) =>
								void saveContextRuntime({
									teammateBudget: {
										maxThinkingTokens: Math.max(
											256,
											Math.min(65536, Number(event.target.value) || 4096),
										),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							teammate_budget.max_budget_usd（可空）
						</label>
						<input
							type="number"
							min={0}
							step={0.1}
							value={contextRuntime.teammateBudget.maxBudgetUsd ?? ""}
							onChange={(event) =>
								void saveContextRuntime({
									teammateBudget: {
										maxBudgetUsd:
											event.target.value.trim() === ""
												? undefined
												: Math.max(0, Number(event.target.value) || 0),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
