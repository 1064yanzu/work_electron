import { FileOutput, FileText, Layers, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type DailyActivity,
	getDailyActivity,
	getDashboardStats,
} from "../../../lib/api";
import { useChatStore } from "../../../lib/chat/store";
import type { DashboardStats } from "../../../types";
import { ActivityHeatmap } from "../../ActivityHeatmap";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsSectionTitle,
} from "../ui/SettingsPrimitives";

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
		<SettingsPageContainer width="wide">
			<SettingsPanelHeader
				title="使用统计"
				description="知识库规模、Token 消耗与活跃度，数据全部来自本机数据库。"
			/>

			{isLoading ? (
				<div className="py-12 text-center text-text-muted">加载中...</div>
			) : stats ? (
				<>
					{/* Knowledge Stats - 知识库概览 */}
					<KnowledgeStatsPanel stats={stats} />

					{/* Token Statistics - 高级版 */}
					<TokenUsagePanel stats={tokenStats} />

					{/* Activity Heatmap */}
					<div className="space-y-4">
						<SettingsSectionTitle className="mb-0">活跃度</SettingsSectionTitle>
						<div className="rounded-2xl border border-border bg-surface p-6 shadow-bai-card">
							<ActivityHeatmap data={activityData} />
						</div>
					</div>
				</>
			) : (
				<div className="py-12 text-center text-text-muted">加载失败</div>
			)}
		</SettingsPageContainer>
	);
}

function KnowledgeStatsPanel({ stats }: { stats: DashboardStats }) {
	const items = [
		{
			icon: Layers,
			label: "知识来源",
			value: stats.sources_count ?? 0,
			unit: "个文件",
			tone: "text-text-secondary",
		},
		{
			icon: FileText,
			label: "原子笔记",
			value: stats.notes_count ?? 0,
			unit: "篇",
			tone: "bai-icon-mint",
		},
		{
			icon: FileOutput,
			label: "创作产出",
			value: stats.outputs_count ?? 0,
			unit: "文章",
			tone: "bai-icon-peach",
		},
	] as const;

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{items.map(({ icon: Icon, label, value, unit, tone }) => (
				<div
					key={label}
					className="p-5 bg-surface border border-border rounded-2xl shadow-bai-card relative overflow-hidden group hover:border-cream-500 transition-colors"
				>
					<div className="absolute top-0 right-0 p-4 opacity-[0.06] group-hover:opacity-10 transition-opacity">
						<Icon className="w-16 h-16 text-cream-700" strokeWidth={1.5} />
					</div>
					<div className="relative z-10">
						<div className="flex items-center gap-2 mb-3">
							<div className="w-8 h-8 rounded-lg bg-warm-200 border border-border flex items-center justify-center">
								<Icon className={`w-4 h-4 ${tone}`} strokeWidth={1.5} />
							</div>
							<span className="text-sm font-medium text-text-secondary">
								{label}
							</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-mono font-semibold text-text-primary tabular-nums">
								{value.toLocaleString()}
							</span>
							<span className="text-xs text-text-light">{unit}</span>
						</div>
					</div>
				</div>
			))}
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
					<Zap className="w-4 h-4 bai-icon-violet" strokeWidth={1.5} />
					Token 消耗
				</h4>
				<div className="flex bg-warm-200 p-1 rounded-lg">
					{(["today", "week", "month", "all"] as const).map((p) => (
						<button
							key={p}
							onClick={() => setPeriod(p)}
							className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
								period === p
									? "bg-surface text-text-primary"
									: "text-text-muted hover:text-text-secondary"
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

			<div className="p-6 bg-surface border border-border rounded-2xl shadow-bai-card">
				<div className="flex items-end justify-between mb-6">
					<div>
						<div className="text-sm text-text-muted mb-1">总消耗 Tokens</div>
						<div className="text-4xl font-mono font-semibold text-text-primary tracking-tight tabular-nums">
							{currentStats.total.toLocaleString()}
						</div>
					</div>
					<div className="text-right">
						<div className="text-xs text-text-light mb-1">
							{hasRealCost ? "实际花费" : "预估花费"}
						</div>
						<div className="text-lg font-mono font-medium text-text-secondary tabular-nums">
							$
							{hasRealCost
								? currentStats.cost.toFixed(4)
								: (currentStats.total * 0.000002).toFixed(4)}
							{!hasRealCost && (
								<span className="text-[10px] text-text-light ml-1">(估算)</span>
							)}
						</div>
					</div>
				</div>

				{/* 进度条可视化 — 深浅对比代替色相对比 */}
				<div className="h-3 w-full bg-warm-200 rounded-full overflow-hidden flex mb-6">
					<div
						className="h-full bg-cream-900 transition-[width] duration-500 ease-out"
						style={{ width: `${promptPercent}%` }}
					/>
					<div
						className="h-full bg-cream-500 transition-[width] duration-500 ease-out"
						style={{ width: `${completionPercent}%` }}
					/>
				</div>

				{/* 详细数据 */}
				<div
					className={`grid ${hasCacheData ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"} gap-4`}
				>
					<div className="p-4 bg-cream-200/60 rounded-xl border border-border">
						<div className="flex items-center gap-2 mb-2">
							<div className="w-2 h-2 rounded-full bg-cream-900" />
							<span className="text-xs font-medium text-text-muted">
								输入 (Prompt)
							</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-xl font-mono font-semibold text-text-primary tabular-nums">
								{formatTokenCount(currentStats.prompt)}
							</span>
							<span className="text-xs text-text-light">
								{promptPercent.toFixed(1)}%
							</span>
						</div>
					</div>

					<div className="p-4 bg-cream-200/60 rounded-xl border border-border">
						<div className="flex items-center gap-2 mb-2">
							<div className="w-2 h-2 rounded-full bg-cream-500" />
							<span className="text-xs font-medium text-text-muted">
								输出 (Completion)
							</span>
						</div>
						<div className="flex items-baseline gap-2">
							<span className="text-xl font-mono font-semibold text-text-primary tabular-nums">
								{formatTokenCount(currentStats.completion)}
							</span>
							<span className="text-xs text-text-light">
								{completionPercent.toFixed(1)}%
							</span>
						</div>
					</div>

					{hasCacheData && (
						<>
							<div className="p-4 bg-cream-200/60 rounded-xl border border-border">
								<div className="flex items-center gap-2 mb-2">
									<div className="w-2 h-2 rounded-full bg-cream-700" />
									<span className="text-xs font-medium text-text-muted">
										Cache 命中
									</span>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="text-xl font-mono font-semibold text-text-primary tabular-nums">
										{formatTokenCount(currentStats.cacheRead)}
									</span>
								</div>
							</div>
							<div className="p-4 bg-cream-200/60 rounded-xl border border-border">
								<div className="flex items-center gap-2 mb-2">
									<div className="w-2 h-2 rounded-full bg-cream-700" />
									<span className="text-xs font-medium text-text-muted">
										Cache 创建
									</span>
								</div>
								<div className="flex items-baseline gap-2">
									<span className="text-xl font-mono font-semibold text-text-primary tabular-nums">
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
