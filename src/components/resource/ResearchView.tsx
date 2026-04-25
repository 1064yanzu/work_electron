// 研究进度视图组件

import {
	AlertCircle,
	ArrowLeft,
	CheckCircle2,
	ChevronRight,
	Circle,
	FileText,
	Globe,
	Loader2,
	Search,
	Lightbulb,
	X,
} from "lucide-react";
import { useCallback } from "react";
import {
	type ResearchSource,
	type ResearchStep,
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

interface ResearchViewProps {
	onOpenResearchSource: (source: ResearchSource) => void;
}

export function ResearchView({ onOpenResearchSource }: ResearchViewProps) {
	const currentResearch = useWorkspaceStoreSelector(
		(state) => state.currentResearch,
	);
	const setLeftSidebarView =
		workspaceStore.setLeftSidebarView.bind(workspaceStore);

	const getStepIcon = useCallback((step: ResearchStep) => {
		if (step.status === "running") {
			return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
		}
		if (step.status === "completed") {
			return <CheckCircle2 className="w-4 h-4 text-green-500" />;
		}
		if (step.status === "error") {
			return <AlertCircle className="w-4 h-4 text-red-500" />;
		}
		return <Circle className="w-4 h-4 text-text-light" />;
	}, []);

	if (!currentResearch) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
				<div className="w-16 h-16 rounded-2xl bg-warm-200 flex items-center justify-center mb-4">
					<Search className="w-8 h-8 text-text-light" />
				</div>
				<h3 className="font-medium text-text-secondary mb-1">暂无研究任务</h3>
				<p className="text-sm text-text-light max-w-[200px]">
					在右侧 AI 助手中发起深度研究
				</p>
				<button
					onClick={() => setLeftSidebarView("sources")}
					className="mt-4 px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 rounded-lg transition-colors"
				>
					返回资料库
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="px-4 py-3 flex items-center gap-3 border-b border-border shrink-0">
				<button
					onClick={() => setLeftSidebarView("sources")}
					className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
				>
					<ArrowLeft className="w-4 h-4" />
				</button>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<Lightbulb className="w-4 h-4 text-blue-500" />
						<h2 className="font-semibold text-sm text-text-primary">
							深度研究
						</h2>
					</div>
					<p className="text-xs text-text-light truncate mt-0.5">
						{currentResearch.query}
					</p>
				</div>
				{currentResearch.status === "completed" && (
					<button
						onClick={() => workspaceStore.clearCurrentResearch()}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				)}
			</div>

			{/* Research Progress */}
			<div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
				{/* Steps Timeline */}
				<div className="space-y-3">
					<h3 className="text-xs font-semibold text-text-light uppercase tracking-wider">
						研究进度
					</h3>
					<div className="space-y-2">
						{currentResearch.steps.map((step) => (
							<div
								key={step.id}
								className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
									step.status === "running"
										? "bg-blue-50 dark:bg-blue-900/20"
										: step.status === "completed"
											? "bg-green-50/50 dark:bg-green-900/10"
											: step.status === "error"
												? "bg-red-50/50 dark:bg-red-900/10"
												: "bg-warm-50/50"
								}`}
							>
								<div className="mt-0.5">{getStepIcon(step)}</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-text-secondary">
										{step.title}
									</p>
									{step.description && (
										<p className="text-xs text-text-light mt-0.5 line-clamp-2">
											{step.description}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Found Sources */}
				{currentResearch.sources.length > 0 && (
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-text-light uppercase tracking-wider">
							发现的资料 ({currentResearch.sources.length})
						</h3>
						<div className="space-y-2">
							{currentResearch.sources.map((source) => (
								<button
									key={source.id}
									onClick={() => onOpenResearchSource(source)}
									className="w-full flex items-start gap-3 p-3 bg-surface/50 hover:bg-warm-50 rounded-xl text-left transition-colors group"
								>
									<div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 shrink-0">
										{source.type === "search_result" ? (
											<Globe className="w-4 h-4" />
										) : (
											<FileText className="w-4 h-4" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-text-secondary line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
											{source.title}
										</p>
										{source.snippet && (
											<p className="text-xs text-text-light mt-0.5 line-clamp-2">
												{source.snippet}
											</p>
										)}
									</div>
									<ChevronRight className="w-4 h-4 text-text-light group-hover:text-text-muted shrink-0 mt-1" />
								</button>
							))}
						</div>
					</div>
				)}

				{/* Summary */}
				{currentResearch.summary && (
					<div className="space-y-3">
						<h3 className="text-xs font-semibold text-text-light uppercase tracking-wider">
							研究总结
						</h3>
						<div className="p-4 bg-warm-50/50 rounded-xl">
							<article className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
								<MarkdownRenderer
									content={currentResearch.summary}
									className="text-sm"
								/>
							</article>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
