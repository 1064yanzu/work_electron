/**
 * WikiLintPanel - Wiki 健康检查报告
 *
 * 展示 wiki_lint IPC 返回的：
 * - 分类问题列表（孤儿 / stub / 断链 / frontmatter 缺失 / source 页缺溯源）
 * - 未摄入的 raw 文件
 * - 下一步建议
 *
 * 对齐 Karpathy lint pattern。
 */
import {
	AlertTriangle,
	ChevronDown,
	FileSymlink,
	GitBranch,
	Package,
	Scale,
	Type,
	X,
} from "lucide-react";
import { useState } from "react";
import type {
	WikiLintIssueItem,
	WikiLintIssueKind,
	WikiLintReportData,
} from "./useWiki";

interface Props {
	report: WikiLintReportData;
	onDismiss: () => void;
	onOpenPage?: (slug: string) => void;
}

const KIND_META: Record<
	WikiLintIssueKind,
	{
		label: string;
		icon: typeof AlertTriangle;
		color: string;
	}
> = {
	orphan: {
		label: "孤儿页面",
		icon: GitBranch,
		color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
	},
	stub: {
		label: "内容过短",
		icon: Type,
		color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
	},
	"broken-link": {
		label: "断链",
		icon: FileSymlink,
		color: "text-red-600 bg-red-50 dark:bg-red-950/30",
	},
	"frontmatter-missing": {
		label: "Frontmatter 缺失",
		icon: Scale,
		color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
	},
	"source-no-sources": {
		label: "Source 页缺溯源",
		icon: Package,
		color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
	},
};

export function WikiLintPanel({ report, onDismiss, onOpenPage }: Props) {
	const [expandedKind, setExpandedKind] = useState<WikiLintIssueKind | null>(
		null,
	);

	const totalIssues = report.issues.length;
	const hasAnyIssue = totalIssues > 0 || report.un_ingested_sources.length > 0;

	// 把 issues 按 kind 分组
	const grouped = report.issues.reduce<
		Record<WikiLintIssueKind, WikiLintIssueItem[]>
	>(
		(acc, issue) => {
			if (!acc[issue.kind]) acc[issue.kind] = [];
			acc[issue.kind].push(issue);
			return acc;
		},
		{
			orphan: [],
			stub: [],
			"broken-link": [],
			"frontmatter-missing": [],
			"source-no-sources": [],
		},
	);

	return (
		<div className="mx-3 mt-3 rounded-2xl border border-border/80/80 bg-surface/90/60 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.25)] overflow-hidden">
			{/* Header */}
			<div className="px-4 py-3 border-b border-border/70 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<AlertTriangle className="w-4 h-4 text-primary" />
					<h3 className="text-sm font-semibold text-text-primary">
						Wiki 健康检查
					</h3>
					<span className="text-[11px] text-text-light tabular-nums">
						{report.total_pages} 页 · {totalIssues} 个问题
					</span>
				</div>
				<button
					onClick={onDismiss}
					className="p-1 text-text-light hover:text-text-secondary dark:hover:text-text-light rounded"
				>
					<X className="w-3.5 h-3.5" />
				</button>
			</div>

			<div className="px-4 py-3 space-y-3">
				{/* 建议 */}
				{report.suggestions.length > 0 && (
					<div className="rounded-xl bg-primary/5 border border-primary/15 p-3">
						<div className="text-[10px] uppercase tracking-[0.18em] text-primary mb-1.5">
							建议
						</div>
						<ul className="space-y-1">
							{report.suggestions.map((s, i) => (
								<li
									key={i}
									className="text-xs text-text-secondary leading-relaxed"
								>
									· {s}
								</li>
							))}
						</ul>
					</div>
				)}

				{/* Counts grid */}
				{totalIssues > 0 && (
					<div className="grid grid-cols-2 gap-2">
						{(Object.keys(KIND_META) as WikiLintIssueKind[]).map((kind) => {
							const count = report.counts[kind] ?? 0;
							if (count === 0) return null;
							const meta = KIND_META[kind];
							const Icon = meta.icon;
							const isOpen = expandedKind === kind;
							return (
								<button
									key={kind}
									onClick={() => setExpandedKind(isOpen ? null : kind)}
									className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${meta.color} ${isOpen ? "ring-1 ring-black/10" : "hover:ring-1 hover:ring-black/5"}`}
								>
									<span className="flex items-center gap-1.5">
										<Icon className="w-3.5 h-3.5" />
										{meta.label}
									</span>
									<span className="flex items-center gap-1 tabular-nums">
										{count}
										<ChevronDown
											className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
										/>
									</span>
								</button>
							);
						})}
					</div>
				)}

				{/* 展开的 issue 列表 */}
				{expandedKind && grouped[expandedKind].length > 0 && (
					<div className="rounded-xl border border-border/70/70 bg-warm-50/50/30 max-h-60 overflow-y-auto">
						{grouped[expandedKind].slice(0, 50).map((issue, i) => (
							<button
								key={`${issue.page_slug}-${i}`}
								onClick={() => onOpenPage?.(issue.page_slug)}
								className="w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-surface/70 transition-colors"
							>
								<div className="text-xs font-medium text-text-primary truncate mb-0.5">
									{issue.page_title}
								</div>
								<div className="text-[11px] text-text-muted leading-relaxed">
									{issue.detail}
								</div>
							</button>
						))}
						{grouped[expandedKind].length > 50 && (
							<div className="px-3 py-2 text-[11px] text-text-light bg-warm-200/50/50">
								…还有 {grouped[expandedKind].length - 50} 条
							</div>
						)}
					</div>
				)}

				{/* 未摄入文件 */}
				{report.un_ingested_sources.length > 0 && (
					<div className="rounded-xl border border-blue-200/50 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20">
						<div className="px-3 py-2 border-b border-blue-200/50 dark:border-blue-900/40 flex items-center gap-2">
							<Package className="w-3.5 h-3.5 text-blue-600" />
							<span className="text-xs font-medium text-blue-700 dark:text-blue-300">
								未摄入原始文件（{report.un_ingested_sources.length}）
							</span>
						</div>
						<div className="max-h-40 overflow-y-auto">
							{report.un_ingested_sources.slice(0, 20).map((s) => (
								<div
									key={s.path}
									className="px-3 py-1.5 text-[11px] text-blue-700/80 dark:text-blue-300/80 truncate border-b border-blue-100/50 dark:border-blue-900/30 last:border-b-0"
									title={s.path}
								>
									· {s.name}
									<span className="ml-1 text-blue-500/70">
										（{formatSize(s.size)}）
									</span>
								</div>
							))}
							{report.un_ingested_sources.length > 20 && (
								<div className="px-3 py-1.5 text-[10px] text-blue-500">
									…还有 {report.un_ingested_sources.length - 20} 个
								</div>
							)}
						</div>
					</div>
				)}

				{/* 无问题状态 */}
				{!hasAnyIssue && (
					<div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
						Wiki 当前状态健康，未发现机械问题。如需检查矛盾或过时内容，让 Agent
						读完 SCHEMA 后帮你做语义级审计。
					</div>
				)}
			</div>
		</div>
	);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
