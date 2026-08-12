/**
 * HarnessUsageSection —— 跨 AI 入口的用量总览。
 *
 * ## 数据从哪来（不要在这里凭空补数）
 *
 * 全部来自 `harness_sessions` / `harness_messages` —— 也就是「AI 入口互通」已经
 * 摄取进来的真实会话。后端返回的每一行都带着自己的口径标记，UI 的职责是**把口径
 * 如实标出来**，而不是让它看起来像一份精确账单：
 *
 * - `token_basis: "usage"`：从会话 JSONL 的 usage 字段推算（只累加 output，输入侧
 *   用最后一条近似当前上下文规模）——是估算，不是计费口径。
 * - `token_basis: "chars"`：Web 端根本不暴露 token，只能按字符数 /4 粗估。
 * - `partial_coverage`：Web 入口只统计用户主动「提取当前对话」导入过的会话，
 *   不等于你在该站点的全部使用量。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Info, RefreshCw } from "lucide-react";

import {
	getHarnessUsageStats,
	type HarnessUsageRow,
} from "../../../../lib/api/harnessHub";
import { cn } from "../../../../lib/utils";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsHint,
} from "../../ui/SettingsPrimitives";

type Range = "today" | "week" | "month" | "total";

const RANGE_LABELS: Record<Range, string> = {
	today: "今天",
	week: "近 7 天",
	month: "近 30 天",
	total: "全部",
};

const KIND_LABELS: Record<HarnessUsageRow["kind"], string> = {
	cli: "命令行",
	web: "Web",
	app: "本应用",
};

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

function formatLastActive(ts: number | null): string {
	if (!ts) return "—";
	const diff = Date.now() - ts;
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
	if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
	if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
	return new Date(ts).toLocaleDateString();
}

export function HarnessUsageSection() {
	const [rows, setRows] = useState<HarnessUsageRow[]>([]);
	const [daily, setDaily] = useState<{ date: string; messages: number }[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [range, setRange] = useState<Range>("week");

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await getHarnessUsageStats();
			setRows(result.harnesses);
			setDaily(result.daily);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const visible = useMemo(
		() => rows.filter((r) => r[range].sessions > 0 || range === "total"),
		[rows, range],
	);

	const totals = useMemo(() => {
		return visible.reduce(
			(acc, r) => {
				acc.sessions += r[range].sessions;
				acc.messages += r[range].messages;
				acc.tokens += r[range].token_estimate;
				return acc;
			},
			{ sessions: 0, messages: 0, tokens: 0 },
		);
	}, [visible, range]);

	const hasPartial = visible.some((r) => r.partial_coverage);
	const maxDaily = Math.max(1, ...daily.map((d) => d.messages));

	return (
		<SettingsCardSection
			title="AI 用量总览"
			description="按入口汇总已摄取的会话、消息与 token 估算。数据来自本机会话记录，不上传。"
			headerAction={
				<SettingsButton
					icon={RefreshCw}
					loading={loading}
					onClick={() => void load()}
				>
					刷新
				</SettingsButton>
			}
		>
			<div className="mb-3 flex items-center gap-1">
				{(Object.keys(RANGE_LABELS) as Range[]).map((key) => (
					<button
						key={key}
						type="button"
						onClick={() => setRange(key)}
						className={cn(
							"rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
							range === key
								? "bg-terracotta/[0.12] text-terracotta"
								: "text-text-muted hover:bg-warm-200 hover:text-text-primary",
						)}
					>
						{RANGE_LABELS[key]}
					</button>
				))}
			</div>

			{error ? (
				<SettingsHint tone="error" icon={AlertCircle} title="读取用量失败">
					{error}
				</SettingsHint>
			) : loading && rows.length === 0 ? (
				<div className="py-6 text-center text-xs text-text-muted">
					正在汇总用量…
				</div>
			) : rows.length === 0 ? (
				<SettingsHint tone="info" icon={Info} title="还没有可统计的会话">
					先在下方「历史会话摄取」里扫描一次，或在中栏用一次本机 CLI / Web
					AI，用量就会出现在这里。
				</SettingsHint>
			) : (
				<>
					<div className="mb-3 grid grid-cols-3 gap-2">
						<StatTile label="会话" value={formatCount(totals.sessions)} />
						<StatTile label="消息" value={formatCount(totals.messages)} />
						<StatTile
							label="token（估算）"
							value={formatCount(totals.tokens)}
						/>
					</div>

					<div className="space-y-0">
						{visible.length === 0 ? (
							<div className="py-5 text-center text-xs text-text-muted">
								{RANGE_LABELS[range]}内没有活动
							</div>
						) : (
							visible.map((row) => (
								<div
									key={row.harness}
									className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5">
											<span className="truncate text-xs font-medium text-text-primary">
												{row.label}
											</span>
											<SettingsBadge tone="neutral">
												{KIND_LABELS[row.kind]}
											</SettingsBadge>
											{row.partial_coverage ? (
												<SettingsBadge tone="warning">仅已导入</SettingsBadge>
											) : null}
										</div>
										<div className="mt-0.5 text-xs text-text-muted">
											最后活跃 {formatLastActive(row.last_active_at)}
										</div>
									</div>
									<div className="shrink-0 text-right">
										<div className="text-xs tabular-nums text-text-secondary">
											{formatCount(row[range].messages)} 条消息 ·{" "}
											{formatCount(row[range].sessions)} 会话
										</div>
										<div className="text-xs tabular-nums text-text-muted">
											≈ {formatCount(row[range].token_estimate)} token
											{row.token_basis === "chars" ? "（按字符粗估）" : ""}
										</div>
									</div>
								</div>
							))
						)}
					</div>

					{daily.length > 0 ? (
						<div className="mt-4">
							<div className="mb-1.5 flex items-center gap-1.5 text-xs text-text-muted">
								<BarChart3 className="h-3 w-3" strokeWidth={1.5} />近 30
								天每日消息数
							</div>
							<div className="flex h-12 items-end gap-0.5">
								{daily.map((d) => (
									<div
										key={d.date}
										title={`${d.date}：${d.messages} 条`}
										className="flex-1 rounded-t-sm bg-terracotta/35"
										style={{
											height: `${Math.max(4, (d.messages / maxDaily) * 100)}%`,
										}}
									/>
								))}
							</div>
						</div>
					) : null}

					<SettingsHint
						tone="info"
						icon={Info}
						title="口径说明"
						className="mt-4"
					>
						<span className="block">
							token 均为<strong className="font-medium">估算</strong>：命令行 /
							本应用按会话记录里的 usage 字段推算，不等于服务商的计费口径。
						</span>
						{hasPartial ? (
							<span className="mt-1 block">
								标「仅已导入」的 Web
								入口只统计你主动用「提取当前对话」存进来的会话，
								不代表你在该站点的全部使用量——Web
								端不暴露用量数据，没法自动获取。
							</span>
						) : null}
					</SettingsHint>
				</>
			)}
		</SettingsCardSection>
	);
}

function StatTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-border px-3 py-2">
			<div className="text-xs text-text-muted">{label}</div>
			<div className="mt-0.5 text-base font-medium tabular-nums text-text-primary">
				{value}
			</div>
		</div>
	);
}
