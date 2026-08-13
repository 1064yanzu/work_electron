import { FileOutput, FileText, Layers, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type DailyActivity,
	getDailyActivity,
	getDashboardStats,
} from "../../../lib/api";
import { useChatStoreSelector } from "../../../lib/chat/store";
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
	// 精确订阅 sessions 字段，避免全量订阅导致的无关重渲染
	const sessions = useChatStoreSelector((s) => s.sessions);

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
		},
		{
			icon: FileText,
			label: "原子笔记",
			value: stats.notes_count ?? 0,
			unit: "篇",
		},
		{
			icon: FileOutput,
			label: "创作产出",
			value: stats.outputs_count ?? 0,
			unit: "文章",
		},
	] as const;

	// 键值行列表:图标 + 标签左,数值右,替代大数字卡片阵列
	return (
		<div className="rounded-2xl border border-border bg-surface px-5 shadow-bai-card divide-y divide-border/60">
			{items.map(({ icon: Icon, label, value, unit }) => (
				<div key={label} className="flex items-center gap-3 py-3">
					<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warm-200 border border-border shrink-0">
						<Icon className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
					</div>
					<span className="flex-1 text-sm font-medium text-text-secondary">
						{label}
					</span>
					<span className="tabular-nums text-sm font-medium text-text-primary">
						{value.toLocaleString()}
					</span>
					<span className="text-xs text-text-light w-12">{unit}</span>
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
							className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
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

			<div className="p-5 bg-surface border border-border rounded-2xl shadow-bai-card">
				{/* 汇总键值行:替代大数字 hero 展示 */}
				<div className="divide-y divide-border/60 mb-4">
					<div className="flex items-center justify-between py-2">
						<span className="text-xs text-text-secondary">总消耗 Tokens</span>
						<span className="tabular-nums text-sm font-medium text-text-primary">
							{currentStats.total.toLocaleString()}
						</span>
					</div>
					<div className="flex items-center justify-between py-2">
						<span className="text-xs text-text-secondary">
							{hasRealCost ? "实际花费" : "预估花费"}
						</span>
						<span className="tabular-nums text-sm font-medium text-text-primary">
							$
							{hasRealCost
								? currentStats.cost.toFixed(4)
								: (currentStats.total * 0.000002).toFixed(4)}
							{!hasRealCost && (
								<span className="text-2xs text-text-light ml-1">(估算)</span>
							)}
						</span>
					</div>
				</div>

				{/* 进度条可视化 — 深浅对比代替色相对比 */}
				<div className="h-3 w-full bg-warm-200 rounded-full overflow-hidden flex mb-4">
					<div
						className="h-full bg-primary transition-[width] duration-500 ease-out"
						style={{ width: `${promptPercent}%` }}
					/>
					<div
						className="h-full bg-warm-500 transition-[width] duration-500 ease-out"
						style={{ width: `${completionPercent}%` }}
					/>
				</div>

				{/* 明细键值行:圆点图例 + 标签左,数值右 */}
				<div className="divide-y divide-border/60">
					<div className="flex items-center gap-2 py-2">
						<div className="w-2 h-2 rounded-full bg-primary shrink-0" />
						<span className="flex-1 text-xs font-medium text-text-muted">
							输入 (Prompt)
						</span>
						<span className="tabular-nums text-sm font-medium text-text-primary">
							{formatTokenCount(currentStats.prompt)}
						</span>
						<span className="text-xs text-text-light w-12 text-right">
							{promptPercent.toFixed(1)}%
						</span>
					</div>

					<div className="flex items-center gap-2 py-2">
						<div className="w-2 h-2 rounded-full bg-warm-500 shrink-0" />
						<span className="flex-1 text-xs font-medium text-text-muted">
							输出 (Completion)
						</span>
						<span className="tabular-nums text-sm font-medium text-text-primary">
							{formatTokenCount(currentStats.completion)}
						</span>
						<span className="text-xs text-text-light w-12 text-right">
							{completionPercent.toFixed(1)}%
						</span>
					</div>

					{hasCacheData && (
						<>
							<div className="flex items-center gap-2 py-2">
								<div className="w-2 h-2 rounded-full bg-warm-700 shrink-0" />
								<span className="flex-1 text-xs font-medium text-text-muted">
									Cache 命中
								</span>
								<span className="tabular-nums text-sm font-medium text-text-primary">
									{formatTokenCount(currentStats.cacheRead)}
								</span>
								<span className="w-12" />
							</div>
							<div className="flex items-center gap-2 py-2">
								<div className="w-2 h-2 rounded-full bg-warm-700 shrink-0" />
								<span className="flex-1 text-xs font-medium text-text-muted">
									Cache 创建
								</span>
								<span className="tabular-nums text-sm font-medium text-text-primary">
									{formatTokenCount(currentStats.cacheCreation)}
								</span>
								<span className="w-12" />
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
