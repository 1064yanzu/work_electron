/**
 * StyleProfileListItem — 风格包列表行组件
 *
 * 改进点：
 * - 修复 onSetActive 未使用的 bug，在头部添加 radio 选择按钮
 * - 替换 window.prompt() 为内联 StyleSampleTextForm
 * - 添加删除前二次确认（内联）
 * - 分析进度改为步骤可视化
 * - 样本数量在折叠态也可见
 * - 展开/折叠过渡动画更流畅
 */
import {
	Archive,
	ArchiveRestore,
	ChevronDown,
	FileText,
	Loader2,
	Plus,
	Sparkles,
	Trash2,
	AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	StyleProfile,
	StyleAnalysisData,
	StyleAnalysisProgressEvent,
	StyleSample,
} from "../../../../../electron/shared/ipc-schema";
import {
	getStyleAnalysis,
	startStyleAnalysis,
	onStyleAnalysisProgress,
	listStyleSamples,
	addStyleSample,
	removeStyleSample,
} from "../../../../lib/api/styleProfile";
import { StyleProfileCalibratePanel } from "./StyleProfileCalibratePanel";
import { StyleSampleTextForm } from "./StyleSampleTextForm";
import { StyleSampleImportPanel } from "./StyleSampleImportPanel";

interface Props {
	profile: StyleProfile;
	isActive: boolean;
	archived?: boolean;
	/** 新建后自动展开 */
	initialExpanded?: boolean;
	onSetActive: () => void;
	onDelete: () => void;
	onArchive: () => void;
	onRefresh: () => void;
}

type AnalyzeStep = {
	step: number;
	total: number;
	name: string;
	done: boolean;
};

export function StyleProfileListItem({
	profile,
	isActive,
	archived,
	initialExpanded = false,
	onSetActive,
	onDelete,
	onArchive,
}: Props) {
	const [expanded, setExpanded] = useState(initialExpanded);
	const [analysis, setAnalysis] = useState<StyleAnalysisData | null>(null);
	const [samples, setSamples] = useState<StyleSample[]>([]);
	const [analyzing, setAnalyzing] = useState(false);
	const [analyzeSteps, setAnalyzeSteps] = useState<AnalyzeStep[]>([]);
	const [analyzeError, setAnalyzeError] = useState<string | null>(null);
	const [loadingDetails, setLoadingDetails] = useState(false);
	const [showTextForm, setShowTextForm] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const unlistenRef = useRef<(() => void) | null>(null);

	const loadDetails = useCallback(async () => {
		if (loadingDetails) return;
		setLoadingDetails(true);
		try {
			const [a, s] = await Promise.all([
				getStyleAnalysis(profile.id),
				listStyleSamples(profile.id),
			]);
			setAnalysis(a);
			setSamples(s);
		} finally {
			setLoadingDetails(false);
		}
	}, [profile.id, loadingDetails]);

	useEffect(() => {
		if (expanded) {
			void loadDetails();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [expanded]);

	useEffect(
		() => () => {
			unlistenRef.current?.();
		},
		[],
	);

	const handleAnalyze = useCallback(async () => {
		if (analyzing) return;
		setAnalyzing(true);
		setAnalyzeError(null);
		setAnalyzeSteps([]);

		try {
			const unlisten = await onStyleAnalysisProgress(
				(event: StyleAnalysisProgressEvent) => {
					if (event.profile_id !== profile.id) return;

					if (event.status === "error") {
						setAnalyzeError(event.error ?? "未知错误");
						setAnalyzing(false);
						return;
					}

					setAnalyzeSteps((prev) => {
						const existing = prev.findIndex((s) => s.step === event.step);
						const newStep: AnalyzeStep = {
							step: event.step,
							total: event.total_steps,
							name: event.step_name,
							done: event.status === "done",
						};
						if (existing >= 0) {
							const next = [...prev];
							next[existing] = newStep;
							return next;
						}
						return [...prev, newStep];
					});

					if (event.step === event.total_steps && event.status === "done") {
						setAnalyzing(false);
						void loadDetails();
					}
				},
			);
			unlistenRef.current = unlisten;
			await startStyleAnalysis(profile.id, profile.analyze_model_id ?? undefined);
		} catch (err) {
			setAnalyzeError(err instanceof Error ? err.message : String(err));
			setAnalyzing(false);
		}
	}, [analyzing, profile.id, profile.analyze_model_id, loadDetails]);

	const handleAddSampleFromText = useCallback(
		async (content: string, title?: string) => {
			await addStyleSample({ profile_id: profile.id, content, title });
			await loadDetails();
			setShowTextForm(false);
		},
		[profile.id, loadDetails],
	);

	const handleRemoveSample = useCallback(
		async (id: string) => {
			await removeStyleSample(id);
			await loadDetails();
		},
		[loadDetails],
	);

	const handleDeleteClick = useCallback(() => {
		if (confirmDelete) {
			onDelete();
		} else {
			setConfirmDelete(true);
			// 3 秒后自动取消确认态
			setTimeout(() => setConfirmDelete(false), 3000);
		}
	}, [confirmDelete, onDelete]);

	return (
		<div
			className={`rounded-xl border overflow-hidden transition-all duration-200 ${
				isActive
					? "border-mint-400/60 dark:border-mint-500/40 shadow-sm shadow-mint-100/50 dark:shadow-mint-900/20"
					: "border-cream-300/70 dark:border-cream-600/40"
			} bg-white/60 dark:bg-cream-800/30`}
		>
			{/* ── 头部行 ─────────────────────────────────────────────────── */}
			<div className="flex items-center gap-2.5 px-3.5 py-3">
				{/* 激活 Radio 按钮 */}
				{!archived && (
					<button
						type="button"
						onClick={onSetActive}
						title={isActive ? "当前已激活" : "设为激活风格"}
						className="shrink-0 group"
					>
						<div
							className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
								isActive
									? "border-mint-600 dark:border-mint-400"
									: "border-cream-300 dark:border-cream-500/60 group-hover:border-cream-400 dark:group-hover:border-cream-400/70"
							}`}
						>
							{isActive && (
								<div className="w-2 h-2 rounded-full bg-mint-600 dark:bg-mint-400" />
							)}
						</div>
					</button>
				)}

				{/* 展开/折叠 + 名称 */}
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="flex items-center gap-2 flex-1 min-w-0 text-left group"
				>
					<ChevronDown
						size={13}
						className={`shrink-0 text-text-muted transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
					/>
					<span className="text-sm font-medium text-text-primary truncate">
						{profile.name}
					</span>
				</button>

				{/* 状态徽章 + 样本数 */}
				<div className="flex items-center gap-1.5 shrink-0">
					{isActive && (
						<span className="rounded-full bg-mint-100 dark:bg-mint-900/30 px-2 py-0.5 text-[10px] font-semibold text-mint-700 dark:text-mint-300">
							激活
						</span>
					)}
					{analysis && (
						<span className="rounded-full bg-violet-100/70 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300">
							已分析
						</span>
					)}
					{!expanded && samples.length > 0 && (
						<span className="text-[10px] text-text-muted">
							{samples.length} 篇样本
						</span>
					)}
				</div>

				{/* 操作按钮 */}
				<div className="flex items-center gap-0.5 shrink-0">
					{!archived && (
						<button
							type="button"
							onClick={() => void handleAnalyze()}
							disabled={analyzing}
							title="AI 分析样本，生成风格规则"
							className="rounded-lg p-1.5 text-text-muted hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-40 transition-colors duration-150"
						>
							{analyzing ? (
								<Loader2 size={14} className="animate-spin" />
							) : (
								<Sparkles size={14} />
							)}
						</button>
					)}
					<button
						type="button"
						onClick={onArchive}
						title={archived ? "恢复" : "归档"}
						className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-cream-100 dark:hover:bg-cream-700/40 transition-colors duration-150"
					>
						{archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
					</button>
					{/* 删除：需要二次确认 */}
					<button
						type="button"
						onClick={handleDeleteClick}
						title={confirmDelete ? "再次点击确认删除" : "删除"}
						className={`rounded-lg p-1.5 transition-all duration-200 ${
							confirmDelete
								? "text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 scale-105"
								: "text-text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
						}`}
					>
						<Trash2 size={14} />
					</button>
				</div>
			</div>

			{/* ── 二次确认提示条 ────────────────────────────────────────── */}
			{confirmDelete && (
				<div className="mx-3.5 mb-2 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/70 dark:border-red-700/40 px-3 py-1.5">
					<AlertCircle size={12} className="shrink-0 text-red-500" />
					<span className="flex-1 text-[11px] text-red-600 dark:text-red-400">
						确认删除「{profile.name}」？此操作不可恢复。
					</span>
					<button
						type="button"
						onClick={() => setConfirmDelete(false)}
						className="text-[11px] text-text-secondary hover:text-text-primary transition-colors duration-150"
					>
						取消
					</button>
				</div>
			)}

			{/* ── 分析进度区 ────────────────────────────────────────────── */}
			{(analyzing || analyzeSteps.length > 0 || analyzeError) && (
				<div className="mx-3.5 mb-2 rounded-lg bg-cream-50/80 dark:bg-cream-800/30 border border-cream-200/60 dark:border-cream-600/30 px-3 py-2">
					{analyzeError ? (
						<div className="flex items-center gap-2 text-[11px] text-red-500">
							<AlertCircle size={12} className="shrink-0" />
							{analyzeError}
						</div>
					) : (
						<div className="space-y-1.5">
							{analyzeSteps.map((s) => (
								<div key={s.step} className="flex items-center gap-2">
									<div
										className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300 ${
											s.done
												? "bg-mint-500"
												: "bg-violet-400 animate-pulse"
										}`}
									/>
									<span
										className={`text-[11px] ${s.done ? "text-text-muted" : "text-text-secondary"}`}
									>
										{s.step}/{s.total} {s.name}
										{s.done ? " ✓" : "…"}
									</span>
								</div>
							))}
							{analyzing && analyzeSteps.length === 0 && (
								<div className="flex items-center gap-2 text-[11px] text-text-muted">
									<Loader2 size={11} className="animate-spin shrink-0" />
									启动分析…
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* ── 展开详情 ──────────────────────────────────────────────── */}
			{expanded && (
				<div className="border-t border-cream-200/60 dark:border-cream-600/30 px-4 pt-4 pb-5 space-y-5 bg-cream-50/20 dark:bg-cream-900/10">
					{/* 样本列表 */}
					<div>
						<div className="mb-3 flex items-center justify-between">
							<span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
								样本文章
								{samples.length > 0 && (
									<span className="ml-1.5 font-normal normal-case tracking-normal text-text-secondary">
										({samples.length})
									</span>
								)}
							</span>
							{!showTextForm && (
								<button
									type="button"
									onClick={() => setShowTextForm(true)}
									className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-mint-600 dark:hover:text-mint-400 transition-colors duration-150"
								>
									<Plus size={11} />
									粘贴文本
								</button>
							)}
						</div>

						{/* 内联文本表单 */}
						{showTextForm && (
							<div className="mb-3">
								<StyleSampleTextForm
									onSubmit={handleAddSampleFromText}
									onCancel={() => setShowTextForm(false)}
								/>
							</div>
						)}

						{/* 批量导入面板 */}
						<div className="mb-3">
							<StyleSampleImportPanel
								profileId={profile.id}
								onComplete={() => void loadDetails()}
							/>
						</div>

						{samples.length === 0 && !showTextForm ? (
							<div className="rounded-xl border border-dashed border-cream-300 dark:border-cream-600/50 px-4 py-5 text-center">
								<FileText
									size={20}
									className="mx-auto mb-2 text-text-muted/40"
								/>
								<p className="text-xs text-text-muted">
									暂无样本。添加至少一篇样本文章以启用 AI 风格分析。
								</p>
								<button
									type="button"
									onClick={() => setShowTextForm(true)}
									className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-mint-600 dark:text-mint-400 hover:underline transition-colors duration-150"
								>
									<Plus size={12} />
									添加第一篇样本
								</button>
							</div>
						) : (
							<div className="flex flex-col gap-1">
								{samples.map((s) => (
									<div
										key={s.id}
										className="flex items-center gap-2.5 rounded-lg bg-white/60 dark:bg-cream-800/40 border border-cream-200/50 dark:border-cream-600/20 px-3 py-2 group hover:border-cream-300/70 dark:hover:border-cream-500/30 transition-colors duration-100"
									>
										<FileText
											size={12}
											className="shrink-0 text-text-muted/60"
										/>
										<span className="flex-1 min-w-0 truncate text-xs text-text-primary">
											{s.title ?? "未命名样本"}
										</span>
										<span className="shrink-0 text-[10px] text-text-muted">
											{s.word_count.toLocaleString()} 字
										</span>
										<button
											type="button"
											onClick={() => void handleRemoveSample(s.id)}
											className="shrink-0 text-text-muted/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-150"
											title="移除样本"
										>
											<Trash2 size={11} />
										</button>
									</div>
								))}
							</div>
						)}
					</div>

					{/* 风格维度校准 */}
					<div>
						<div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
							风格维度校准
						</div>
						<StyleProfileCalibratePanel
							profileId={profile.id}
							onUpdated={() => void loadDetails()}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
