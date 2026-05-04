// Agent 设置 - 资料库检索区段
//
// 包含检索模式、Embedding 输入长度、向量阈值、Embedding 模型、补齐并发、统计与立即补齐。

import { Database, Loader2 } from "lucide-react";
import type { KbEmbeddingStats } from "../../../../lib/api";
import { Select } from "../../../ui/Select";

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
	return (
		<div className="space-y-4">
			<h4 className="font-medium text-text-primary flex items-center gap-2">
				<Database className="w-4 h-4" />
				资料库检索
			</h4>
			<div className="space-y-3">
				<div>
					<label className="text-sm text-text-secondary mb-1.5 block">
						检索模式
					</label>
					<div className="grid grid-cols-3 gap-3">
						{retrievalModeOptions.map((opt) => (
							<button
								key={opt.value}
								onClick={() => void onModeChange(opt.value)}
								className={`p-3 rounded-xl text-left transition-colors ${
									kbRetrievalMode === opt.value
										? "border-2 border-primary bg-primary/5"
										: "border border-border hover:border-primary/50"
								}`}
							>
								<div
									className={`text-sm font-medium ${
										kbRetrievalMode === opt.value
											? "text-primary"
											: "text-text-primary"
									}`}
								>
									{opt.label}
								</div>
								<div className="text-xs text-text-muted mt-0.5">{opt.desc}</div>
							</button>
						))}
					</div>
				</div>

				<div>
					<label className="text-sm text-text-secondary mb-1.5 block">
						Embedding 输入最大长度
					</label>
					<div className="flex items-center gap-3">
						<div className="relative w-28">
							<input
								type="number"
								min={32}
								max={4096}
								step={16}
								value={kbEmbeddingMaxChars}
								onChange={(e) =>
									void onMaxCharsChange(parseInt(e.target.value) || 480)
								}
								className="w-full px-4 py-2.5 bg-surface hover:bg-warm-50 border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
							/>
						</div>
						<span className="text-xs text-text-muted">
							为规避部分服务商的 512 tokens 限制，向量化时会先截断内容（默认
							480 字符）。
						</span>
					</div>
				</div>

				<div>
					<label className="text-sm text-text-secondary mb-1.5 block">
						向量命中阈值
					</label>
					<div className="flex items-center gap-3">
						<div className="relative w-28">
							<input
								type="number"
								min={0}
								max={1}
								step={0.01}
								value={kbVectorMinScore}
								onChange={(e) =>
									void onMinScoreChange(parseFloat(e.target.value) || 0.2)
								}
								className="w-full px-4 py-2.5 bg-surface hover:bg-warm-50 border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
							/>
						</div>
						<span className="text-xs text-text-muted">
							仅保留相似度≥阈值的向量命中；不足时会自动回退到 FTS/LIKE
							兜底（建议 0.15-0.35）。
						</span>
					</div>
				</div>

				<div>
					<label className="text-sm text-text-secondary mb-1.5 block">
						Embedding 模型
					</label>
					<Select
						value={kbEmbeddingModel}
						onChange={(e) => void onEmbeddingModelChange(e.target.value)}
					>
						<option value="">未选择（将回退到 FTS/LIKE）</option>
						{allModels.map((m) => (
							<option key={`${m.provider}-${m.id}`} value={m.id}>
								{m.id} ({m.provider})
							</option>
						))}
					</Select>
					<p className="text-xs text-text-muted mt-1.5">
						用于将资料库分块转换为向量。
						<strong>必须选择服务商支持的 embedding 专用模型</strong>，如
						OpenAI 的 text-embedding-3-small。
					</p>
				</div>

				<div>
					<label className="text-sm text-text-secondary mb-1.5 block">
						索引补齐并发（兼容模式）
					</label>
					<div className="flex items-center gap-3">
						<div className="relative w-28">
							<input
								type="number"
								min={1}
								max={16}
								value={kbEmbeddingFallbackConcurrency}
								onChange={(e) =>
									void onFallbackConcurrencyChange(
										parseInt(e.target.value) || 4,
									)
								}
								className="w-full px-4 py-2.5 bg-surface hover:bg-warm-50 border border-border rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
							/>
						</div>
						<span className="text-xs text-text-muted">
							当服务商不支持批量 embeddings
							时，自动降级为逐条请求并按此并发数执行（1-16）。
						</span>
					</div>
				</div>

				<div className="flex items-center justify-between pt-2">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
						<div className="text-sm text-text-secondary break-words">
							{kbStats
								? `分块总数 ${kbStats.total_chunks}，已向量化 ${kbStats.embedded_chunks}，缺失 ${kbStats.missing_chunks}`
								: "暂未获取向量索引统计"}
							{autoHint && (
								<div className="text-xs text-text-muted mt-1">{autoHint}</div>
							)}
						</div>
						<button
							onClick={() => void onRebuild()}
							disabled={isRebuilding || !kbEmbeddingModel}
							className="min-w-[100px] px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text-primary hover:text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 self-start sm:self-auto whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
						>
							{isRebuilding ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin shrink-0" />
									<span>生成中...</span>
								</>
							) : (
								<span>立即补齐</span>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
