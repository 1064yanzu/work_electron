import { BarChart3, FileOutput, FileText, Layers, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type DailyActivity,
	getDailyActivity,
	getDashboardStats,
} from "../../../lib/api";
import { useChatStore } from "../../../lib/chat/store";
import type { DashboardStats } from "../../../types";
import { ActivityHeatmap } from "../../ActivityHeatmap";

/**
 * 格式化 token 数量显示
 */
function formatTokenCount(count: number): string {
	if (count >= 100000) {
		return `${(count / 1000).toFixed(0)}k`;
	}
	if (count >= 10000) {
		return `${(count / 1000).toFixed(1)}k`;
	}
	if (count >= 1000) {
		return `${(count / 1000).toFixed(2)}k`;
	}
	return count.toLocaleString();
}

/**
 * 计算所有会话的 token 使用统计（分时段）
 */
function useTokenStats() {
	// 使用响应式订阅，而不是一次性获取
	const { sessions } = useChatStore();

	return useMemo(() => {
		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
		const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

		const makeBucket = () => ({
			total: 0,
			prompt: 0,
			completion: 0,
			cacheRead: 0,
			cacheCreation: 0,
			cost: 0,
		});

		const stats = {
			today: makeBucket(),
			week: makeBucket(),
			month: makeBucket(),
			all: makeBucket(),
		};

		sessions.forEach((session) => {
			session.messages.forEach((msg) => {
				if (msg.metadata?.tokenUsage) {
					const {
						totalTokens,
						promptTokens,
						completionTokens,
						cacheReadInputTokens,
						cacheCreationInputTokens,
						costUsd,
					} = msg.metadata.tokenUsage;

					const addTo = (bucket: ReturnType<typeof makeBucket>) => {
						bucket.total += totalTokens || 0;
						bucket.prompt += promptTokens || 0;
						bucket.completion += completionTokens || 0;
						bucket.cacheRead += cacheReadInputTokens || 0;
						bucket.cacheCreation += cacheCreationInputTokens || 0;
						bucket.cost += costUsd || 0;
					};

					// 总计
					addTo(stats.all);

					// 按时间段统计
					if (msg.timestamp >= oneDayAgo) addTo(stats.today);
					if (msg.timestamp >= oneWeekAgo) addTo(stats.week);
					if (msg.timestamp >= oneMonthAgo) addTo(stats.month);
				}
			});
		});

		return stats;
	}, [sessions]);
}

export function DashboardSettings() {
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [activityData, setActivityData] = useState<DailyActivity[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const tokenStats = useTokenStats();

	useEffect(() => {
		loadStats();
		loadActivity();
	}, []);

	const loadStats = async () => {
		try {
			setIsLoading(true);
			const data = await getDashboardStats();
			setStats(data);
		} catch (error) {
			console.error("加载统计数据失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const loadActivity = async () => {
		try {
			const data = await getDailyActivity(365);
			setActivityData(data);
		} catch (error) {
			console.error("加载活动数据失败:", error);
		}
	};

	return (
		<div className="flex-1 h-full bg-white p-8 overflow-y-auto">
			<div className="max-w-4xl space-y-8">
				<div className="border-b border-border pb-4 mb-8">
					<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
						<BarChart3 className="w-5 h-5" />
						使用统计
					</h3>
					<p className="text-sm text-text-secondary mt-1">
						查看您的知识工作台使用情况
					</p>
				</div>

				{isLoading ? (
					<div className="text-center py-12 text-text-muted">加载中...</div>
				) : stats ? (
					<>
						{/* Knowledge Stats - 知识库概览 */}
						<KnowledgeStatsPanel stats={stats} />

						{/* Token Statistics - 高级版 */}
						<TokenUsagePanel stats={tokenStats} />

						{/* Activity Heatmap */}
						<div className="space-y-4">
							<h4 className="font-medium text-text-primary flex items-center gap-2">
								<BarChart3 className="w-4 h-4" />
								活跃度
							</h4>
							<div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
								<ActivityHeatmap data={activityData} />
							</div>
						</div>
					</>
				) : (
					<div className="text-center py-12 text-text-muted">加载失败</div>
				)}
			</div>
		</div>
	);
}

function KnowledgeStatsPanel({ stats }: { stats: DashboardStats }) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{/* 资料 (Sources) - 输入端 */}
			<div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
				<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
					<Layers className="w-16 h-16 text-blue-500" />
				</div>
				<div className="relative z-10">
					<div className="flex items-center gap-2 mb-3">
						<div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
							<Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
						</div>
						<span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
							知识来源
						</span>
					</div>
					<div className="flex items-baseline gap-2">
						<span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
							{(stats.sources_count ?? 0).toLocaleString()}
						</span>
						<span className="text-xs text-zinc-400">个文件</span>
					</div>
				</div>
			</div>

			{/* 笔记 (Notes) - 沉淀端 */}
			<div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors">
				<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
					<FileText className="w-16 h-16 text-emerald-500" />
				</div>
				<div className="relative z-10">
					<div className="flex items-center gap-2 mb-3">
						<div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
							<FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
						</div>
						<span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
							原子笔记
						</span>
					</div>
					<div className="flex items-baseline gap-2">
						<span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
							{(stats.notes_count ?? 0).toLocaleString()}
						</span>
						<span className="text-xs text-zinc-400">篇</span>
					</div>
				</div>
			</div>

			{/* 输出 (Outputs) - 产出端 */}
			<div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden group hover:border-orange-200 dark:hover:border-orange-800 transition-colors">
				<div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
					<FileOutput className="w-16 h-16 text-orange-500" />
				</div>
				<div className="relative z-10">
					<div className="flex items-center gap-2 mb-3">
						<div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center">
							<FileOutput className="w-4 h-4 text-orange-600 dark:text-orange-400" />
						</div>
						<span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
							创作产出
						</span>
					</div>
					<div className="flex items-baseline gap-2">
						<span className="text-3xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
							{(stats.outputs_count ?? 0).toLocaleString()}
						</span>
						<span className="text-xs text-zinc-400">文章</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function TokenUsagePanel({
	stats,
}: {
	stats: ReturnType<typeof useTokenStats>;
}) {
	const [period, setPeriod] = useState<"today" | "week" | "month" | "all">(
		"today",
	);

	const currentStats = stats[period];
	const total = currentStats.total;
	const promptPercent = total > 0 ? (currentStats.prompt / total) * 100 : 0;
	const completionPercent =
		total > 0 ? (currentStats.completion / total) * 100 : 0;
	const hasCacheData =
		currentStats.cacheRead > 0 || currentStats.cacheCreation > 0;
	const hasRealCost = currentStats.cost > 0;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Zap className="w-4 h-4 text-indigo-500" />
					Token 消耗
				</h4>
				<div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
					{(["today", "week", "month", "all"] as const).map((p) => (
						<button
							key={p}
							onClick={() => setPeriod(p)}
							className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
								period === p
									? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
									: "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
							}`}
						>
							{p === "today" && "今日"}
							{p === "week" && "本周"}
							{p === "month" && "本月"}
							{p === "all" && "总计"}
						</button>
					))}
				</div>
			</div>

			<div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
				<div className="flex items-end justify-between mb-6">
					<div>
						<div className="text-sm text-zinc-500 dark:text-zinc-400 mb-1">
							总消耗 Tokens
						</div>
						<div className="text-4xl font-mono font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
							{currentStats.total.toLocaleString()}
						</div>
					</div>
					<div className="text-right">
						<div className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
							{hasRealCost ? "实际花费" : "预估花费"}
						</div>
						<div className="text-lg font-mono font-medium text-zinc-700 dark:text-zinc-300">
							$
							{hasRealCost
								? currentStats.cost.toFixed(4)
								: (currentStats.total * 0.000002).toFixed(4)}
							{!hasRealCost && (
								<span className="text-[10px] text-zinc-400 ml-1">(估算)</span>
							)}
						</div>
					</div>
				</div>

				{/* 进度条可视化 */}
				<div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex mb-6">
					<div
						className="h-full bg-emerald-500/80 transition-all duration-500 ease-out"
						style={{ width: `${promptPercent}%` }}
					/>
					<div
						className="h-full bg-orange-500/80 transition-all duration-500 ease-out"
						style={{ width: `${completionPercent}%` }}
					/>
				</div>

				{/* 详细数据 */}
				<div
					className={`grid ${hasCacheData ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"} gap-4`}
				>
					<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
						<div className="flex items-center gap-2 mb-2">
							<div className="w-2 h-2 rounded-full bg-emerald-500" />
							<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
								输入 (Prompt)
							</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-xl font-mono font-semibold text-zinc-800 dark:text-zinc-200">
								{formatTokenCount(currentStats.prompt)}
							</span>
							<span className="text-xs text-zinc-400">
								{promptPercent.toFixed(1)}%
							</span>
						</div>
					</div>

					<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
						<div className="flex items-center gap-2 mb-2">
							<div className="w-2 h-2 rounded-full bg-orange-500" />
							<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
								输出 (Completion)
							</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-xl font-mono font-semibold text-zinc-800 dark:text-zinc-200">
								{formatTokenCount(currentStats.completion)}
							</span>
							<span className="text-xs text-zinc-400">
								{completionPercent.toFixed(1)}%
							</span>
						</div>
					</div>

					{hasCacheData && (
						<>
							<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
								<div className="flex items-center gap-2 mb-2">
									<div className="w-2 h-2 rounded-full bg-blue-500" />
									<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
										Cache 命中
									</span>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="text-xl font-mono font-semibold text-zinc-800 dark:text-zinc-200">
										{formatTokenCount(currentStats.cacheRead)}
									</span>
								</div>
							</div>
							<div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
								<div className="flex items-center gap-2 mb-2">
									<div className="w-2 h-2 rounded-full bg-violet-500" />
									<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
										Cache 创建
									</span>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="text-xl font-mono font-semibold text-zinc-800 dark:text-zinc-200">
										{formatTokenCount(currentStats.cacheCreation)}
									</span>
								</div>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
