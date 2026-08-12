// Agent 设置 - 上下文治理区段
//
// Phase 7.1：把 enable_tool_search / setting_sources 等专家向字段统一收到
// SettingsDisclosure 里；面板默认只展示常用配置，想调高级参数的用户主动展开。
// 同时把 snake_case label 改为人性化中文，原 config key 作为 hint 灰字附在描述里。
//
// 2026-05-14 重构：
// - 移除"思考程度"入口（仅保留在对话框 Pill），避免双入口语义不明。
// - 关闭"多 Agent 协作（实验）"卡片，UI 不再暴露 teammate 配置。

import { Box, Clock, Cpu, Layers } from "lucide-react";
import type { AgentModelSettings } from "../../../../lib/models/agentModelConfig";
import { Select } from "../../../ui/Select";
import {
	SettingsCardSection,
	SettingsCheckbox,
	SettingsField,
	SettingsNumberInput,
} from "../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../ui/SettingsDisclosure";

type ContextRuntime = NonNullable<AgentModelSettings["contextRuntime"]>;

type ContextRuntimePatch = Partial<Omit<ContextRuntime, "contextBudget">> & {
	contextBudget?: Partial<ContextRuntime["contextBudget"]>;
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
			description="控制 Agent 的上下文裁剪策略与运行预算。"
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
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<SettingsField label="单次最大轮次" hint="max_turns · 1-200">
						<SettingsNumberInput
							value={contextRuntime.maxTurns}
							min={1}
							max={200}
							onChange={(value) => void saveContextRuntime({ maxTurns: value })}
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
		<div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
			<Icon className="h-3 w-3" strokeWidth={1.8} />
			{label}
		</div>
	);
}
