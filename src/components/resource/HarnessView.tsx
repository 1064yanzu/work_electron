/**
 * HarnessView —— 左栏「会话中枢」（AI Harness Hub）。
 *
 * 把本机各个 AI 入口（Claude Code / Codex / 本应用 / Web 站点）已摄取的会话
 * 汇总到一处：筛选、全文检索、查看转录，并支持把一段会话「蒸馏成交接包」
 * 迁移到另一个入口继续干活。
 *
 * 数据全部来自 `src/lib/api/harnessHub.ts` 的真实 IPC，无任何本地假数据：
 *   - 列表/计数        harness_sessions_list
 *   - 入口探测         harness_detect
 *   - 全文检索         harness_sessions_search（FTS5 snippet，命中词带 <mark>）
 *   - 摄取             harness_ingest_scan（进度走 harness-ingest-progress）
 *   - 蒸馏 + 迁移      harness_handoff_create / update / launch
 *   - Web 注入         aihub_sites_list / aihub_inject
 *
 * 视图层级（窄栏里避免嵌套过深，重内容一律走整面覆盖层）：
 *   列表 / 搜索结果  →  转录覆盖层  →  HANDOFF 覆盖层
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import {
	createHandoff,
	deleteHarnessSession,
	detectHarnesses,
	getHarnessSession,
	launchHandoff,
	listAiHubSites,
	listHarnessSessions,
	scanHarnessSessions,
	searchHarnessSessions,
	updateHandoff,
} from "../../lib/api/harnessHub";
import type {
	AiHubSiteRow,
	HarnessDetectionRow,
	HarnessSearchHit,
	HarnessSessionRow,
} from "../../lib/api/harnessHub";
import { useIpcListen } from "../../hooks/useIpcListen";
import { workspaceStore } from "../../lib/workspaceStore";
import { aiHubRequestStore } from "../../lib/stores/aiHubRequestStore";
import { cn } from "../../lib/utils";
import { confirmDialog } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";

import { HandoffOverlay } from "./harness/HandoffOverlay";
import { SearchResults } from "./harness/SearchResults";
import { SessionRow } from "./harness/SessionRow";
import { TranscriptOverlay } from "./harness/TranscriptOverlay";
import { EmptyState, HarnessChip, IconButton } from "./harness/controls";
import type {
	HandoffFlow,
	HandoffProgressPayload,
	IngestProgressPayload,
	MigrateTarget,
	SessionUpdatedPayload,
	TranscriptState,
} from "./harness/types";
import {
	APP_HARNESS,
	LIST_LIMIT,
	SEARCH_LIMIT,
	TRANSCRIPT_LIMIT,
	sessionTitle,
	toMessage,
} from "./harness/utils";

// ============================================================
// 主组件
// ============================================================

export function HarnessView() {
	// —— 元数据 ——
	const [detections, setDetections] = useState<HarnessDetectionRow[]>([]);
	const [sites, setSites] = useState<AiHubSiteRow[]>([]);
	/** 非 CLI 来源（本应用 / Web 站点）的会话数，key 为 harness */
	const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});
	const [allTotal, setAllTotal] = useState(0);

	// —— 列表 ——
	const [sessions, setSessions] = useState<HarnessSessionRow[]>([]);
	const [total, setTotal] = useState(0);
	const [activeHarness, setActiveHarness] = useState<string | null>(null);
	const [listLoading, setListLoading] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [migrateForId, setMigrateForId] = useState<string | null>(null);

	// —— 搜索 ——
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<HarnessSearchHit[] | null>(null);
	const [searching, setSearching] = useState(false);

	// —— 摄取 ——
	const [scanning, setScanning] = useState(false);
	const [ingest, setIngest] = useState<IngestProgressPayload | null>(null);

	// —— 覆盖层 ——
	const [transcript, setTranscript] = useState<TranscriptState | null>(null);
	const [flow, setFlow] = useState<HandoffFlow | null>(null);

	const [error, setError] = useState<string | null>(null);

	const activeHarnessRef = useRef<string | null>(null);
	activeHarnessRef.current = activeHarness;
	const softReloadTimerRef = useRef<number | null>(null);

	// ---------------------------------------------------------
	// 数据加载
	// ---------------------------------------------------------

	/** 探测入口 + Web 站点 + 各来源计数 */
	const reloadMeta = useCallback(async () => {
		const [detected, siteRows, allRes] = await Promise.all([
			detectHarnesses(),
			listAiHubSites(),
			listHarnessSessions({ limit: 1 }),
		]);
		setDetections(detected);
		setSites(siteRows);
		setAllTotal(allRes.total);

		// CLI 之外的来源（本应用 + 各 Web 站点）不在探测结果里，单独取计数
		const extraHarnesses = Array.from(
			new Set([APP_HARNESS, ...siteRows.map((site) => site.harness)]),
		);
		const counted = await Promise.all(
			extraHarnesses.map(async (harness) => {
				const res = await listHarnessSessions({ harness, limit: 1 });
				return [harness, res.total] as const;
			}),
		);
		setExtraCounts(Object.fromEntries(counted));
	}, []);

	/** 拉取当前筛选下的会话列表 */
	const reloadSessions = useCallback(async (harness: string | null) => {
		setListLoading(true);
		try {
			const res = await listHarnessSessions({
				harness: harness ?? undefined,
				limit: LIST_LIMIT,
			});
			setSessions(res.sessions);
			setTotal(res.total);
		} catch (err) {
			setError(`加载会话失败：${toMessage(err)}`);
		} finally {
			setListLoading(false);
		}
	}, []);

	// 首次挂载：元数据 + 列表
	useEffect(() => {
		void reloadMeta().catch((err) => {
			setError(`探测 AI 入口失败：${toMessage(err)}`);
		});
	}, [reloadMeta]);

	// 切换筛选时重新拉列表
	useEffect(() => {
		void reloadSessions(activeHarness);
	}, [activeHarness, reloadSessions]);

	// 卸载时清掉待执行的软刷新
	useEffect(() => {
		return () => {
			if (softReloadTimerRef.current !== null) {
				window.clearTimeout(softReloadTimerRef.current);
			}
		};
	}, []);

	/** 增量摄取到新内容时的合并刷新（避免连续事件打爆 IPC） */
	const scheduleSoftReload = useCallback(() => {
		if (softReloadTimerRef.current !== null) {
			window.clearTimeout(softReloadTimerRef.current);
		}
		softReloadTimerRef.current = window.setTimeout(() => {
			softReloadTimerRef.current = null;
			void reloadMeta().catch(() => {
				// 后台刷新失败不打扰用户
			});
			void reloadSessions(activeHarnessRef.current);
		}, 800);
	}, [reloadMeta, reloadSessions]);

	// ---------------------------------------------------------
	// 事件订阅
	// ---------------------------------------------------------

	useIpcListen<IngestProgressPayload>("harness-ingest-progress", (payload) => {
		setIngest(payload);
		if (payload.phase === "done") {
			// 扫描收尾：稍后统一刷新，进度条淡出
			window.setTimeout(() => setIngest(null), 1200);
		}
	});

	useIpcListen<SessionUpdatedPayload>("harness-session-updated", () => {
		scheduleSoftReload();
	});

	useIpcListen<HandoffProgressPayload>("harness-handoff-event", (payload) => {
		setFlow((prev) =>
			prev && prev.stage === "distilling"
				? { ...prev, progress: payload }
				: prev,
		);
	});

	// ---------------------------------------------------------
	// 搜索（防抖 300ms）
	// ---------------------------------------------------------

	useEffect(() => {
		const keyword = query.trim();
		if (!keyword) {
			setHits(null);
			setSearching(false);
			return;
		}
		setSearching(true);
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			try {
				const result = await searchHarnessSessions(keyword, {
					harness: activeHarness ?? undefined,
					limit: SEARCH_LIMIT,
				});
				if (cancelled) return;
				setHits(result);
			} catch (err) {
				if (cancelled) return;
				setHits([]);
				setError(`检索失败：${toMessage(err)}`);
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [query, activeHarness]);

	// ---------------------------------------------------------
	// 交互
	// ---------------------------------------------------------

	const handleScan = async () => {
		if (scanning) return;
		setScanning(true);
		setError(null);
		try {
			const result = await scanHarnessSessions({});
			await reloadMeta();
			await reloadSessions(activeHarnessRef.current);
			toast.success(
				result.updated > 0
					? `已摄取 ${result.updated} 段会话（扫描 ${result.scanned} 个文件）`
					: `已是最新，扫描 ${result.scanned} 个文件`,
			);
		} catch (err) {
			setError(`摄取失败：${toMessage(err)}`);
		} finally {
			setScanning(false);
			setIngest(null);
		}
	};

	const handleOpenTranscript = async (sessionId: string) => {
		setTranscript({
			sessionId,
			session: null,
			messages: [],
			loading: true,
			error: null,
		});
		try {
			const res = await getHarnessSession(sessionId, {
				limit: TRANSCRIPT_LIMIT,
			});
			setTranscript((prev) =>
				prev && prev.sessionId === sessionId
					? {
							...prev,
							session: res.session,
							messages: res.messages,
							loading: false,
						}
					: prev,
			);
		} catch (err) {
			setTranscript((prev) =>
				prev && prev.sessionId === sessionId
					? {
							...prev,
							loading: false,
							error: `加载转录失败：${toMessage(err)}`,
						}
					: prev,
			);
		}
	};

	const handleDelete = async (session: HarnessSessionRow) => {
		const confirmed = await confirmDialog.danger(
			`确定移除「${sessionTitle(session)}」吗？只删除本地摄取记录，不会动原始会话文件。`,
			"移除会话",
		);
		if (!confirmed) return;
		try {
			await deleteHarnessSession(session.id);
			setExpandedId((prev) => (prev === session.id ? null : prev));
			setTranscript((prev) => (prev?.sessionId === session.id ? null : prev));
			await reloadMeta();
			await reloadSessions(activeHarnessRef.current);
			toast.success("已移除会话记录");
		} catch (err) {
			setError(`删除失败：${toMessage(err)}`);
		}
	};

	/** 开始蒸馏：目标选定 → createHandoff → 预览 */
	const handleStartMigrate = async (
		session: HarnessSessionRow,
		target: MigrateTarget,
	) => {
		setMigrateForId(null);
		setFlow({
			session,
			target,
			stage: "distilling",
			progress: null,
			handoffId: null,
			pkg: null,
			markdown: "",
			error: null,
		});
		try {
			const res = await createHandoff({
				session_id: session.id,
				target_harness: target.harness,
			});
			setFlow((prev) =>
				prev && prev.session.id === session.id
					? {
							...prev,
							stage: "preview",
							handoffId: res.handoff_id,
							pkg: res.package,
							markdown: res.package.markdown,
						}
					: prev,
			);
		} catch (err) {
			setFlow((prev) =>
				prev && prev.session.id === session.id
					? { ...prev, stage: "preview", error: `蒸馏失败：${toMessage(err)}` }
					: prev,
			);
		}
	};

	/** 确认交接：保存编辑 → 按目标类型分流投递 */
	const handleConfirmHandoff = async () => {
		if (!flow?.handoffId) return;
		const { handoffId, markdown, target, session } = {
			handoffId: flow.handoffId,
			markdown: flow.markdown,
			target: flow.target,
			session: flow.session,
		};
		setFlow((prev) =>
			prev ? { ...prev, stage: "launching", error: null } : prev,
		);
		try {
			await updateHandoff(handoffId, markdown);

			if (target.kind === "cli") {
				const launched = await launchHandoff({
					handoff_id: handoffId,
					cwd: session.cwd ?? undefined,
				});
				toast.success(
					launched.handoff_path
						? `已在终端启动 ${target.label}，交接包已写入 HANDOFF.md`
						: `已在终端启动 ${target.label}`,
				);
			} else if (target.kind === "web") {
				// 通过 aiHubRequestStore 告诉中栏「打开哪个站点 + 注入什么」，
				// 由 AiHubPanel 在视图真正就绪后执行——它才知道 view 何时挂好，
				// 这里定时等待属于竞态（且它默认打开的是上次浏览的站点，不一定是目标站点）。
				aiHubRequestStore.request(target.id, markdown);
				workspaceStore.setMainView("aihub");
				toast.info(`正在打开 ${target.label} 并填入交接包…`);
			} else {
				await navigator.clipboard.writeText(markdown);
				toast.success("交接包已复制，粘贴到右侧 Copilot 即可接力");
			}

			setFlow(null);
			setExpandedId(null);
		} catch (err) {
			// 投递失败也别让用户丢内容：兜底进剪贴板
			try {
				await navigator.clipboard.writeText(markdown);
			} catch {
				// 剪贴板不可用则静默
			}
			setFlow((prev) =>
				prev
					? {
							...prev,
							stage: "preview",
							error: `迁移失败：${toMessage(err)}（交接包已复制到剪贴板）`,
						}
					: prev,
			);
		}
	};

	// ---------------------------------------------------------
	// 派生数据
	// ---------------------------------------------------------

	/** 顶部筛选 chip：全部 + 已探测 CLI + 有数据的其他来源 */
	const chips = useMemo(() => {
		const siteLabels = new Map(sites.map((site) => [site.harness, site.label]));
		const cliChips = detections.map((item) => ({
			harness: item.harness,
			label: item.label,
			count: item.session_count,
			installed: item.installed,
		}));
		const extraChips = Object.entries(extraCounts)
			.filter(([, count]) => count > 0)
			.map(([harness, count]) => ({
				harness,
				label:
					harness === APP_HARNESS
						? "本应用"
						: (siteLabels.get(harness) ?? harness),
				count,
				installed: true,
			}));
		return [...cliChips, ...extraChips];
	}, [detections, sites, extraCounts]);

	/** 可迁移目标：可注入 CLI + 已启用 Web 站点 + 本应用 */
	const migrateTargets = useMemo<MigrateTarget[]>(() => {
		const cli: MigrateTarget[] = detections
			.filter((item) => item.can_inject)
			.map((item) => ({
				kind: "cli",
				id: item.harness,
				harness: item.harness,
				label: item.label,
			}));
		const web: MigrateTarget[] = sites
			.filter((site) => site.enabled)
			.map((site) => ({
				kind: "web",
				id: site.id,
				harness: site.harness,
				label: site.label,
			}));
		return [
			...cli,
			...web,
			{
				kind: "app",
				id: APP_HARNESS,
				harness: APP_HARNESS,
				label: "本应用 Copilot",
			},
		];
	}, [detections, sites]);

	/** harness → 展示名（列表徽标用） */
	const labelOf = useCallback(
		(harness: string): string => {
			if (harness === APP_HARNESS) return "本应用";
			const detected = detections.find((item) => item.harness === harness);
			if (detected) return detected.label;
			const site = sites.find((item) => item.harness === harness);
			return site?.label ?? harness;
		},
		[detections, sites],
	);

	const isSearchMode = query.trim().length > 0;
	const sessionById = useMemo(
		() => new Map(sessions.map((item) => [item.id, item])),
		[sessions],
	);

	// ---------------------------------------------------------
	// 渲染
	// ---------------------------------------------------------

	return (
		<div className="flex flex-col h-full bg-transparent relative">
			{/* Header —— editorial */}
			<div className="px-5 pt-6 pb-3 shrink-0">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<div className="text-[9.5px] font-semibold tracking-[0.22em] text-text-light uppercase">
							AI Harness Hub
						</div>
						<h2 className="font-serif text-[20px] leading-[1.15] text-text-primary mt-1.5 tracking-tight">
							会话中枢
						</h2>
						<p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
							<span className="tabular-nums text-text-secondary">
								{allTotal}
							</span>
							<span> 段会话</span>
							{activeHarness && (
								<>
									<span className="mx-1.5 text-text-light/50">·</span>
									<span>
										当前筛选{" "}
										<span className="tabular-nums text-text-secondary">
											{total}
										</span>
									</span>
								</>
							)}
						</p>
					</div>
					<div className="flex items-center gap-0.5 shrink-0 -mr-1">
						<IconButton
							onClick={handleScan}
							disabled={scanning}
							title="从本机 Claude Code / Codex 摄取最新会话"
						>
							<RefreshCw
								className={cn("w-3.5 h-3.5", scanning && "animate-spin")}
							/>
						</IconButton>
					</div>
				</div>
			</div>

			{/* 摄取进度 */}
			{ingest && (
				<div className="mx-5 mb-2 shrink-0 animate-fade-in">
					<div className="flex items-center justify-between gap-2 text-[10.5px] text-text-muted">
						<span className="truncate">
							{ingest.phase === "done"
								? `摄取完成 · 更新 ${ingest.updated} 段`
								: `正在摄取 ${ingest.harness ? labelOf(ingest.harness) : "会话"}`}
						</span>
						{ingest.total > 0 && ingest.phase !== "done" && (
							<span className="tabular-nums shrink-0">
								{ingest.processed}/{ingest.total}
							</span>
						)}
					</div>
					<div className="mt-1.5 h-0.5 rounded-full bg-warm-200 overflow-hidden">
						<div
							className="h-full rounded-full bg-terracotta transition-[width] duration-300"
							style={{
								width:
									ingest.phase === "done"
										? "100%"
										: `${
												ingest.total > 0
													? Math.min(
															100,
															Math.round(
																(ingest.processed / ingest.total) * 100,
															),
														)
													: 8
											}%`,
							}}
						/>
					</div>
				</div>
			)}

			{/* 错误提示 */}
			{error && (
				<div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-error/8 dark:bg-error/15 border border-error/20 text-[11.5px] text-error flex items-center justify-between gap-2 animate-fade-in shrink-0">
					<span className="truncate">{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="shrink-0 -mr-1 p-1 rounded hover:bg-error/10"
						title="关闭"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			)}

			{/* 搜索 + 来源筛选 */}
			<div className="px-5 pb-3 shrink-0 space-y-2.5">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light pointer-events-none" />
					<input
						type="text"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="全文检索会话内容…"
						className="w-full pl-9 pr-8 py-2 text-[12px] bg-surface dark:bg-cream-900/40 border border-border rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-200"
					/>
					{searching ? (
						<Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light animate-spin" />
					) : (
						query && (
							<button
								type="button"
								onClick={() => setQuery("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-light hover:text-text-secondary hover:bg-warm-200/70 transition duration-200"
								title="清空"
							>
								<X className="w-3 h-3" />
							</button>
						)
					)}
				</div>

				<div className="flex items-center gap-1 -mx-1 px-1 overflow-x-auto scrollbar-hide">
					<HarnessChip
						label="全部"
						count={allTotal}
						active={activeHarness === null}
						onClick={() => setActiveHarness(null)}
					/>
					{chips.map((chip) => (
						<HarnessChip
							key={chip.harness}
							label={chip.label}
							count={chip.count}
							active={activeHarness === chip.harness}
							dimmed={!chip.installed}
							disabled={chip.count === 0 && !chip.installed}
							title={
								chip.installed
									? `${chip.label} · ${chip.count} 段会话`
									: `${chip.label} 未安装`
							}
							onClick={() => setActiveHarness(chip.harness)}
						/>
					))}
				</div>
			</div>

			{/* 列表主体 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-6">
				{listLoading && sessions.length === 0 ? (
					<div className="flex items-center justify-center gap-2 py-16 text-[11.5px] text-text-light">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						正在加载会话…
					</div>
				) : isSearchMode ? (
					<SearchResults
						hits={hits}
						searching={searching}
						labelOf={labelOf}
						onOpen={(sessionId) => void handleOpenTranscript(sessionId)}
					/>
				) : sessions.length === 0 ? (
					<EmptyState scanning={scanning} onScan={handleScan} />
				) : (
					<>
						<ul className="space-y-px">
							{sessions.map((session) => (
								<li key={session.id}>
									<SessionRow
										session={session}
										harnessLabel={labelOf(session.harness)}
										expanded={expandedId === session.id}
										migrateOpen={migrateForId === session.id}
										targets={migrateTargets}
										onToggle={() => {
											setMigrateForId(null);
											setExpandedId((prev) =>
												prev === session.id ? null : session.id,
											);
										}}
										onToggleMigrate={() =>
											setMigrateForId((prev) =>
												prev === session.id ? null : session.id,
											)
										}
										onPickTarget={(target) =>
											void handleStartMigrate(session, target)
										}
										onTranscript={() => void handleOpenTranscript(session.id)}
										onDelete={() => void handleDelete(session)}
									/>
								</li>
							))}
						</ul>
						{total > sessions.length && (
							<p className="text-center text-[10.5px] text-text-light/80 pt-4">
								共 {total} 段，已显示最近 {sessions.length} 段
							</p>
						)}
					</>
				)}
			</div>

			{/* 转录覆盖层 */}
			{transcript && (
				<TranscriptOverlay
					state={transcript}
					harnessLabel={
						transcript.session ? labelOf(transcript.session.harness) : ""
					}
					targets={migrateTargets}
					onClose={() => setTranscript(null)}
					onMigrate={(target) => {
						const session =
							transcript.session ?? sessionById.get(transcript.sessionId);
						if (!session) return;
						setTranscript(null);
						void handleStartMigrate(session, target);
					}}
				/>
			)}

			{/* HANDOFF 覆盖层 */}
			{flow && (
				<HandoffOverlay
					flow={flow}
					onChangeMarkdown={(markdown) =>
						setFlow((prev) => (prev ? { ...prev, markdown } : prev))
					}
					onCancel={() => setFlow(null)}
					onConfirm={() => void handleConfirmHandoff()}
				/>
			)}
		</div>
	);
}
