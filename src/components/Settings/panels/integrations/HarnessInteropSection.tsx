/**
 * HarnessInteropSection — 设置面板 · AI 入口互通的「协作层」配置。
 *
 * 与同目录 `HarnessHubSettings` 的分工：那边管**入口本身**（探测、摄取、
 * 站点清单与选择器），这边管**入口之间的关系**——接力策略、互为工具、
 * 反向 MCP、能力路由、额度状态。分文件是因为那个文件已经 750+ 行。
 *
 * 所有数值都来自真实后端：额度状态没检测到就显示「未检测到」，
 * 不编造余额百分比；MCP 端口起不来就显示未运行，不假装可用。
 */
import {
	AlertTriangle,
	Check,
	Copy,
	KeyRound,
	Loader2,
	RefreshCw,
	Route,
	ShieldCheck,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	clearQuotaSignal,
	getHubSettings,
	getMcpStatus,
	listQuotas,
	listRoutes,
	refreshQuotas,
	resetRoute,
	rotateMcpToken,
	saveHubSettings,
	saveRoute,
	setMcpEnabled,
	setQuotaBlock,
	type HarnessHubSettingsRow,
	type HarnessMcpStatusRow,
	type HarnessQuotaRow,
	type HarnessRouteRow,
} from "../../../../lib/api/harnessBridge";
import { cn } from "../../../../lib/utils";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import { toast } from "../../../ui/Toast";
import { settingsAnchorProps } from "../../fieldRegistry";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsChipGroup,
	SettingsHint,
	SettingsRow,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";

const HANDOFF_POLICY_OPTIONS = [
	{ value: "auto" as const, label: "自动选档" },
	{ value: "native" as const, label: "只用原生续接" },
	{ value: "raw" as const, label: "只用原文接力" },
	{ value: "distill" as const, label: "只用蒸馏接力" },
];

function formatWhen(ts: number | null): string {
	if (!ts) return "—";
	return new Date(ts).toLocaleString("zh-CN");
}

export function HarnessInteropSection() {
	const [settings, setSettings] = useState<HarnessHubSettingsRow | null>(null);
	const [mcp, setMcp] = useState<HarnessMcpStatusRow | null>(null);
	const [routes, setRoutes] = useState<HarnessRouteRow[]>([]);
	const [capabilities, setCapabilities] = useState<
		{ capability: string; label: string; description: string }[]
	>([]);
	const [quotas, setQuotas] = useState<HarnessQuotaRow[]>([]);
	const [busy, setBusy] = useState(false);
	const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

	const reload = useCallback(async () => {
		const [s, m, r, q] = await Promise.all([
			getHubSettings(),
			getMcpStatus(),
			listRoutes(),
			listQuotas(),
		]);
		setSettings(s);
		setMcp(m);
		setRoutes(r.routes);
		setCapabilities(r.capabilities);
		setQuotas(q);
		return m;
	}, []);

	useEffect(() => {
		let cancelled = false;
		let retryTimer = 0;
		void reload()
			.then((status) => {
				// HTTP 服务是在启动后台阶段拉起来的。刚开机就打开设置面板会看到
				// 「未启动」——那不是故障而是还没轮到它。重试一次，而不是让用户
				// 对着一个错误的状态自己琢磨要不要重启应用。
				if (cancelled || status.running) return;
				retryTimer = window.setTimeout(() => {
					void reload().catch(() => undefined);
				}, 2500);
			})
			.catch((error: unknown) => {
				toast.error(
					`读取互通配置失败：${error instanceof Error ? error.message : String(error)}`,
				);
			});
		return () => {
			cancelled = true;
			if (retryTimer) window.clearTimeout(retryTimer);
		};
	}, [reload]);

	const patch = async (next: Partial<HarnessHubSettingsRow>) => {
		try {
			setSettings(await saveHubSettings(next));
		} catch (error) {
			toast.error(
				`保存失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const copy = async (text: string, label: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedLabel(label);
			window.setTimeout(() => setCopiedLabel(null), 1600);
		} catch {
			toast.error("复制失败，请手动选中复制");
		}
	};

	if (!settings) {
		return (
			<div className="flex items-center gap-2 py-8 text-[12.5px] text-text-light">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				正在读取互通配置…
			</div>
		);
	}

	return (
		<>
			{/* ---------- 接力策略 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.handoffPolicy")}>
				<SettingsCardSection
					title="接力策略"
					description="把一段会话搬到另一个入口继续时用哪一档。默认自动选：同一入口内优先原生续接（无损、零成本），短会话原样搬运，只有超长会话才动用 LLM 压缩。"
				>
					<SettingsRow
						label="默认档位"
						description="原生续接与原文接力都不丢信息；蒸馏接力会把细节压掉，只在会话超长时才值得。"
						action={
							<SettingsChipGroup
								size="sm"
								value={settings.handoff_policy}
								options={HANDOFF_POLICY_OPTIONS}
								onChange={(value) => void patch({ handoff_policy: value })}
							/>
						}
					/>
					<SettingsRow
						label="接力时同步共享白板"
						description="把当前工作目录的白板（目标 / 决策 / 踩坑 / 待办）一并写进交接内容，接手方立刻知道已有的结论。"
						action={
							<SettingsSwitch
								checked={settings.auto_board_sync}
								onChange={(next) => void patch({ auto_board_sync: next })}
							/>
						}
					/>
				</SettingsCardSection>
			</div>

			{/* ---------- 互为工具（正向） ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.bridge")}>
				<SettingsCardSection
					title="把其他入口当作工具"
					description="开启后，本应用的 Copilot 可以调用你的其他 AI 入口：让 ChatGPT 做联网研究、让 Gemini 吃超长上下文、向 Claude Code / Codex 要第二意见。"
				>
					<SettingsRow
						label="启用跨入口工具组"
						description="挂载 ipo_harness_bridge MCP 工具组（ask_web_ai / ask_agent / search_sessions / board_read / board_write / council）。"
						action={
							<SettingsSwitch
								checked={settings.bridge_enabled}
								onChange={(next) => void patch({ bridge_enabled: next })}
							/>
						}
					/>
					<SettingsRow
						label="允许被调方修改文件"
						description="默认只读。桥接调用是程序自动发起的，没人逐条审阅，给写权限等于让后台调用随时改你的代码——除非你明确需要委派改写任务，否则保持关闭。"
						action={
							<SettingsSwitch
								checked={settings.bridge_allow_write}
								onChange={(next) => void patch({ bridge_allow_write: next })}
							/>
						}
					/>
					<SettingsRow
						label="CLI 调用超时"
						description="headless 跑一个 coding agent 通常在一到三分钟量级。"
						action={
							<TimeoutInput
								valueMs={settings.bridge_cli_timeout_ms}
								onCommit={(ms) => void patch({ bridge_cli_timeout_ms: ms })}
							/>
						}
					/>
					<SettingsRow
						label="Web 站点等待超时"
						description="等站点把回答写完的最长时间。超时会返回已产出的部分并明确标注不完整。"
						action={
							<TimeoutInput
								valueMs={settings.bridge_web_timeout_ms}
								onCommit={(ms) => void patch({ bridge_web_timeout_ms: ms })}
							/>
						}
					/>
					<div className="pt-3">
						<SettingsHint icon={Wrench} title="调用是真实的，也有真实成本">
							每次 ask_web_ai 会在内嵌视图里真的发一条消息、等它写完；ask_agent
							会真的起一个子进程。 所有调用都记在审计表里（Hub
							可查），出问题能回溯是谁调了谁。
						</SettingsHint>
					</div>
				</SettingsCardSection>
			</div>

			{/* ---------- 反向 MCP ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.mcpServer")}>
				<SettingsCardSection
					title="让外部 CLI 调用本应用"
					description="把本应用暴露成一个 MCP 服务器。Claude Code / Codex 接上之后，就能用你已登录的 Web AI（走订阅额度，不烧 API token）、检索全部历史会话、读写跨 agent 共享白板。"
					headerAction={
						mcp?.running ? (
							<SettingsBadge tone={mcp.enabled ? "success" : "neutral"}>
								{mcp.enabled ? `运行中 · :${mcp.port}` : "已停用"}
							</SettingsBadge>
						) : (
							<SettingsBadge tone="warning">未启动</SettingsBadge>
						)
					}
				>
					<SettingsRow
						label="启用 MCP 服务"
						description="只监听 127.0.0.1，并要求 Bearer token。回环地址不是安全边界——本机任何进程（包括网页）都能访问它，所以鉴权不可关。"
						action={
							<SettingsSwitch
								checked={mcp?.enabled ?? false}
								disabled={!mcp?.running || busy}
								onChange={async (next) => {
									setBusy(true);
									try {
										setMcp(await setMcpEnabled(next));
									} catch (error) {
										toast.error(
											`切换失败：${error instanceof Error ? error.message : String(error)}`,
										);
									} finally {
										setBusy(false);
									}
								}}
							/>
						}
					/>

					{mcp?.running && mcp.enabled && (
						<div className="space-y-3 pt-3">
							<div>
								<div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-light">
									一键接入命令
								</div>
								<div className="space-y-1.5">
									{mcp.install_commands.map((item) => (
										<div
											key={item.label}
											className="flex items-center gap-2 rounded-lg border border-border bg-cream-50 px-3 py-2 dark:bg-cream-900/40"
										>
											<span className="w-[86px] shrink-0 text-[11.5px] text-text-muted">
												{item.label}
											</span>
											<code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11px] text-text-secondary">
												{item.command}
											</code>
											<button
												type="button"
												onClick={() => void copy(item.command, item.label)}
												title="复制命令"
												className="shrink-0 rounded-md p-1.5 text-text-light transition duration-200 hover:bg-warm-200/70 hover:text-text-secondary dark:hover:bg-cream-800/40"
											>
												{copiedLabel === item.label ? (
													<Check className="h-3.5 w-3.5 text-success" />
												) : (
													<Copy className="h-3.5 w-3.5" />
												)}
											</button>
										</div>
									))}
								</div>
							</div>

							<div>
								<div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-light">
									暴露的工具（{mcp.tools.length}）
								</div>
								<ul className="space-y-1">
									{mcp.tools.map((tool) => (
										<li key={tool.name} className="flex items-start gap-2">
											<code className="mt-px shrink-0 rounded bg-warm-200/70 px-1.5 py-0.5 font-mono text-[10.5px] text-text-secondary dark:bg-cream-800/50">
												{tool.name}
											</code>
											<span className="text-[11.5px] leading-relaxed text-text-muted">
												{tool.summary}
											</span>
										</li>
									))}
								</ul>
							</div>

							<div className="flex items-center gap-2 pt-1">
								<SettingsButton
									size="sm"
									variant="secondary"
									icon={KeyRound}
									onClick={async () => {
										const ok = await confirmDialog.danger(
											"轮换后旧 token 立即失效，已经接入的 CLI 需要用新命令重新添加。确定要换吗？",
											"轮换访问 token",
										);
										if (!ok) return;
										try {
											setMcp(await rotateMcpToken());
											toast.success("已生成新 token，请用上面的新命令重新接入");
										} catch (error) {
											toast.error(
												`轮换失败：${error instanceof Error ? error.message : String(error)}`,
											);
										}
									}}
								>
									轮换 token
								</SettingsButton>
								<span className="text-[11px] text-text-light">
									怀疑泄漏时使用
								</span>
							</div>
						</div>
					)}

					{mcp && !mcp.running && (
						<div className="pt-3">
							<SettingsHint icon={AlertTriangle} title="服务没能启动">
								8790–8799
								端口全被占用，或系统禁止本地监听。重启应用会重新探测端口；
								其余功能不受影响。
							</SettingsHint>
						</div>
					)}
				</SettingsCardSection>
			</div>

			{/* ---------- 能力路由 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.routes")}>
				<SettingsCardSection
					title="能力路由"
					description="不同类型的活派给不同入口。这张表只决定优先顺序，实际派活时还会跳过没装的、没启用的、以及正处于限额中的入口。"
				>
					<div className="space-y-4">
						{capabilities.map((capability) => {
							const rule = routes.find(
								(r) => r.capability === capability.capability,
							);
							return (
								<div
									key={capability.capability}
									className="border-b border-border pb-4 last:border-0 last:pb-0"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex items-center gap-1.5">
												<Route
													className="h-3.5 w-3.5 text-text-light"
													strokeWidth={1.6}
												/>
												<span className="text-[13.5px] font-medium text-text-primary">
													{capability.label}
												</span>
											</div>
											<p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
												{capability.description}
											</p>
										</div>
										<SettingsButton
											size="sm"
											variant="ghost"
											onClick={async () => {
												try {
													setRoutes(await resetRoute(capability.capability));
												} catch (error) {
													toast.error(
														`重置失败：${error instanceof Error ? error.message : String(error)}`,
													);
												}
											}}
										>
											恢复默认
										</SettingsButton>
									</div>

									<div className="mt-2 flex flex-wrap items-center gap-1">
										{(rule?.harnesses ?? []).map((harness, index) => (
											<span
												key={`${harness}-${index}`}
												className="inline-flex items-center gap-1 rounded-md bg-warm-200/70 px-2 py-0.5 text-[11px] text-text-secondary dark:bg-cream-800/50"
											>
												<span className="tabular-nums text-text-light">
													{index + 1}
												</span>
												{harness}
												{index > 0 && (
													<button
														type="button"
														title="上移一位"
														onClick={async () => {
															const list = [...(rule?.harnesses ?? [])];
															[list[index - 1], list[index]] = [
																list[index],
																list[index - 1],
															];
															try {
																setRoutes(
																	await saveRoute({
																		capability: capability.capability,
																		harnesses: list,
																	}),
																);
															} catch (error) {
																toast.error(
																	`保存失败：${error instanceof Error ? error.message : String(error)}`,
																);
															}
														}}
														className="ml-0.5 text-text-light transition duration-200 hover:text-terracotta"
													>
														↑
													</button>
												)}
											</span>
										))}
										{!rule?.harnesses.length && (
											<span className="text-[11.5px] text-text-light">
												（未配置任何入口）
											</span>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</SettingsCardSection>
			</div>

			{/* ---------- 额度状态 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.quota")}>
				<SettingsCardSection
					title="额度状态"
					description="从已摄取的真实转录里检测各入口的限额提示。检测到之后，能力路由会自动绕开它，直到恢复时间或 4 小时保守窗口过去。"
					headerAction={
						<SettingsButton
							size="sm"
							variant="secondary"
							icon={RefreshCw}
							onClick={async () => {
								try {
									setQuotas(await refreshQuotas());
									toast.success("已重扫最近 24 小时的转录");
								} catch (error) {
									toast.error(
										`刷新失败：${error instanceof Error ? error.message : String(error)}`,
									);
								}
							}}
						>
							重新检测
						</SettingsButton>
					}
				>
					{quotas.length === 0 ? (
						<SettingsHint icon={ShieldCheck} title="没有检测到任何限额信号">
							这不代表额度充足，只代表最近的转录里没有出现各家的限额提示文案。
							本应用**不估算剩余额度**——没有可靠的本地数据来源，猜出来的百分比
							比不显示更容易误导。
						</SettingsHint>
					) : (
						<div className="space-y-3">
							{quotas.map((quota) => (
								<div
									key={quota.harness}
									className={cn(
										"rounded-xl border px-3.5 py-3",
										quota.blocked
											? "border-warning/30 bg-warning/[0.06]"
											: "border-border",
									)}
								>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-1.5">
											{quota.blocked ? (
												<AlertTriangle
													className="h-3.5 w-3.5 text-warning"
													strokeWidth={1.8}
												/>
											) : (
												<ShieldCheck
													className="h-3.5 w-3.5 text-success"
													strokeWidth={1.8}
												/>
											)}
											<span className="text-[13px] font-medium text-text-primary">
												{quota.harness}
											</span>
											{quota.manual_blocked && (
												<SettingsBadge tone="neutral" size="xs">
													手动标记
												</SettingsBadge>
											)}
										</div>
										<div className="flex items-center gap-1.5">
											<SettingsButton
												size="sm"
												variant="ghost"
												onClick={async () => {
													try {
														const next = await setQuotaBlock(
															quota.harness,
															!quota.manual_blocked,
														);
														setQuotas((prev) =>
															prev.map((q) =>
																q.harness === next.harness ? next : q,
															),
														);
													} catch (error) {
														toast.error(
															`操作失败：${error instanceof Error ? error.message : String(error)}`,
														);
													}
												}}
											>
												{quota.manual_blocked ? "解除标记" : "标记不可用"}
											</SettingsButton>
											{quota.limit_hit_at && (
												<SettingsButton
													size="sm"
													variant="ghost"
													onClick={async () => {
														try {
															const next = await clearQuotaSignal(
																quota.harness,
															);
															setQuotas((prev) =>
																prev.map((q) =>
																	q.harness === next.harness ? next : q,
																),
															);
														} catch (error) {
															toast.error(
																`操作失败：${error instanceof Error ? error.message : String(error)}`,
															);
														}
													}}
												>
													这是误判
												</SettingsButton>
											)}
										</div>
									</div>

									<div className="mt-1.5 space-y-0.5 text-[11.5px] text-text-muted">
										<div>检测到限额：{formatWhen(quota.limit_hit_at)}</div>
										<div>
											恢复时间：
											{quota.resets_at
												? formatWhen(quota.resets_at)
												: "未能从提示文案里解析出（不做猜测）"}
										</div>
									</div>

									{quota.evidence && (
										<details className="mt-2">
											<summary className="cursor-pointer text-[11px] text-text-light hover:text-text-secondary">
												查看判定依据
											</summary>
											<p className="mt-1 rounded-lg bg-cream-50 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-text-secondary dark:bg-cream-900/40">
												{quota.evidence}
											</p>
										</details>
									)}
								</div>
							))}
						</div>
					)}
				</SettingsCardSection>
			</div>
		</>
	);
}

/** 超时输入：以秒为单位编辑，失焦提交（毫秒对用户不友好）。 */
function TimeoutInput({
	valueMs,
	onCommit,
}: {
	valueMs: number;
	onCommit: (ms: number) => void;
}) {
	const [text, setText] = useState(String(Math.round(valueMs / 1000)));

	useEffect(() => {
		setText(String(Math.round(valueMs / 1000)));
	}, [valueMs]);

	return (
		<div className="flex items-center gap-1.5">
			<input
				type="number"
				min={10}
				max={900}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onBlur={() => {
					const seconds = Number(text);
					if (!Number.isFinite(seconds) || seconds < 10) {
						setText(String(Math.round(valueMs / 1000)));
						return;
					}
					onCommit(Math.round(Math.min(900, seconds) * 1000));
				}}
				className="w-[72px] rounded-lg border border-border bg-surface px-2.5 py-1 text-right text-[12.5px] tabular-nums text-text-secondary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/8 dark:bg-cream-900/40"
			/>
			<span className="text-[12px] text-text-light">秒</span>
		</div>
	);
}
