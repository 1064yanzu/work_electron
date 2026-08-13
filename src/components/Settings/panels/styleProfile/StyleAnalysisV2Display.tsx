/**
 * StyleAnalysisV2Display — v2 风格分析结果展示组件
 *
 * 展示完整的「灵魂-骨干-血肉」体系分析结果，包括关系性维度
 */
import { ChevronDown, Layers, Sparkles, GitBranch } from "lucide-react";
import { useState } from "react";
import type {
	SoulLayerAnalysis,
	ThinkingOperationAnalysis,
	ArticulationPatternAnalysis,
	TextureLayerAnalysis,
	CrossCuttingTopics,
	StyleCalibrationAnchors,
	StyleAxisAnalysis,
} from "../../../../../electron/shared/ipc-schema";

interface Props {
	soulLayer?: SoulLayerAnalysis;
	thinkingOperation?: ThinkingOperationAnalysis;
	articulationPattern?: ArticulationPatternAnalysis;
	textureLayer?: TextureLayerAnalysis;
	crossCutting?: CrossCuttingTopics;
	calibrationAnchors: StyleCalibrationAnchors;
}

type LayerKey =
	| "soul"
	| "thinking"
	| "articulation"
	| "texture"
	| "cross"
	| "relational";

const LAYER_CONFIGS = [
	{
		key: "soul" as const,
		label: "灵魂层",
		description: "世界观与根本姿态",
		icon: Sparkles,
	},
	{
		key: "thinking" as const,
		label: "骨干层·思维运作",
		description: "思维如何运动",
		icon: GitBranch,
	},
	{
		key: "articulation" as const,
		label: "骨干层·篇章外化",
		description: "思维如何落到篇章",
		icon: Layers,
	},
	{
		key: "texture" as const,
		label: "血肉层",
		description: "语言质感与指纹",
		icon: Sparkles,
	},
] as const;

function AxisItem({ axis }: { axis: StyleAxisAnalysis }) {
	const intensityColors = {
		high: "text-mint-600 bg-mint-500/10",
		medium: "text-info bg-info-muted",
		low: "text-text-muted bg-surface",
		insufficient_evidence: "text-warning bg-warning-muted",
	};

	const constancyLabel = {
		constant: "经",
		variable: "变",
	};

	return (
		<div className="flex gap-2 items-start text-xs">
			<span
				className={`shrink-0 rounded-lg px-1.5 py-0.5 font-medium ${intensityColors[axis.intensity]}`}
			>
				{axis.intensity === "insufficient_evidence"
					? "证据不足"
					: axis.intensity}
			</span>
			<div className="flex-1 min-w-0">
				<div className="font-medium text-text-primary mb-0.5 flex items-center gap-1.5">
					{axis.name}
					{axis.constancy && (
						<span className="text-2xs px-1 py-0.5 rounded-lg bg-warm-200 text-text-muted">
							{constancyLabel[axis.constancy]}
						</span>
					)}
				</div>
				<div className="text-text-secondary leading-relaxed">
					{axis.description}
				</div>
				{axis.conditions && (
					<div className="mt-1 text-2xs text-text-muted italic">
						条件：{axis.conditions}
					</div>
				)}
				{axis.variance_note && axis.constancy === "variable" && (
					<div className="mt-1 text-2xs text-warning">
						浮动：{axis.variance_note}
					</div>
				)}
			</div>
		</div>
	);
}

function DimensionGroup({
	title,
	axes,
}: {
	title: string;
	axes: StyleAxisAnalysis[];
}) {
	if (axes.length === 0) return null;

	return (
		<div className="space-y-2">
			<div className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
				{title}
			</div>
			<div className="space-y-2.5">
				{axes.map((axis, i) => (
					<AxisItem key={`${title}-${i}`} axis={axis} />
				))}
			</div>
		</div>
	);
}

function LayerSection({
	config,
	data,
	isExpanded,
	onToggle,
}: {
	config: (typeof LAYER_CONFIGS)[number];
	data: Record<string, StyleAxisAnalysis[]> | undefined;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	if (!data) return null;

	const Icon = config.icon;
	const totalAxes = Object.values(data).flat().length;

	if (totalAxes === 0) return null;

	return (
		<div className="rounded-xl border border-border/80 overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface/50 hover:bg-background/50 transition-colors duration-150"
			>
				<Icon size={14} className="shrink-0 text-text-secondary" />
				<div className="flex-1 min-w-0">
					<div className="text-xs font-semibold text-text-primary">
						{config.label}
					</div>
					<div className="text-2xs text-text-muted mt-0.5">
						{config.description}
					</div>
				</div>
				<span className="text-2xs text-text-muted shrink-0">
					{totalAxes} 个维度
				</span>
				<ChevronDown
					size={13}
					className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
				/>
			</button>

			{isExpanded && (
				<div className="px-4 py-4 space-y-4 bg-surface/30">
					{Object.entries(data).map(([key, axes]) => (
						<DimensionGroup key={key} title={key} axes={axes} />
					))}
				</div>
			)}
		</div>
	);
}

function CrossCuttingSection({
	crossCutting,
	isExpanded,
	onToggle,
}: {
	crossCutting: CrossCuttingTopics;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const hasContent =
		crossCutting.recurring_imagery ||
		crossCutting.humor_irony ||
		crossCutting.title_habit ||
		crossCutting.meta_commentary;

	if (!hasContent) return null;

	return (
		<div className="rounded-xl border border-border/80 overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface/50 hover:bg-background/50 transition-colors duration-150"
			>
				<Layers size={14} className="shrink-0 text-text-secondary" />
				<div className="flex-1 min-w-0">
					<div className="text-xs font-semibold text-text-primary">
						横切话题
					</div>
					<div className="text-2xs text-text-muted mt-0.5">贯穿三层的主题</div>
				</div>
				<ChevronDown
					size={13}
					className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
				/>
			</button>

			{isExpanded && (
				<div className="px-4 py-4 space-y-3 bg-surface/30 text-xs">
					{crossCutting.recurring_imagery && (
						<div>
							<div className="font-semibold text-text-primary mb-1">
								执念意象
							</div>
							<div className="space-y-1 text-text-secondary">
								<div>
									<span className="text-text-muted">灵魂：</span>
									{crossCutting.recurring_imagery.soul}
								</div>
								<div>
									<span className="text-text-muted">骨干：</span>
									{crossCutting.recurring_imagery.structure}
								</div>
								<div>
									<span className="text-text-muted">血肉：</span>
									{crossCutting.recurring_imagery.texture}
								</div>
							</div>
						</div>
					)}
					{crossCutting.humor_irony && (
						<div>
							<div className="font-semibold text-text-primary mb-1">
								幽默与讽刺
							</div>
							<div className="space-y-1 text-text-secondary">
								<div>
									<span className="text-text-muted">灵魂：</span>
									{crossCutting.humor_irony.soul}
								</div>
								<div>
									<span className="text-text-muted">骨干：</span>
									{crossCutting.humor_irony.structure}
								</div>
								<div>
									<span className="text-text-muted">血肉：</span>
									{crossCutting.humor_irony.texture}
								</div>
							</div>
						</div>
					)}
					{crossCutting.title_habit && (
						<div>
							<div className="font-semibold text-text-primary mb-1">
								标题习惯
							</div>
							<div className="space-y-1 text-text-secondary">
								<div>
									<span className="text-text-muted">骨干：</span>
									{crossCutting.title_habit.structure}
								</div>
								<div>
									<span className="text-text-muted">血肉：</span>
									{crossCutting.title_habit.texture}
								</div>
							</div>
						</div>
					)}
					{crossCutting.meta_commentary && (
						<div>
							<div className="font-semibold text-text-primary mb-1">元评论</div>
							<div className="space-y-1 text-text-secondary">
								<div>
									<span className="text-text-muted">灵魂：</span>
									{crossCutting.meta_commentary.soul}
								</div>
								<div>
									<span className="text-text-muted">骨干：</span>
									{crossCutting.meta_commentary.structure}
								</div>
								<div>
									<span className="text-text-muted">血肉：</span>
									{crossCutting.meta_commentary.texture}
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function RelationalSection({
	anchors,
	isExpanded,
	onToggle,
}: {
	anchors: StyleCalibrationAnchors;
	isExpanded: boolean;
	onToggle: () => void;
}) {
	const hasRelational =
		anchors.layer_harmony ||
		(anchors.holographic_patterns && anchors.holographic_patterns.length > 0) ||
		anchors.constancy_variance;

	if (!hasRelational) return null;

	return (
		<div className="rounded-xl border border-border/80 overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				className="w-full flex items-center gap-3 px-4 py-3 text-left bg-surface/50 hover:bg-background/50 transition-colors duration-150"
			>
				<GitBranch size={14} className="shrink-0 text-text-secondary" />
				<div className="flex-1 min-w-0">
					<div className="text-xs font-semibold text-text-primary">
						关系性维度
					</div>
					<div className="text-2xs text-text-muted mt-0.5">
						气韵、全息、经变
					</div>
				</div>
				<ChevronDown
					size={13}
					className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
				/>
			</button>

			{isExpanded && (
				<div className="px-4 py-4 space-y-3 bg-surface/30 text-xs">
					{anchors.layer_harmony && (
						<div>
							<div className="font-semibold text-text-primary mb-1">
								气韵（跨层）
							</div>
							<div className="text-text-secondary leading-relaxed">
								{anchors.layer_harmony.description}
							</div>
						</div>
					)}
					{anchors.holographic_patterns &&
						anchors.holographic_patterns.length > 0 && (
							<div>
								<div className="font-semibold text-text-primary mb-2">
									全息性（跨尺度）
								</div>
								<div className="space-y-2">
									{anchors.holographic_patterns.map((pattern, i) => (
										<div key={i} className="rounded-lg bg-surface/50 p-2.5">
											<div className="font-medium text-text-primary mb-1">
												{pattern.name}
											</div>
											<div className="text-text-secondary mb-1.5">
												{pattern.description}
											</div>
											<div className="space-y-1 text-2xs text-text-muted">
												{pattern.sentence_level && (
													<div>句子级：{pattern.sentence_level}</div>
												)}
												{pattern.paragraph_level && (
													<div>段落级：{pattern.paragraph_level}</div>
												)}
												{pattern.article_level && (
													<div>全文级：{pattern.article_level}</div>
												)}
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					{anchors.constancy_variance && (
						<div>
							<div className="font-semibold text-text-primary mb-1">
								经变分布（跨篇）
							</div>
							<div className="text-text-secondary leading-relaxed mb-2">
								{anchors.constancy_variance.summary}
							</div>
							<div className="grid grid-cols-2 gap-2 text-2xs">
								<div className="rounded-lg bg-mint-500/10 p-2">
									<div className="font-medium text-mint-600 mb-1">
										经（不变）
									</div>
									<div className="space-y-0.5 text-text-muted">
										{anchors.constancy_variance.constants.map((c, i) => (
											<div key={i}>• {c}</div>
										))}
									</div>
								</div>
								<div className="rounded-lg bg-warning-muted p-2">
									<div className="font-medium text-warning mb-1">
										变（摆动）
									</div>
									<div className="space-y-0.5 text-text-muted">
										{anchors.constancy_variance.variables.map((v, i) => (
											<div key={i}>
												<div className="font-medium">{v.dimension}</div>
												<div className="text-2xs pl-2">{v.range}</div>
											</div>
										))}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function StyleAnalysisV2Display({
	soulLayer,
	thinkingOperation,
	articulationPattern,
	textureLayer,
	crossCutting,
	calibrationAnchors,
}: Props) {
	const [expandedLayers, setExpandedLayers] = useState<Set<LayerKey>>(
		new Set(["soul"]),
	);

	const toggleLayer = (key: LayerKey) => {
		setExpandedLayers((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	};

	return (
		<div className="space-y-3">
			{/* 三个内容层 + 横切话题 */}
			{LAYER_CONFIGS.map((config) => {
				let data: Record<string, StyleAxisAnalysis[]> | undefined;
				if (config.key === "soul")
					data = soulLayer as unknown as Record<string, StyleAxisAnalysis[]>;
				if (config.key === "thinking")
					data = thinkingOperation as unknown as Record<
						string,
						StyleAxisAnalysis[]
					>;
				if (config.key === "articulation")
					data = articulationPattern as unknown as Record<
						string,
						StyleAxisAnalysis[]
					>;
				if (config.key === "texture")
					data = textureLayer as unknown as Record<string, StyleAxisAnalysis[]>;

				return (
					<LayerSection
						key={config.key}
						config={config}
						data={data}
						isExpanded={expandedLayers.has(config.key)}
						onToggle={() => toggleLayer(config.key)}
					/>
				);
			})}

			{/* 横切话题 */}
			{crossCutting && (
				<CrossCuttingSection
					crossCutting={crossCutting}
					isExpanded={expandedLayers.has("cross")}
					onToggle={() => toggleLayer("cross")}
				/>
			)}

			{/* 关系性维度 */}
			<RelationalSection
				anchors={calibrationAnchors}
				isExpanded={expandedLayers.has("relational")}
				onToggle={() => toggleLayer("relational")}
			/>
		</div>
	);
}
