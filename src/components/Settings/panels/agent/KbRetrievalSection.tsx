// Agent 设置 - 资料库检索区段
//
// Phase 7.1：把 vector_min_score / embedding_max_chars / fallback_concurrency
// 等专家向参数收到 SettingsDisclosure 里。常用配置（检索模式 + Embedding 模型）
// 默认展示；统计 + 立即补齐保留在主区。

import { Database, Sparkles, Wrench } from "lucide-react";
import type { KbEmbeddingStats } from "../../../../lib/api";
import { Select } from "../../../ui/Select";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsField,
	SettingsHint,
	SettingsNumberInput,
} from "../../ui/SettingsPrimitives";
import { SettingsDisclosure } from "../../ui/SettingsDisclosure";
import { cn } from "../../../../lib/utils";

interface RetrievalModeOption {
	value: "fts" | "vector" | "hybrid";
	label: string;
	desc: string;
}

interface AllModelEntry {
	id: string;
	provider: string;
}

interface KbRetrievalSectionProps {
	retrievalModeOptions: readonly RetrievalModeOption[];
	kbRetrievalMode: "fts" | "vector" | "hybrid";
	onModeChange: (mode: "fts" | "vector" | "hybrid") => void | Promise<void>;
	kbEmbeddingMaxChars: number;
	onMaxCharsChange: (value: number) => void | Promise<void>;
	kbVectorMinScore: number;
	onMinScoreChange: (value: number) => void | Promise<void>;
	kbEmbeddingModel: string;
	onEmbeddingModelChange: (value: string) => void | Promise<void>;
	allModels: AllModelEntry[];
	kbEmbeddingFallbackConcurrency: number;
	onFallbackConcurrencyChange: (value: number) => void | Promise<void>;
	kbStats: KbEmbeddingStats | null;
	autoHint: string;
	isRebuilding: boolean;
	onRebuild: () => void | Promise<void>;
}

export function KbRetrievalSection({
	retrievalModeOptions,
	kbRetrievalMode,
	onModeChange,
	kbEmbeddingMaxChars,
	onMaxCharsChange,
	kbVectorMinScore,
	onMinScoreChange,
	kbEmbeddingModel,
	onEmbeddingModelChange,
	allModels,
	kbEmbeddingFallbackConcurrency,
	onFallbackConcurrencyChange,
	kbStats,
	autoHint,
	isRebuilding,
	onRebuild,
}: KbRetrievalSectionProps) {
	const needsModel = kbRetrievalMode !== "fts";
	const missing = kbStats ? kbStats.missing_chunks : 0;
	const total = kbStats ? kbStats.total_chunks : 0;
	const embedded = kbStats ? kbStats.embedded_chunks : 0;
	const coverage = total > 0 ? (embedded / total) * 100 : 0;

	return (
		<SettingsCardSection
			title="资料库检索"
			description="选择 Agent 检索资料库的策略，向量与混合模式可获得语义召回，FTS 适合稳定检索。"
			bodyClassName="px-5 py-5 space-y-5"
		>
			{/* 检索模式 — 卡片式 */}
			<div>
				<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
					<Database className="h-3 w-3" strokeWidth={1.8} />
					检索模式
				</div>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{retrievalModeOptions.map((opt) => {
						const active = kbRetrievalMode === opt.value;
						return (
							<button
								key={opt.value}
								type="button"
								onClick={() => void onModeChange(opt.value)}
								className={cn(
									"group relative rounded-2xl border p-4 text-left",
									"transition-[background-color,border-color,box-shadow] duration-150 ease-out",
									active
										? "border-primary bg-primary/[0.04] shadow-bai-card"
										: "border-border bg-surface hover:border-cream-500 hover:bg-warm-50/60",
								)}
							>
								<div className="flex items-center justify-between">
									<span
										className={cn(
											"text-[13px] font-semibold",
											active ? "text-primary" : "text-text-primary",
										)}
									>
										{opt.label}
									</span>
									{active && <SettingsBadge tone="primary">当前</SettingsBadge>}
								</div>
								<p className="mt-1.5 text-[11.5px] leading-relaxed text-text-muted">
									{opt.desc}
								</p>
							</button>
						);
					})}
				</div>
			</div>

			{/* 常用参数 */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
				<SettingsField
					label="Embedding 模型"
					hint="kb.embedding_model · 必须选择服务商支持的 embedding 专用模型，例如 OpenAI 的 text-embedding-3-small"
				>
					<Select
						value={kbEmbeddingModel}
						onChange={(event) =>
							void onEmbeddingModelChange(event.target.value)
						}
						variant="inline"
						placeholder="未选择（回退到 FTS / LIKE）"
						options={[
							{ value: "", label: "未选择（回退到 FTS / LIKE）" },
							...allModels.map((m) => ({
								value: m.id,
								label: `${m.id} · ${m.provider}`,
							})),
						]}
					/>
				</SettingsField>
			</div>

			{/* 高级参数 */}
			<SettingsDisclosure id="ai.agent.kb.advanced" title="高级检索参数">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<SettingsField
						label="Embedding 输入最大字符"
						hint="kb.embedding_max_chars · 规避 512 tokens 限制；超出会先截断（默认 480）"
					>
						<SettingsNumberInput
							value={kbEmbeddingMaxChars}
							min={32}
							max={4096}
							step={16}
							onChange={(value) => void onMaxCharsChange(value)}
							suffix="字符"
						/>
					</SettingsField>
					<SettingsField
						label="向量命中阈值"
						hint="kb.vector_min_score · 低于此值会回退到 FTS / LIKE（建议 0.15-0.35）"
					>
						<SettingsNumberInput
							value={kbVectorMinScore}
							min={0}
							max={1}
							step={0.01}
							onChange={(value) =>
								void onMinScoreChange(Number(value.toFixed(2)))
							}
						/>
					</SettingsField>
					<SettingsField
						label="补齐并发（兼容模式）"
						hint="kb.embedding_fallback_concurrency · 当服务商不支持批量 embeddings 时，按此并发逐条请求"
					>
						<SettingsNumberInput
							value={kbEmbeddingFallbackConcurrency}
							min={1}
							max={16}
							onChange={(value) => void onFallbackConcurrencyChange(value)}
						/>
					</SettingsField>
				</div>
			</SettingsDisclosure>

			{/* 统计 + 重建 */}
			<div className="rounded-2xl border border-border bg-cream-50 p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
							<Wrench className="h-3 w-3" strokeWidth={1.8} />
							索引状态
						</div>
						{kbStats ? (
							<div className="mt-1.5 flex items-baseline gap-2 text-[12.5px] text-text-secondary">
								<span className="text-[14px] font-semibold tabular-nums text-text-primary">
									{embedded}
								</span>
								<span className="text-text-light">/</span>
								<span className="tabular-nums text-text-muted">{total}</span>
								<span className="text-text-light">已向量化</span>
								{missing > 0 && (
									<SettingsBadge tone="warning">{missing} 待补</SettingsBadge>
								)}
								{missing === 0 && total > 0 && (
									<SettingsBadge tone="success">完整</SettingsBadge>
								)}
							</div>
						) : (
							<div className="mt-1.5 text-[12px] text-text-muted">
								暂未获取向量索引统计
							</div>
						)}
						{kbStats && total > 0 && (
							<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-200">
								<div
									className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
									style={{ width: `${coverage.toFixed(1)}%` }}
								/>
							</div>
						)}
					</div>
					<SettingsButton
						variant="primary"
						onClick={() => void onRebuild()}
						disabled={!kbEmbeddingModel}
						loading={isRebuilding}
					>
						{isRebuilding ? "生成中…" : "立即补齐"}
					</SettingsButton>
				</div>
			</div>

			{/* 提示 */}
			{needsModel && !kbEmbeddingModel && (
				<SettingsHint tone="warning" icon={Sparkles}>
					当前模式需要 Embedding 模型才能启用语义召回，请先在上方选择。
				</SettingsHint>
			)}
			{autoHint && (
				<SettingsHint tone="info" icon={Sparkles}>
					{autoHint}
				</SettingsHint>
			)}
		</SettingsCardSection>
	);
}
