// Agent 设置 - 上下文治理区段
//
// Phase 7.1：把 enable_tool_search / setting_sources / 多 Agent 协作的内部参数 /
// teammate 预算等专家向字段统一收到 SettingsDisclosure 里；面板默认只展示常用配置，
// 想调高级参数的用户主动展开。同时把 snake_case label 改为人性化中文，
// 原 config key 作为 hint 灰字附在描述里。

import { Box, Clock, Cpu, Layers, Network, Users } from "lucide-react";
import type { AgentModelSettings } from "../../../../lib/models/agentModelConfig";
import { Select } from "../../../ui/Select";
import { Toggle } from "../../components";
import {
	SettingsBadge,
	SettingsCardSection,
	SettingsCheckbox,
	SettingsField,
	SettingsHint,
	SettingsNumberInput,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../ui/SettingsDisclosure";

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
	const settingSources = contextRuntime.settingSources;
	const toggleSource = (source: "user" | "project" | "local") => {
		const next = settingSources.includes(source)
			? settingSources.filter((item) => item !== source)
			: Array.from(new Set([...settingSources, source]));
		void saveContextRuntime({
			settingSources: next.length > 0 ? next : ["user", "project"],
		});
	};

	return (
		<SettingsCardSection
			title="上下文治理"
			description="控制 Agent 的上下文裁剪策略、运行预算与多 Agent 协作。"
			bodyClassName="px-5 py-5 space-y-6"
		>
			{/* —— 行为策略 —— */}
			<div>
				<SubsectionTitle icon={Layers} label="行为策略" />
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
					<SettingsField
						label="上下文裁剪策略"
						hint="主上下文裁剪策略 · context_policy"
					>
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
							variant="inline"
							options={[
								{ value: "balanced", label: "balanced（推荐）" },
								{ value: "strict", label: "strict" },
								{ value: "aggressive", label: "aggressive" },
							]}
						/>
					</SettingsField>
					<SettingsField
						label="子 Agent 上下文继承"
						hint="subagent_context_mode"
					>
						<Select
							value={contextRuntime.subagentContextMode}
							onChange={(event) =>
								void saveContextRuntime({
									subagentContextMode: event.target.value as
										| "capsule"
										| "inherit",
								})
							}
							variant="inline"
							options={[
								{ value: "capsule", label: "capsule（推荐）" },
								{ value: "inherit", label: "inherit" },
							]}
						/>
					</SettingsField>
				</div>

				<SettingsDisclosure
					id="ai.agent.context.behavior.advanced"
					className="mt-3"
				>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
						<SettingsField
							label="工具懒加载"
							hint="enable_tool_search · 是否在调用前先做工具检索"
						>
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
								variant="inline"
								options={[
									{ value: "false", label: "false（关闭，推荐）" },
									{ value: "auto", label: "auto" },
									{ value: "auto:5", label: "auto:5" },
									{ value: "true", label: "true（始终）" },
								]}
							/>
						</SettingsField>
					</div>
				</SettingsDisclosure>
			</div>

			{/* —— 运行预算 —— */}
			<div>
				<SubsectionTitle icon={Clock} label="运行预算" />
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<SettingsField label="单次最大轮次" hint="max_turns · 1-200">
						<SettingsNumberInput
							value={contextRuntime.maxTurns}
							min={1}
							max={200}
							onChange={(value) => void saveContextRuntime({ maxTurns: value })}
						/>
					</SettingsField>
					<SettingsField label="思考 Token 上限" hint="max_thinking_tokens">
						<SettingsNumberInput
							value={contextRuntime.maxThinkingTokens}
							min={256}
							max={131072}
							step={256}
							onChange={(value) =>
								void saveContextRuntime({ maxThinkingTokens: value })
							}
						/>
					</SettingsField>
					<SettingsField
						label="预算上限（USD）"
						hint="max_budget_usd · 留空不限制"
					>
						<SettingsNumberInput
							value={contextRuntime.maxBudgetUsd ?? 0}
							min={0}
							step={0.1}
							suffix="$"
							onChange={(value) =>
								void saveContextRuntime({
									maxBudgetUsd: value === 0 ? undefined : value,
								})
							}
						/>
					</SettingsField>
				</div>
			</div>

			{/* —— 上下文预算 —— */}
			<div>
				<SubsectionTitle icon={Box} label="上下文预算" />
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<SettingsField label="总上下文字符上限" hint="max_context_chars">
						<SettingsNumberInput
							value={contextRuntime.contextBudget.maxContextChars}
							min={1000}
							step={500}
							onChange={(value) =>
								void saveContextRuntime({
									contextBudget: { maxContextChars: value },
								})
							}
						/>
					</SettingsField>
					<SettingsField label="单次注入文件上限" hint="max_files">
						<SettingsNumberInput
							value={contextRuntime.contextBudget.maxFiles}
							min={1}
							max={100}
							onChange={(value) =>
								void saveContextRuntime({
									contextBudget: { maxFiles: value },
								})
							}
						/>
					</SettingsField>
					<SettingsField label="单文件最大字符" hint="max_file_chars">
						<SettingsNumberInput
							value={contextRuntime.contextBudget.maxFileChars}
							min={500}
							step={100}
							onChange={(value) =>
								void saveContextRuntime({
									contextBudget: { maxFileChars: value },
								})
							}
						/>
					</SettingsField>
				</div>
			</div>

			{/* —— Setting sources（折到高级）—— */}
			<SettingsDisclosure
				id="ai.agent.context.sources.advanced"
				title="设置来源（setting_sources）"
			>
				<div>
					<SubsectionTitle icon={Cpu} label="设置来源" />
					<p className="mb-2 text-[11.5px] text-text-muted">
						Agent 启动时读取的设置来源；至少保留一个。
					</p>
					<div className="flex flex-wrap gap-4 rounded-2xl border border-border bg-cream-50 px-4 py-3">
						{(["user", "project", "local"] as const).map((source) => (
							<SettingsCheckbox
								key={source}
								checked={settingSources.includes(source)}
								onChange={() => toggleSource(source)}
								label={source}
							/>
						))}
					</div>
				</div>
			</SettingsDisclosure>

			{/* —— 多 Agent 协作（实验）—— */}
			<MultiAgentBlock
				contextRuntime={contextRuntime}
				saveContextRuntime={saveContextRuntime}
			/>
		</SettingsCardSection>
	);
}

function SubsectionTitle({
	icon: Icon,
	label,
}: {
	icon: typeof Clock;
	label: string;
}) {
	return (
		<div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
			<Icon className="h-3 w-3" strokeWidth={1.8} />
			{label}
		</div>
	);
}

function MultiAgentBlock({
	contextRuntime,
	saveContextRuntime,
}: ContextRuntimeSectionProps) {
	const enabled = contextRuntime.experimentalMultiAgentEnabled;
	return (
		<div
			className={`rounded-2xl border bg-cream-50 transition-colors ${
				enabled ? "border-violetx-300/60" : "border-border"
			}`}
		>
			<div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
				<div className="flex items-start gap-2.5">
					<span
						className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
							enabled
								? "bg-violetx-300/30 text-violetx-600"
								: "bg-cream-200 text-text-muted"
						}`}
					>
						<Users className="h-4 w-4" strokeWidth={1.6} />
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h4 className="text-[13.5px] font-semibold text-text-primary">
								多 Agent 协作
							</h4>
							<SettingsBadge tone="info">实验</SettingsBadge>
						</div>
						<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
							允许 leader 结合 Task / Teammate 编排；teammate 失败会自动回退。
						</p>
					</div>
				</div>
				<Toggle
					checked={enabled}
					onChange={() =>
						void saveContextRuntime({
							experimentalMultiAgentEnabled: !enabled,
						})
					}
				/>
			</div>

			{enabled && (
				<div className="space-y-4 px-4 py-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<SettingsField label="多 Agent 模式" hint="multi_agent_mode">
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
								variant="inline"
								options={[
									{ value: "hybrid", label: "hybrid（推荐）" },
									{ value: "subagent_only", label: "subagent_only" },
									{ value: "teammate_preferred", label: "teammate_preferred" },
								]}
							/>
						</SettingsField>
						<SettingsField label="队员运行模式" hint="teammate_mode">
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
								variant="inline"
								options={[
									{ value: "auto", label: "auto（推荐）" },
									{ value: "in-process", label: "in-process" },
									{ value: "tmux", label: "tmux" },
								]}
							/>
						</SettingsField>
					</div>

					<SettingsDisclosure
						id="ai.agent.multiagent.advanced"
						title="高级队员设置"
					>
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<SettingsField label="并行队员上限" hint="max_teammates · 1-8">
									<SettingsNumberInput
										value={contextRuntime.maxTeammates}
										min={1}
										max={8}
										onChange={(value) =>
											void saveContextRuntime({ maxTeammates: value })
										}
									/>
								</SettingsField>
								<SettingsField
									label="Leader 总结模型"
									hint="leader_summary_model · 留空沿用主模型"
								>
									<SettingsTextInput
										value={contextRuntime.leaderSummaryModel ?? ""}
										onChange={(next) =>
											void saveContextRuntime({
												leaderSummaryModel: next.trim() || undefined,
											})
										}
										placeholder="留空沿用主模型"
										mono
									/>
								</SettingsField>
								<div className="sm:col-span-2">
									<SettingsField
										label="队员执行模型"
										hint="teammate_execution_model · 例如 claude-sonnet-4-5；留空由 SDK / 场景配置决定"
									>
										<SettingsTextInput
											value={contextRuntime.teammateExecutionModel ?? ""}
											onChange={(next) =>
												void saveContextRuntime({
													teammateExecutionModel: next.trim() || undefined,
												})
											}
											placeholder="claude-sonnet-4-5"
											mono
										/>
									</SettingsField>
								</div>
							</div>

							<div>
								<div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
									<Network className="h-3 w-3" strokeWidth={1.8} />
									队员预算（teammate_budget）
								</div>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
									<SettingsField label="单次最大轮次" hint="max_turns">
										<SettingsNumberInput
											value={contextRuntime.teammateBudget.maxTurns}
											min={1}
											max={100}
											onChange={(value) =>
												void saveContextRuntime({
													teammateBudget: { maxTurns: value },
												})
											}
										/>
									</SettingsField>
									<SettingsField
										label="思考 Token 上限"
										hint="max_thinking_tokens"
									>
										<SettingsNumberInput
											value={contextRuntime.teammateBudget.maxThinkingTokens}
											min={256}
											max={65536}
											step={256}
											onChange={(value) =>
												void saveContextRuntime({
													teammateBudget: { maxThinkingTokens: value },
												})
											}
										/>
									</SettingsField>
									<SettingsField label="预算上限（USD）" hint="max_budget_usd">
										<SettingsNumberInput
											value={contextRuntime.teammateBudget.maxBudgetUsd ?? 0}
											min={0}
											step={0.1}
											suffix="$"
											onChange={(value) =>
												void saveContextRuntime({
													teammateBudget: {
														maxBudgetUsd: value === 0 ? undefined : value,
													},
												})
											}
										/>
									</SettingsField>
								</div>
							</div>

							<SettingsHint icon={Users}>
								队员失败时会回退到稳定子代理；建议在主模型与队员模型之间选择规模相近的搭配，避免
								token 开销失控。
							</SettingsHint>
						</div>
					</SettingsDisclosure>
				</div>
			)}
		</div>
	);
}
