import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

interface CritiqueScores {
	philosophy: number;
	hierarchy: number;
	execution: number;
	functional: number;
	innovation: number;
}

export interface CritiqueScorecardProps {
	scores: CritiqueScores;
	total?: number;
	notes?: string;
	fixes?: string[];
	passed?: boolean;
	lowestDim?: string;
	regenerateReason?: string;
	onClose?: () => void;
	onRegenerate?: () => void;
}

const DIM = [
	{ key: "philosophy", label: "哲学一致性" },
	{ key: "hierarchy", label: "视觉层级" },
	{ key: "execution", label: "细节执行" },
	{ key: "functional", label: "功能性" },
	{ key: "innovation", label: "创新性" },
] as const;

/**
 * 5 维评分卡：雷达图（SVG）+ 表格 + 修复清单
 */
export function CritiqueScorecard({
	scores,
	total,
	notes,
	fixes,
	passed,
	lowestDim,
	regenerateReason,
	onClose,
	onRegenerate,
}: CritiqueScorecardProps) {
	const [expanded, setExpanded] = useState(true);
	const sum = total ?? Object.values(scores).reduce((a, b) => a + b, 0);

	const radarPoints = useMemo(() => {
		const cx = 60;
		const cy = 60;
		const r = 50;
		return DIM.map((dim, i) => {
			const angle = (i / DIM.length) * 2 * Math.PI - Math.PI / 2;
			const value = scores[dim.key] / 10;
			const x = cx + Math.cos(angle) * r * value;
			const y = cy + Math.sin(angle) * r * value;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(" ");
	}, [scores]);

	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-4 shadow-lg">
			<header className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-primary" strokeWidth={1.5} />
					<div>
						<div className="text-sm font-semibold text-text-primary">
							5 维自检
						</div>
						<div className="text-[11px] text-text-muted">
							总分 <span className="font-mono">{sum}/50</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg"
					>
						{expanded ? (
							<ChevronUp className="w-3.5 h-3.5" />
						) : (
							<ChevronDown className="w-3.5 h-3.5" />
						)}
					</button>
					{onClose ? (
						<button
							type="button"
							onClick={onClose}
							className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
			</header>

			{expanded ? (
				<>
					{typeof passed === "boolean" ? (
						<div
							className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
								passed
									? "border-primary/40 bg-primary/5 text-text-primary"
									: "border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
							}`}
						>
							{passed ? (
								<CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
							) : (
								<AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
							)}
							<div className="flex-1 min-w-0 leading-relaxed">
								{passed ? (
									<span>已通过门控（≥ 40 且每维 ≥ 6）</span>
								) : (
									<>
										<div>
											未通过门控
											{lowestDim ? <>，最弱：<span className="font-mono">{lowestDim}</span></> : null}
										</div>
										{regenerateReason ? (
											<div className="text-[11px] mt-0.5 opacity-90">
												{regenerateReason}
											</div>
										) : null}
									</>
								)}
							</div>
							{!passed && onRegenerate ? (
								<button
									type="button"
									onClick={onRegenerate}
									className="shrink-0 px-2 py-0.5 rounded-md text-[11px] bg-amber-600 text-white hover:bg-amber-700"
								>
									一键重做
								</button>
							) : null}
						</div>
					) : null}

					<div className="flex items-center gap-4">
						<svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
							{[0.25, 0.5, 0.75, 1].map((r) => (
								<circle
									key={r}
									cx={60}
									cy={60}
									r={50 * r}
									fill="none"
									stroke="var(--t-border, #e5e7eb)"
									strokeWidth="0.5"
								/>
							))}
							{DIM.map((dim, i) => {
								const angle = (i / DIM.length) * 2 * Math.PI - Math.PI / 2;
								const x = 60 + Math.cos(angle) * 50;
								const y = 60 + Math.sin(angle) * 50;
								return (
									<line
										key={dim.key}
										x1={60}
										y1={60}
										x2={x}
										y2={y}
										stroke="var(--t-border, #e5e7eb)"
										strokeWidth="0.5"
									/>
								);
							})}
							<polygon
								points={radarPoints}
								fill="var(--t-primary, #D96C46)"
								fillOpacity="0.18"
								stroke="var(--t-primary, #D96C46)"
								strokeWidth="1.2"
							/>
						</svg>
						<div className="flex-1 flex flex-col gap-1.5">
							{DIM.map((dim) => {
								const score = scores[dim.key];
								return (
									<div key={dim.key} className="flex items-center gap-2 text-xs">
										<span className="w-20 shrink-0 text-text-muted">
											{dim.label}
										</span>
										<div className="flex-1 h-1.5 rounded-full bg-warm-200/60 overflow-hidden">
											<div
												className="h-full bg-primary rounded-full transition-all"
												style={{ width: `${(score / 10) * 100}%` }}
											/>
										</div>
										<span className="w-6 text-right font-mono text-text-primary">
											{score}
										</span>
									</div>
								);
							})}
						</div>
					</div>

					{notes ? (
						<div className="text-xs text-text-muted leading-relaxed border-t border-border pt-3">
							{notes}
						</div>
					) : null}

					{fixes && fixes.length > 0 ? (
						<div className="border-t border-border pt-3 flex flex-col gap-1">
							<div className="text-[11px] uppercase tracking-wider text-text-muted mb-1">
								修复清单
							</div>
							<ul className="flex flex-col gap-1">
								{fixes.map((fix, i) => (
									<li
										key={i}
										className="text-xs text-text-primary flex items-start gap-2"
									>
										<span className="text-text-muted">{i + 1}.</span>
										<span className="leading-relaxed">{fix}</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</>
			) : null}
		</div>
	);
}
