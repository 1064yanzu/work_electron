/**
 * StyleProfileCalibratePanel — 风格维度手动校准编辑器
 *
 * 展示 AI 分析结果，支持 v1（三层）和 v2（灵魂-骨干-血肉）格式。
 * v1 支持编辑，v2 当前为只读展示。
 */
import {
	Check,
	ChevronDown,
	Minus,
	Pencil,
	Plus,
	RotateCcw,
	Save,
	X,
	Info,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
	StyleAnalysisData,
	StyleAxisAnalysis,
	StyleCalibrationAnchors,
} from "../../../../../electron/shared/ipc-schema";
import {
	getStyleAnalysis,
	updateStyleAnalysis,
} from "../../../../lib/api/styleProfile";
import { StyleAnalysisV2Display } from "./StyleAnalysisV2Display";

interface Props {
	profileId: string;
	/** 分析完成后通知父组件刷新 */
	onUpdated?: () => void;
}

type IntensityValue = StyleAxisAnalysis["intensity"];

const INTENSITY_LABELS: Record<IntensityValue, string> = {
	low: "弱",
	medium: "中",
	high: "强",
	insufficient_evidence: "证据不足",
};

const INTENSITY_COLORS: Record<IntensityValue, string> = {
	low: "bg-cream-200 text-cream-700 dark:bg-cream-700/50 dark:text-cream-300",
	medium: "bg-mint-100 text-mint-700 dark:bg-mint-900/30 dark:text-mint-300",
	high: "bg-violetx-100 text-violetx-700 dark:bg-violetx-900/30 dark:text-violetx-300",
	insufficient_evidence:
		"bg-warm-200 text-text-muted dark:bg-cream-700/30 dark:text-text-muted",
};

const DIMENSION_GROUPS: Array<{
	key: keyof Pick<
		StyleAnalysisData,
		"cognitive_pattern" | "rhetorical_stance" | "language_aesthetic"
	>;
	label: string;
	description: string;
}> = [
	{
		key: "cognitive_pattern",
		label: "文本认知模式",
		description: "作者如何构建信息结构和认知框架",
	},
	{
		key: "rhetorical_stance",
		label: "话语姿态",
		description: "作者与读者、话题之间的关系姿态",
	},
	{
		key: "language_aesthetic",
		label: "语言审美",
		description: "词汇选择、句式节奏、风格取向",
	},
];

export function StyleProfileCalibratePanel({ profileId, onUpdated }: Props) {
	const [analysis, setAnalysis] = useState<StyleAnalysisData | null>(null);
	const [draft, setDraft] = useState<StyleAnalysisData | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [isDirty, setIsDirty] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
		new Set(["cognitive_pattern"]),
	);
	const [editingAxis, setEditingAxis] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await getStyleAnalysis(profileId);
			setAnalysis(data);
			setDraft(data ? JSON.parse(JSON.stringify(data)) : null);
		} finally {
			setLoading(false);
		}
	}, [profileId]);

	useEffect(() => {
		void load();
	}, [load]);

	const toggleGroup = useCallback((key: string) => {
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const updateAxisField = useCallback(
		(
			groupKey: keyof Pick<
				StyleAnalysisData,
				"cognitive_pattern" | "rhetorical_stance" | "language_aesthetic"
			>,
			index: number,
			field: keyof StyleAxisAnalysis,
			value: string,
		) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const currentGroup = prev[groupKey];
				if (!Array.isArray(currentGroup)) return prev;
				const group = [...currentGroup];
				group[index] = { ...group[index], [field]: value };
				return { ...prev, [groupKey]: group };
			});
			setIsDirty(true);
		},
		[],
	);

	const addAxis = useCallback(
		(
			groupKey: keyof Pick<
				StyleAnalysisData,
				"cognitive_pattern" | "rhetorical_stance" | "language_aesthetic"
			>,
		) => {
			const newAxis: StyleAxisAnalysis = {
				name: "新维度",
				description: "",
				intensity: "medium",
			};
			setDraft((prev) => {
				if (!prev) return prev;
				const currentGroup = prev[groupKey];
				if (!Array.isArray(currentGroup)) return prev;
				return { ...prev, [groupKey]: [...currentGroup, newAxis] };
			});
			setIsDirty(true);
		},
		[],
	);

	const removeAxis = useCallback(
		(
			groupKey: keyof Pick<
				StyleAnalysisData,
				"cognitive_pattern" | "rhetorical_stance" | "language_aesthetic"
			>,
			index: number,
		) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const currentGroup = prev[groupKey];
				if (!Array.isArray(currentGroup)) return prev;
				const group = [...currentGroup];
				group.splice(index, 1);
				return { ...prev, [groupKey]: group };
			});
			setIsDirty(true);
		},
		[],
	);

	const updateAnchor = useCallback(
		(
			field: keyof Pick<
				StyleCalibrationAnchors,
				"positive" | "negative" | "missing"
			>,
			index: number,
			value: string,
		) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const anchors = { ...prev.calibration_anchors };
				const currentList = anchors[field];
				if (!Array.isArray(currentList)) return prev;
				const list = [...currentList];
				list[index] = value;
				return { ...prev, calibration_anchors: { ...anchors, [field]: list } };
			});
			setIsDirty(true);
		},
		[],
	);

	const addAnchor = useCallback(
		(
			field: keyof Pick<
				StyleCalibrationAnchors,
				"positive" | "negative" | "missing"
			>,
		) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const anchors = { ...prev.calibration_anchors };
				const currentList = anchors[field];
				if (!Array.isArray(currentList)) return prev;
				return {
					...prev,
					calibration_anchors: { ...anchors, [field]: [...currentList, ""] },
				};
			});
			setIsDirty(true);
		},
		[],
	);

	const removeAnchor = useCallback(
		(
			field: keyof Pick<
				StyleCalibrationAnchors,
				"positive" | "negative" | "missing"
			>,
			index: number,
		) => {
			setDraft((prev) => {
				if (!prev) return prev;
				const anchors = { ...prev.calibration_anchors };
				const currentList = anchors[field];
				if (!Array.isArray(currentList)) return prev;
				return {
					...prev,
					calibration_anchors: {
						...anchors,
						[field]: currentList.filter((_, i) => i !== index),
					},
				};
			});
			setIsDirty(true);
		},
		[],
	);

	const handleSave = useCallback(async () => {
		if (!draft) return;
		setSaving(true);
		try {
			const saved = await updateStyleAnalysis(profileId, draft);
			setAnalysis(saved);
			setDraft(JSON.parse(JSON.stringify(saved)));
			setIsDirty(false);
			onUpdated?.();
		} catch (e) {
			console.error("保存校准结果失败:", e);
		} finally {
			setSaving(false);
		}
	}, [draft, profileId, onUpdated]);

	const handleReset = useCallback(() => {
		if (analysis) {
			setDraft(JSON.parse(JSON.stringify(analysis)));
			setIsDirty(false);
		}
	}, [analysis]);

	if (loading) {
		return (
			<div className="py-4 text-xs text-text-muted text-center">
				加载分析结果…
			</div>
		);
	}

	if (!draft) {
		return (
			<div className="rounded-xl border border-dashed border-cream-300 dark:border-cream-600/50 px-4 py-5 text-center">
				<p className="text-xs text-text-muted">
					暂无分析结果。请先添加样本文章，然后点击「AI 分析」生成风格规则。
				</p>
			</div>
		);
	}

	// 检测是否为 v2 数据
	const isV2 = draft.schema_version === "v2";

	// v2 数据：只读展示
	if (isV2) {
		return (
			<div className="space-y-4">
				{/* v2 提示 */}
				<div className="flex items-start gap-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200/70 dark:border-violet-700/40 px-3 py-2">
					<Info
						size={12}
						className="shrink-0 text-violet-600 dark:text-violet-400 mt-0.5"
					/>
					<div className="flex-1 text-xs text-violet-700 dark:text-violet-300">
						<div className="font-medium mb-0.5">
							完整「灵魂-骨干-血肉」体系分析
						</div>
						<div className="text-violet-600/80 dark:text-violet-400/80">
							包含 8
							层结构和关系性维度（气韵、全息、经变）。当前为只读展示，编辑功能即将推出。
						</div>
					</div>
				</div>

				{/* v2 数据展示 */}
				<StyleAnalysisV2Display
					soulLayer={draft.soul_layer}
					thinkingOperation={draft.thinking_operation}
					articulationPattern={draft.articulation_pattern}
					textureLayer={draft.texture_layer}
					crossCutting={draft.cross_cutting}
					calibrationAnchors={draft.calibration_anchors}
				/>
			</div>
		);
	}

	// v1 数据：可编辑
	return (
		<div className="space-y-4">
			{/* 顶部工具栏 */}
			{isDirty && (
				<div className="flex items-center justify-between rounded-lg bg-peach-50 dark:bg-peach-900/20 border border-peach-200/70 dark:border-peach-700/40 px-3 py-2">
					<span className="text-xs text-peach-700 dark:text-peach-300">
						有未保存的更改
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleReset}
							className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
						>
							<RotateCcw size={11} />
							还原
						</button>
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={saving}
							className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full bg-cream-900 dark:bg-cream-100 text-cream-50 dark:text-cream-900 hover:opacity-90 disabled:opacity-50 transition-opacity duration-150"
						>
							<Save size={11} />
							{saving ? "保存中…" : "保存"}
						</button>
					</div>
				</div>
			)}

			{/* 三层维度 */}
			{DIMENSION_GROUPS.map(({ key, label, description }) => {
				const axes = draft[key];
				// v2 兼容：如果不是数组则跳过
				if (!Array.isArray(axes)) return null;

				const isExpanded = expandedGroups.has(key);
				return (
					<div
						key={key}
						className="rounded-xl border border-cream-200/80 dark:border-cream-600/40 overflow-hidden"
					>
						{/* 组头部 */}
						<button
							type="button"
							onClick={() => toggleGroup(key)}
							className="w-full flex items-center gap-2 px-4 py-3 text-left bg-cream-50/50 dark:bg-cream-800/30 hover:bg-cream-100/50 dark:hover:bg-cream-800/50 transition-colors duration-150"
						>
							<ChevronDown
								size={13}
								className={`shrink-0 text-text-muted transition-transform duration-150 ${isExpanded ? "" : "-rotate-90"}`}
							/>
							<div className="flex-1 min-w-0">
								<div className="text-xs font-semibold text-text-primary">
									{label}
								</div>
								<div className="text-[11px] text-text-muted mt-0.5">
									{description}
								</div>
							</div>
							<span className="text-[11px] text-text-muted shrink-0">
								{axes.length} 项
							</span>
						</button>

						{/* 维度列表 */}
						{isExpanded && (
							<div className="divide-y divide-cream-200/60 dark:divide-cream-600/30">
								{axes.map((axis, i) => (
									<AxisRow
										key={`${key}-${i}`}
										axis={axis}
										isEditing={editingAxis === `${key}-${i}`}
										onStartEdit={() => setEditingAxis(`${key}-${i}`)}
										onEndEdit={() => setEditingAxis(null)}
										onUpdate={(field, value) =>
											updateAxisField(key, i, field, value)
										}
										onRemove={() => removeAxis(key, i)}
									/>
								))}
								<div className="px-4 py-2.5">
									<button
										type="button"
										onClick={() => addAxis(key)}
										className="flex items-center gap-1 text-xs text-text-muted hover:text-mint-600 dark:hover:text-mint-400 transition-colors duration-150"
									>
										<Plus size={11} />
										添加维度
									</button>
								</div>
							</div>
						)}
					</div>
				);
			})}

			{/* 校准锚点 */}
			<div className="rounded-xl border border-cream-200/80 dark:border-cream-600/40 overflow-hidden">
				<button
					type="button"
					onClick={() => toggleGroup("anchors")}
					className="w-full flex items-center gap-2 px-4 py-3 text-left bg-cream-50/50 dark:bg-cream-800/30 hover:bg-cream-100/50 dark:hover:bg-cream-800/50 transition-colors duration-150"
				>
					<ChevronDown
						size={13}
						className={`shrink-0 text-text-muted transition-transform duration-150 ${expandedGroups.has("anchors") ? "" : "-rotate-90"}`}
					/>
					<div className="flex-1 min-w-0">
						<div className="text-xs font-semibold text-text-primary">
							校准锚点
						</div>
						<div className="text-[11px] text-text-muted mt-0.5">
							正向示例 / 负向示例 / 证据不足的维度
						</div>
					</div>
				</button>

				{expandedGroups.has("anchors") && (
					<div className="px-4 py-4 space-y-4">
						{(
							[
								{
									field: "positive" as const,
									label: "正向示例",
									color: "text-mint-600 dark:text-mint-400",
								},
								{
									field: "negative" as const,
									label: "负向示例",
									color: "text-peach-600 dark:text-peach-400",
								},
								{
									field: "missing" as const,
									label: "证据不足",
									color: "text-text-muted",
								},
							] as const
						).map(({ field, label, color }) => (
							<div key={field}>
								<div className={`mb-1.5 text-[11px] font-semibold ${color}`}>
									{label}
								</div>
								<div className="space-y-1">
									{draft.calibration_anchors[field].map((item, i) => (
										<div key={i} className="flex items-center gap-2">
											<input
												type="text"
												value={item}
												onChange={(e) => updateAnchor(field, i, e.target.value)}
												className="flex-1 text-xs bg-cream-100/60 dark:bg-cream-800/40 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-cream-400 dark:focus:ring-cream-500/50 placeholder-text-muted/40"
												placeholder={`输入${label}示例`}
											/>
											<button
												type="button"
												onClick={() => removeAnchor(field, i)}
												className="shrink-0 p-1 text-text-muted/40 hover:text-peach-500 transition-colors duration-150"
											>
												<X size={11} />
											</button>
										</div>
									))}
									<button
										type="button"
										onClick={() => addAnchor(field)}
										className="flex items-center gap-1 text-[11px] text-text-muted hover:text-mint-600 dark:hover:text-mint-400 transition-colors duration-150"
									>
										<Plus size={10} />
										添加
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* 无改动时无需显示底部按钮 */}
		</div>
	);
}

// ── 维度行：只读/编辑双模式 ──────────────────────────────────────────────────

interface AxisRowProps {
	axis: StyleAxisAnalysis;
	isEditing: boolean;
	onStartEdit: () => void;
	onEndEdit: () => void;
	onUpdate: (field: keyof StyleAxisAnalysis, value: string) => void;
	onRemove: () => void;
}

function AxisRow({
	axis,
	isEditing,
	onStartEdit,
	onEndEdit,
	onUpdate,
	onRemove,
}: AxisRowProps) {
	const intensities: IntensityValue[] = [
		"low",
		"medium",
		"high",
		"insufficient_evidence",
	];

	if (!isEditing) {
		return (
			<div className="group flex items-start gap-3 px-4 py-3 hover:bg-cream-50/50 dark:hover:bg-cream-800/20 transition-colors duration-150">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<span className="text-xs font-medium text-text-primary">
							{axis.name}
						</span>
						<span
							className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${INTENSITY_COLORS[axis.intensity]}`}
						>
							{INTENSITY_LABELS[axis.intensity]}
						</span>
					</div>
					{axis.description && (
						<p className="mt-0.5 text-xs text-text-secondary leading-relaxed">
							{axis.description}
						</p>
					)}
					{axis.conditions && (
						<p className="mt-0.5 text-[11px] text-text-muted italic">
							条件：{axis.conditions}
						</p>
					)}
				</div>
				<div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
					<button
						type="button"
						onClick={onStartEdit}
						className="rounded p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200/70 dark:hover:bg-cream-700/40 transition-colors duration-150"
						title="编辑"
					>
						<Pencil size={11} />
					</button>
					<button
						type="button"
						onClick={onRemove}
						className="rounded p-1.5 text-text-muted hover:text-peach-500 hover:bg-peach-50 dark:hover:bg-peach-900/20 transition-colors duration-150"
						title="删除"
					>
						<Minus size={11} />
					</button>
				</div>
			</div>
		);
	}

	// 编辑模式
	return (
		<div className="px-4 py-3 space-y-2.5 bg-cream-50/80 dark:bg-cream-800/30 border-l-2 border-mint-400/60 dark:border-mint-500/40">
			<div className="flex items-center gap-2">
				<input
					type="text"
					value={axis.name}
					onChange={(e) => onUpdate("name", e.target.value)}
					className="flex-1 text-xs font-medium bg-cream-100/70 dark:bg-cream-800/50 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-mint-400/50 dark:focus:ring-mint-500/40"
					placeholder="维度名称"
				/>
				<button
					type="button"
					onClick={onEndEdit}
					className="shrink-0 rounded-full p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/70 dark:hover:bg-cream-700/40 transition-colors duration-150"
				>
					<Check size={12} />
				</button>
			</div>

			<textarea
				value={axis.description}
				onChange={(e) => onUpdate("description", e.target.value)}
				rows={3}
				className="w-full text-xs bg-cream-100/70 dark:bg-cream-800/50 rounded-lg px-3 py-2 text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-mint-400/50 dark:focus:ring-mint-500/40 placeholder-text-muted/40"
				placeholder="描述此维度的特点…"
			/>

			{/* 强度选择 */}
			<div className="flex items-center gap-1.5">
				<span className="text-[11px] text-text-muted shrink-0">强度：</span>
				{intensities.map((level) => (
					<button
						key={level}
						type="button"
						onClick={() => onUpdate("intensity", level)}
						className={`px-2 py-0.5 text-[9px] rounded-full border transition-colors duration-150 ${
							axis.intensity === level
								? "border-transparent " + INTENSITY_COLORS[level]
								: "border-cream-200 dark:border-cream-600/40 text-text-muted hover:border-cream-400 dark:hover:border-cream-400/50"
						}`}
					>
						{INTENSITY_LABELS[level]}
					</button>
				))}
			</div>

			<input
				type="text"
				value={axis.conditions ?? ""}
				onChange={(e) => onUpdate("conditions", e.target.value)}
				className="w-full text-xs bg-cream-100/70 dark:bg-cream-800/50 rounded-lg px-3 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-mint-400/50 dark:focus:ring-mint-500/40 placeholder-text-muted/40"
				placeholder="触发条件（可选）：仅在某类文章中…"
			/>
		</div>
	);
}
