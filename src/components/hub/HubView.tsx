/**
 * HubView —— AI Hub 主视图（中栏 `hub` 标签）。
 *
 * 左栏的「会话中枢」是一个窄条列表，够用但撑不起跨入口协作。Hub 是它的完全体：
 *
 *   顶部  入口轨道（同时是拖拽落点）
 *   左侧  跨入口统一时间线 —— 所有入口的会话混排成一条流
 *   右侧  三个工作面板：会话详情 / 议会 / 共享白板
 *
 * 核心交互是**拖拽即接力**：把时间线上的一段会话拖到顶部任意入口上松手，
 * 右侧滑出接力抽屉，先告诉你这次是无损还是有损、为什么，再让你确认。
 * 原来那套「点接力 → 弹菜单选目标 → 再确认」的三步流程被压成一个动作。
 *
 * 数据全部来自真实 IPC，没有任何占位数字：额度未检测到就显示"未检测到"，
 * Web 入口的会话数只覆盖用户主动导入过的部分。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import {
	deleteHarnessSession,
	detectHarnesses,
	exportSession,
	importSession,
	listAiHubSites,
	listHarnessSessions,
	listQuotas,
	planHandoff,
	refreshQuotas,
	scanHarnessSessions,
	searchHarnessSessions,
	launchNativeResume,
	type AiHubSiteRow,
	type HarnessDetectionRow,
	type HarnessQuotaRow,
	type HarnessSearchHit,
	type HarnessSessionRow,
} from "../../lib/api";
import { useIpcListen } from "../../hooks/useIpcListen";
import { cn } from "../../lib/utils";
import { confirmDialog } from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";
import { BoardPanel } from "./BoardPanel";
import { CouncilPanel } from "./CouncilPanel";
import { HandoffDrawer } from "./HandoffDrawer";
import { HarnessRail } from "./HarnessRail";
import { HubTimeline } from "./HubTimeline";
import { RuntimePanel } from "./RuntimePanel";
import { SessionDetail } from "./SessionDetail";
import { AutomationPanel } from "./automation/AutomationPanel";
import { useHarnessRuntimes } from "./automation/useHarnessRuntimes";
import {
	APP_HARNESS,
	TIMELINE_LIMIT,
	buildEntries,
	sessionTitle,
	type HubEntry,
} from "./hubUtils";

type SidePanel = "detail" | "council" | "board" | "runtime" | "automation";

interface HandoffRequest {
	session: HarnessSessionRow;
	target: HubEntry;
}

export function HubView() {
	// —— 元数据 ——
	const [detections, setDetections] = useState<HarnessDetectionRow[]>([]);
	const [sites, setSites] = useState<AiHubSiteRow[]>([]);
	const [quotas, setQuotas] = useState<HarnessQuotaRow[]>([]);
	const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});

	// —— 时间线 ——
	const [sessions, setSessions] = useState<HarnessSessionRow[]>([]);
	const [total, setTotal] = useState(0);
	const [filter, setFilter] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<HarnessSearchHit[] | null>(null);

	// —— 右侧 ——
	const [panel, setPanel] = useState<SidePanel>("detail");
	const [selected, setSelected] = useState<HarnessSessionRow | null>(null);

	// —— 接力 ——
	const [dropTargetId, setDropTargetId] = useState<string | null>(null);
	const [handoff, setHandoff] = useState<HandoffRequest | null>(null);
	const draggingRef = useRef<HarnessSessionRow | null>(null);

	// —— 其他 ——
	const [scanning, setScanning] = useState(false);
	/** 支持原生续接的会话 id（后端逐条预演得出，不在前端猜） */
	const [resumableIds, setResumableIds] = useState<Set<string>>(new Set());
	const filterRef = useRef<string | null>(null);
	filterRef.current = filter;

	// —— 运行态 ——
	// 入口轨道上的实时状态点与「运行」标签的计数共用这一份订阅
	const { busyCount: runningCount, stateByHarness } = useHarnessRuntimes();

	// ---------------------------------------------------------
	// 数据加载
	// ---------------------------------------------------------

	const reloadMeta = useCallback(async () => {
		const [detected, siteRows, quotaRows] = await Promise.all([
			detectHarnesses(),
			listAiHubSites(),
			listQuotas().catch(() => [] as HarnessQuotaRow[]),
		]);
		setDetections(detected);
		setSites(siteRows);
		setQuotas(quotaRows);

		// CLI 之外的来源不在探测结果里，逐个取计数
		const extras = Array.from(
			new Set([APP_HARNESS, ...siteRows.map((s) => s.harness)]),
		);
		const counted = await Promise.all(
			extras.map(async (harness) => {
				const res = await listHarnessSessions({ harness, limit: 1 });
				return [harness, res.total] as const;
			}),
		);
		setExtraCounts(Object.fromEntries(counted));
	}, []);

	const reloadSessions = useCallback(async (harness: string | null) => {
		setLoading(true);
		try {
			const res = await listHarnessSessions({
				harness: harness ?? undefined,
				limit: TIMELINE_LIMIT,
			});
			setSessions(res.sessions);
			setTotal(res.total);
		} catch (error) {
			toast.error(
				`加载会话失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reloadMeta().catch((error: unknown) => {
			toast.error(
				`探测入口失败：${error instanceof Error ? error.message : String(error)}`,
			);
		});
	}, [reloadMeta]);

	useEffect(() => {
		void reloadSessions(filter);
	}, [filter, reloadSessions]);

	/**
	 * 逐条预演「能否原生续接」。
	 *
	 * 这必须问后端：能不能 resume 取决于该 CLI 有没有 resume 命令、原生会话 id
	 * 在不在、本机装没装——前端按 harness 名字猜迟早猜错。只对当前视口内
	 * 前若干条做，避免一次几百个 IPC。
	 */
	useEffect(() => {
		let cancelled = false;
		const candidates = sessions.slice(0, 40);
		if (!candidates.length) {
			setResumableIds(new Set());
			return;
		}
		void Promise.all(
			candidates.map(async (session) => {
				try {
					const plan = await planHandoff({
						session_id: session.id,
						target_harness: session.harness,
					});
					return plan.native_available ? session.id : null;
				} catch {
					return null;
				}
			}),
		).then((ids) => {
			if (cancelled) return;
			setResumableIds(new Set(ids.filter((id): id is string => Boolean(id))));
		});
		return () => {
			cancelled = true;
		};
	}, [sessions]);

	// 增量摄取到新内容时刷新（后端已做过 debounce，这里直接跟随）
	useIpcListen("harness-session-updated", () => {
		void reloadSessions(filterRef.current);
	});

	// 搜索（防抖 300ms）
	useEffect(() => {
		const keyword = query.trim();
		if (!keyword) {
			setHits(null);
			return;
		}
		let cancelled = false;
		const timer = window.setTimeout(async () => {
			try {
				const result = await searchHarnessSessions(keyword, {
					harness: filter ?? undefined,
					limit: 60,
				});
				if (!cancelled) setHits(result);
			} catch {
				if (!cancelled) setHits([]);
			}
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [query, filter]);

	// ---------------------------------------------------------
	// 派生
	// ---------------------------------------------------------

	const entries = useMemo(
		() => buildEntries({ detections, sites, quotas, extraCounts }),
		[detections, sites, quotas, extraCounts],
	);

	const labelOf = useCallback(
		(harness: string): string => {
			if (harness === APP_HARNESS) return "本应用";
			return (
				entries.find((e) => e.harness === harness)?.label ??
				harness.replace(/^web-/, "")
			);
		},
		[entries],
	);

	/** 搜索命中所属的会话（用命中结果反查时间线里的行）。 */
	const searchSessions = useMemo(() => {
		if (!hits) return null;
		const byId = new Map(sessions.map((s) => [s.id, s]));
		const seen = new Set<string>();
		const out: HarnessSessionRow[] = [];
		for (const hit of hits) {
			if (seen.has(hit.session_id)) continue;
			seen.add(hit.session_id);
			const session = byId.get(hit.session_id);
			if (session) out.push(session);
		}
		return out;
	}, [hits, sessions]);

	const visibleSessions = searchSessions ?? sessions;

	/** 议会与白板的作用域：跟随当前选中会话的工作目录。 */
	const activeCwd = selected?.cwd ?? null;

	// ---------------------------------------------------------
	// 动作
	// ---------------------------------------------------------

	const handleScan = async () => {
		if (scanning) return;
		setScanning(true);
		try {
			const result = await scanHarnessSessions({});
			await reloadMeta();
			await reloadSessions(filterRef.current);
			// 摄取完顺带重扫限额信号——新转录里可能刚好有限额提示
			await refreshQuotas()
				.then(setQuotas)
				.catch(() => undefined);
			toast.success(
				result.updated > 0
					? `已摄取 ${result.updated} 段会话（扫描 ${result.scanned} 个文件）`
					: `已是最新，扫描 ${result.scanned} 个文件`,
			);
		} catch (error) {
			toast.error(
				`摄取失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setScanning(false);
		}
	};

	/** 导入外部会话文件（本格式 / ChatGPT 导出 / CLI 原生 jsonl）。 */
	const handleImport = async () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,.jsonl,.md";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const text = await file.text();
				const result = await importSession(
					file.name.endsWith(".jsonl")
						? // jsonl 走后端按路径解析（复用 adapter 的逐行防御式解析）
							{ path: (file as File & { path?: string }).path }
						: { text },
				);
				toast.success(
					`已导入 ${result.message_count} 条消息（识别为 ${result.detected_format}）${
						result.sibling_count > 1
							? `，该文件共 ${result.sibling_count} 段会话，本次导入第一段`
							: ""
					}`,
				);
				await reloadMeta();
				await reloadSessions(filterRef.current);
			} catch (error) {
				toast.error(
					`导入失败：${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};
		input.click();
	};

	const handleExport = async (session: HarnessSessionRow) => {
		try {
			const result = await exportSession({
				session_id: session.id,
				format: "json",
			});
			toast.success(
				`已导出 ${result.message_count} 条消息 → ${result.file_name}`,
			);
		} catch (error) {
			toast.error(
				`导出失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const handleResume = async (session: HarnessSessionRow) => {
		try {
			const result = await launchNativeResume({ session_id: session.id });
			toast.success(`已在终端续接：${result.command}`);
		} catch (error) {
			toast.error(
				`续接失败：${error instanceof Error ? error.message : String(error)}`,
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
			setSelected((prev) => (prev?.id === session.id ? null : prev));
			await reloadMeta();
			await reloadSessions(filterRef.current);
		} catch (error) {
			toast.error(
				`删除失败：${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	const handleDropSession = useCallback(
		(sessionId: string, target: HubEntry) => {
			const session =
				draggingRef.current?.id === sessionId
					? draggingRef.current
					: sessions.find((s) => s.id === sessionId);
			draggingRef.current = null;
			if (!session) return;
			setHandoff({ session, target });
		},
		[sessions],
	);

	// ---------------------------------------------------------
	// 渲染
	// ---------------------------------------------------------

	return (
		<div className="relative flex flex-col h-full min-h-0 bg-transparent">
			{/* Header */}
			<div className="px-5 pt-5 pb-3 shrink-0">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-[9.5px] font-semibold tracking-[0.22em] text-text-light uppercase">
							AI Harness Hub
						</div>
						<h2 className="font-serif text-[22px] leading-tight text-text-primary mt-1 tracking-tight">
							跨入口工作台
						</h2>
						<p className="text-[11px] text-text-muted mt-1.5">
							<span className="tabular-nums text-text-secondary">{total}</span>
							<span> 段会话</span>
							<span className="mx-1.5 text-text-light/50">·</span>
							<span>把会话拖到上方入口即可接力</span>
						</p>
					</div>

					<div className="flex items-center gap-0.5 shrink-0 -mr-1">
						<HeaderButton
							onClick={() => void handleImport()}
							title="导入会话文件（.aihub-session.json / ChatGPT 导出 / CLI 原生 jsonl）"
						>
							<Download className="w-3.5 h-3.5" />
						</HeaderButton>
						<HeaderButton
							onClick={() => void handleScan()}
							disabled={scanning}
							title="从本机 Claude Code / Codex 摄取最新会话"
						>
							{scanning ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<RefreshCw className="w-3.5 h-3.5" />
							)}
						</HeaderButton>
					</div>
				</div>
			</div>

			{/* 入口轨道（拖拽落点） */}
			<HarnessRail
				entries={entries}
				activeFilter={filter}
				dropTargetId={dropTargetId}
				runtimeStates={stateByHarness}
				onFilter={setFilter}
				onDropSession={handleDropSession}
				onDragOverEntry={setDropTargetId}
				onDragLeaveRail={() => setDropTargetId(null)}
			/>

			{/* 主体：时间线 + 右侧面板 */}
			<div className="flex-1 min-h-0 flex border-t border-border/60">
				{/* 时间线 */}
				<div className="w-[46%] min-w-[300px] flex flex-col min-h-0 border-r border-border/60">
					<div className="px-4 py-2.5 shrink-0">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light pointer-events-none" />
							<input
								type="text"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="全文检索所有入口的会话内容…"
								className="w-full pl-9 pr-8 py-1.5 text-[12px] bg-surface dark:bg-cream-900/40 border border-border rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition duration-200"
							/>
							{query && (
								<button
									type="button"
									onClick={() => setQuery("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-light hover:text-text-secondary transition duration-200"
									title="清空"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</div>
						{searchSessions && (
							<p className="text-[10px] text-text-light mt-1.5">
								命中 {searchSessions.length} 段会话
								{hits && hits.length > searchSessions.length && (
									<>（部分命中的会话不在当前筛选范围内）</>
								)}
							</p>
						)}
					</div>

					<div className="flex-1 overflow-y-auto scrollbar-hide">
						<HubTimeline
							sessions={visibleSessions}
							loading={loading}
							labelOf={labelOf}
							activeSessionId={selected?.id ?? null}
							resumableIds={resumableIds}
							onSelect={(session) => {
								setSelected(session);
								setPanel("detail");
							}}
							onResume={(session) => void handleResume(session)}
							onExport={(session) => void handleExport(session)}
							onDelete={(session) => void handleDelete(session)}
							onDragStart={(session) => {
								draggingRef.current = session;
							}}
							onDragEnd={() => {
								draggingRef.current = null;
								setDropTargetId(null);
							}}
						/>
					</div>
				</div>

				{/* 右侧工作面板 */}
				<div className="flex-1 min-w-0 flex flex-col min-h-0">
					<div className="flex items-center gap-0.5 px-4 py-2 shrink-0 border-b border-border/60">
						<PanelTab
							active={panel === "detail"}
							onClick={() => setPanel("detail")}
						>
							会话
						</PanelTab>
						<PanelTab
							active={panel === "council"}
							onClick={() => setPanel("council")}
						>
							议会
						</PanelTab>
						<PanelTab
							active={panel === "board"}
							onClick={() => setPanel("board")}
						>
							共享白板
						</PanelTab>
						<PanelTab
							active={panel === "runtime"}
							onClick={() => setPanel("runtime")}
						>
							运行
							{/* 有执行体在跑时给个活体标记，不用切过去也知道有事在发生 */}
							{runningCount > 0 && (
								<span className="ml-1 text-[9.5px] text-success">
									{runningCount}
								</span>
							)}
						</PanelTab>
						<PanelTab
							active={panel === "automation"}
							onClick={() => setPanel("automation")}
						>
							自动化
						</PanelTab>
						{activeCwd && panel !== "detail" && (
							<span
								className="ml-auto text-[10px] text-text-light truncate max-w-[45%]"
								title={activeCwd}
							>
								作用域 {activeCwd}
							</span>
						)}
					</div>

					<div className="flex-1 min-h-0">
						{panel === "detail" && (
							<SessionDetail
								session={selected}
								labelOf={labelOf}
								entries={entries}
								onHandoff={(target) => {
									if (selected) setHandoff({ session: selected, target });
								}}
							/>
						)}
						{panel === "council" && (
							<CouncilPanel entries={entries} cwd={activeCwd} />
						)}
						{panel === "board" && <BoardPanel cwd={activeCwd} />}
						{panel === "runtime" && <RuntimePanel />}
						{panel === "automation" && (
							<AutomationPanel
								harnesses={entries.map((entry) => ({
									id: entry.id,
									label: entry.label,
									kind: entry.kind,
								}))}
								defaultCwd={activeCwd}
							/>
						)}
					</div>
				</div>
			</div>

			{/* 接力抽屉 */}
			{handoff && (
				<HandoffDrawer
					session={handoff.session}
					target={handoff.target}
					onClose={() => setHandoff(null)}
					onDone={() => {
						setHandoff(null);
						void reloadSessions(filterRef.current);
					}}
				/>
			)}
		</div>
	);
}

function HeaderButton({
	children,
	onClick,
	disabled,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className="p-1.5 rounded-lg text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}

function PanelTab({
	children,
	active,
	onClick,
}: {
	children: React.ReactNode;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"px-2.5 py-1 rounded-md text-[11.5px] font-medium transition duration-200",
				active
					? "bg-terracotta/[0.12] text-terracotta"
					: "text-text-muted hover:text-text-secondary hover:bg-warm-200/60 dark:hover:bg-cream-800/40",
			)}
		>
			{children}
		</button>
	);
}
