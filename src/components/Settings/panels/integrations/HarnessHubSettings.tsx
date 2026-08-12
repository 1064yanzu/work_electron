/**
 * HarnessHubSettings — 集成与扩展 · AI 入口互通
 *
 * 把本机的 AI CLI 与内嵌 Web AI 站点收敛到一处管理：
 *   1. 探测本机已安装的 AI 入口，展示读取会话 / 被注入的能力
 *   2. 触发历史会话的增量摄取（进度走 harness-ingest-progress 事件）
 *   3. 维护内嵌 Web 站点清单与输入框选择器（站点改版时用户可自行修正）
 *   4. 说明交接包蒸馏所用的模型与分段策略
 *
 * 前端 API 见 `src/lib/api/harnessHub.ts`，后端契约见 `docs/api/harness-hub.md`。
 */
import {
	AlertCircle,
	ChevronDown,
	ChevronUp,
	Download,
	Info,
	Plus,
	RefreshCw,
	Sparkles,
	Trash2,
	Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIpcListen } from "../../../../hooks/useIpcListen";
import {
	detectHarnesses,
	listAiHubSites,
	saveAiHubSites,
	scanHarnessSessions,
	type AiHubSiteRow,
	type HarnessDetectionRow,
} from "../../../../lib/api/harnessHub";
import { cn } from "../../../../lib/utils";
import { EVENTS, events } from "../../../../lib/events";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import { HarnessUsageSection } from "./HarnessUsageSection";
import { HarnessInteropSection } from "./HarnessInteropSection";
import { HarnessAutomationSection } from "./HarnessAutomationSection";
import { settingsAnchorProps } from "../../fieldRegistry";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsHint,
	SettingsPageContainer,
	SettingsRow,
	SettingsSwitch,
	SettingsTextArea,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";

// =====================================================================
// 类型与常量
// =====================================================================

/** harness-ingest-progress 事件负载（主进程 harnessHub handler 推送） */
interface IngestProgressPayload {
	phase: "scanning" | "parsing" | "done";
	/** phase 为 "done" 时后端发 null（此时已不属于任何单一 harness） */
	harness: string | null;
	processed: number;
	total: number;
	updated: number;
	skipped_lines: number;
}

/** harness_ingest_scan 的返回结果 */
interface ScanResult {
	updated: number;
	scanned: number;
	skipped_lines: number;
}

const PHASE_LABEL: Record<IngestProgressPayload["phase"], string> = {
	scanning: "正在扫描会话文件",
	parsing: "正在解析会话内容",
	done: "摄取完成",
};

/** 新建自定义站点的通用选择器兜底 —— 命中失败会自动降级到剪贴板 */
const DEFAULT_INPUT_SELECTORS = ["div[contenteditable='true']", "textarea"];
const DEFAULT_SUBMIT_SELECTORS = [
	"button[type='submit']",
	"button[aria-label*='Send']",
];
const DEFAULT_MESSAGE_SELECTORS = ["div[class*='message']"];

// =====================================================================
// 纯函数工具
// =====================================================================

function errMsg(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** 「换行或逗号分隔」的文本 → 选择器候选数组 */
function parseSelectors(text: string): string[] {
	return text
		.split(/[\n,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

/** 站点名 → 唯一 id（slug + 时间戳，避免与内置站点撞车） */
function makeSiteId(label: string): string {
	const slug = label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 24);
	return `${slug || "site"}-${Date.now().toString(36)}`;
}

/** 补全用户省略的协议头 */
function normalizeUrl(raw: string): string {
	const url = raw.trim();
	if (!url) return "";
	return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function isValidHttpUrl(raw: string): boolean {
	try {
		const parsed = new URL(raw);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

// =====================================================================
// 子组件
// =====================================================================

/** 一条路径信息（可执行 / 会话目录），缺失时显示「未检测到」 */
function PathLine({ label, value }: { label: string; value: string | null }) {
	return (
		<div className="flex items-baseline gap-2 text-[11.5px] leading-relaxed">
			<span className="w-[56px] shrink-0 text-text-light">{label}</span>
			<span
				className={cn(
					"min-w-0 flex-1 truncate font-mono",
					value ? "text-text-muted" : "text-text-light",
				)}
				title={value ?? undefined}
			>
				{value ?? "未检测到"}
			</span>
		</div>
	);
}

/** 单个 AI 入口的探测结果行 */
function HarnessDetectionItem({ row }: { row: HarnessDetectionRow }) {
	return (
		<div className="border-b border-border py-3.5 last:border-0">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div className="text-[13.5px] font-medium leading-snug text-text-primary">
						{row.label}
					</div>
					<div className="mt-1 text-[12px] leading-relaxed text-text-secondary">
						{row.installed
							? `已摄取 ${row.session_count} 个会话`
							: "未在 PATH 与常见安装目录中找到"}
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
					<SettingsBadge
						size="xs"
						tone={row.installed ? "success" : "neutral"}
						dot
					>
						{row.installed ? "已安装" : "未安装"}
					</SettingsBadge>
					<SettingsBadge size="xs" tone={row.can_read ? "info" : "neutral"}>
						{row.can_read ? "可读会话" : "不可读"}
					</SettingsBadge>
					<SettingsBadge
						size="xs"
						tone={row.can_inject ? "primary" : "neutral"}
					>
						{row.can_inject ? "可注入" : "不可注入"}
					</SettingsBadge>
				</div>
			</div>
			<div className="mt-2 space-y-1">
				<PathLine label="可执行" value={row.bin_path} />
				<PathLine label="会话目录" value={row.session_dir} />
			</div>
		</div>
	);
}

// =====================================================================
// 主面板
// =====================================================================

export function HarnessHubSettings() {
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	// ---------- 1. 探测 ----------
	const [detections, setDetections] = useState<HarnessDetectionRow[]>([]);
	const [detecting, setDetecting] = useState(true);
	const [detectError, setDetectError] = useState<string | null>(null);

	const runDetect = useCallback(async (silent = false) => {
		if (!silent) setDetecting(true);
		try {
			const rows = await detectHarnesses();
			if (!mounted.current) return;
			setDetections(rows);
			setDetectError(null);
		} catch (error) {
			if (!mounted.current) return;
			setDetectError(errMsg(error));
			if (!silent) toast.error(`探测 AI 入口失败：${errMsg(error)}`);
		} finally {
			if (mounted.current && !silent) setDetecting(false);
		}
	}, []);

	useEffect(() => {
		void runDetect();
	}, [runDetect]);

	// ---------- 2. 会话摄取 ----------
	const [scanning, setScanning] = useState(false);
	const [progress, setProgress] = useState<IngestProgressPayload | null>(null);
	const [lastScan, setLastScan] = useState<ScanResult | null>(null);

	useIpcListen<IngestProgressPayload>("harness-ingest-progress", (payload) => {
		setProgress(payload);
	});

	const handleScan = useCallback(async () => {
		setScanning(true);
		setProgress(null);
		try {
			const result = await scanHarnessSessions({ include_ipo_sdk: true });
			if (!mounted.current) return;
			setLastScan(result);
			toast.success(
				`新增/更新 ${result.updated} 个会话，扫描 ${result.scanned} 个文件`,
			);
			if (result.skipped_lines > 0) {
				toast.warning(`其中 ${result.skipped_lines} 行解析失败，已跳过`);
			}
			// 会话数变化了，顺带静默刷新一次探测结果
			void runDetect(true);
		} catch (error) {
			if (!mounted.current) return;
			toast.error(`扫描失败：${errMsg(error)}`);
		} finally {
			if (mounted.current) {
				setScanning(false);
				setProgress(null);
			}
		}
	}, [runDetect]);

	const showProgress =
		scanning || (progress !== null && progress.phase !== "done");
	const percent =
		progress && progress.total > 0
			? Math.min(100, Math.round((progress.processed / progress.total) * 100))
			: 0;

	// ---------- 3. Web AI 站点 ----------
	const [sites, setSites] = useState<AiHubSiteRow[]>([]);
	const [sitesLoading, setSitesLoading] = useState(true);
	const [sitesError, setSitesError] = useState<string | null>(null);
	const [busySiteId, setBusySiteId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [selectorDraft, setSelectorDraft] = useState("");
	const [showAddForm, setShowAddForm] = useState(false);
	const [draftLabel, setDraftLabel] = useState("");
	const [draftUrl, setDraftUrl] = useState("");
	const [adding, setAdding] = useState(false);

	const loadSites = useCallback(async () => {
		setSitesLoading(true);
		try {
			const rows = await listAiHubSites();
			if (!mounted.current) return;
			setSites(rows);
			setSitesError(null);
		} catch (error) {
			if (!mounted.current) return;
			setSitesError(errMsg(error));
		} finally {
			if (mounted.current) setSitesLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadSites();
	}, [loadSites]);

	/** 乐观更新 + 全量保存；失败回滚并提示 */
	const persistSites = useCallback(
		async (next: AiHubSiteRow[], successMessage?: string): Promise<boolean> => {
			const previous = sites;
			setSites(next);
			try {
				const saved = await saveAiHubSites(next);
				if (mounted.current) setSites(saved);
				// 通知中栏标签条刷新站点清单（新启用的站点要能在「+」菜单里出现，
				// 被禁用/删除的站点标签要被剔除，否则会留下点不开的死标签）
				events.emit(EVENTS.AIHUB_SITES_CHANGED, undefined);
				if (successMessage) toast.success(successMessage);
				return true;
			} catch (error) {
				if (mounted.current) setSites(previous);
				toast.error(`保存站点失败：${errMsg(error)}`);
				return false;
			}
		},
		[sites],
	);

	const handleToggleSite = useCallback(
		async (site: AiHubSiteRow, enabled: boolean) => {
			setBusySiteId(site.id);
			await persistSites(
				sites.map((s) => (s.id === site.id ? { ...s, enabled } : s)),
			);
			if (mounted.current) setBusySiteId(null);
		},
		[persistSites, sites],
	);

	const handleDeleteSite = useCallback(
		async (site: AiHubSiteRow) => {
			const confirmed = await confirmDialog.danger(
				`删除自定义站点「${site.label}」？删除后需要重新添加才能继续使用。`,
				"删除站点",
			);
			if (!confirmed) return;
			setBusySiteId(site.id);
			const ok = await persistSites(
				sites.filter((s) => s.id !== site.id),
				`已删除「${site.label}」`,
			);
			if (mounted.current) {
				setBusySiteId(null);
				if (ok && expandedId === site.id) setExpandedId(null);
			}
		},
		[expandedId, persistSites, sites],
	);

	const toggleExpand = useCallback(
		(site: AiHubSiteRow) => {
			if (expandedId === site.id) {
				setExpandedId(null);
				return;
			}
			setExpandedId(site.id);
			setSelectorDraft(site.input_selectors.join("\n"));
		},
		[expandedId],
	);

	const handleSaveSelectors = useCallback(
		async (site: AiHubSiteRow) => {
			const parsed = parseSelectors(selectorDraft);
			if (parsed.length === 0) {
				toast.error("至少需要保留一个输入框选择器");
				return;
			}
			setBusySiteId(site.id);
			const ok = await persistSites(
				sites.map((s) =>
					s.id === site.id ? { ...s, input_selectors: parsed } : s,
				),
				`已更新「${site.label}」的输入框选择器`,
			);
			if (mounted.current) {
				setBusySiteId(null);
				if (ok) setExpandedId(null);
			}
		},
		[persistSites, selectorDraft, sites],
	);

	const resetAddForm = useCallback(() => {
		setShowAddForm(false);
		setDraftLabel("");
		setDraftUrl("");
	}, []);

	const handleAddSite = useCallback(async () => {
		const label = draftLabel.trim();
		if (!label) {
			toast.error("请填写站点名称");
			return;
		}
		const url = normalizeUrl(draftUrl);
		if (!isValidHttpUrl(url)) {
			toast.error("请填写合法的站点地址（http / https）");
			return;
		}
		const id = makeSiteId(label);
		const site: AiHubSiteRow = {
			id,
			harness: `web-${id}`,
			label,
			url,
			input_selectors: [...DEFAULT_INPUT_SELECTORS],
			submit_selectors: [...DEFAULT_SUBMIT_SELECTORS],
			message_selectors: [...DEFAULT_MESSAGE_SELECTORS],
			builtin: false,
			enabled: true,
		};
		setAdding(true);
		const ok = await persistSites([...sites, site], `已添加「${label}」`);
		if (mounted.current) {
			setAdding(false);
			if (ok) resetAddForm();
		}
	}, [draftLabel, draftUrl, persistSites, resetAddForm, sites]);

	// =====================================================================
	// 渲染
	// =====================================================================

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Waypoints}
				title="AI 入口互通"
				description="统一管理本机的 AI 命令行入口与内嵌 Web AI 站点：摄取历史会话、蒸馏交接包，在不同 AI 之间无缝接着聊。"
			/>
			{/* ---------- 0. 用量总览 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.usage")}>
				<HarnessUsageSection />
			</div>
			{/* ---------- 1. 已检测到的 AI 入口 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.detection")}>
				<SettingsCardSection
					title="已检测到的 AI 入口"
					description="本机安装的 AI 命令行工具，以及它们能否被读取会话、被注入交接包。"
					headerAction={
						<SettingsButton
							icon={RefreshCw}
							loading={detecting}
							onClick={() => void runDetect()}
						>
							重新探测
						</SettingsButton>
					}
				>
					{detecting && detections.length === 0 ? (
						<div className="py-6 text-center text-[12px] text-text-muted">
							正在探测本机 AI 入口…
						</div>
					) : detectError ? (
						<SettingsHint tone="error" icon={AlertCircle} title="探测失败">
							{detectError}
						</SettingsHint>
					) : detections.length === 0 ? (
						<SettingsHint tone="info" icon={Info} title="未检测到任何 AI 入口">
							安装 Claude Code、Codex 等命令行工具后点击「重新探测」即可。
						</SettingsHint>
					) : (
						<div className="space-y-0">
							{detections.map((row) => (
								<HarnessDetectionItem key={row.harness} row={row} />
							))}
						</div>
					)}
				</SettingsCardSection>
			</div>
			{/* ---------- 2. 会话摄取 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.ingest")}>
				<SettingsCardSection
					title="会话摄取"
					description="把各 AI 入口的历史会话读进本地库，供全文检索与交接包蒸馏使用。"
					headerAction={
						<SettingsButton
							variant="primary"
							icon={Download}
							loading={scanning}
							onClick={() => void handleScan()}
						>
							立即扫描
						</SettingsButton>
					}
				>
					<div className="space-y-3">
						{showProgress && (
							<div className="rounded-2xl border border-border bg-cream-50 px-3.5 py-3">
								<div className="flex items-baseline justify-between gap-3">
									<span className="min-w-0 truncate text-[12px] font-medium text-text-primary">
										{PHASE_LABEL[progress?.phase ?? "scanning"]}
										{progress?.harness ? ` · ${progress.harness}` : ""}
									</span>
									<span className="shrink-0 font-mono text-[11.5px] tabular-nums text-text-muted">
										{progress ? `${progress.processed}/${progress.total}` : "…"}
									</span>
								</div>
								<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-cream-300">
									<div
										className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
										style={{ width: `${percent}%` }}
									/>
								</div>
							</div>
						)}

						{lastScan && !showProgress && (
							<SettingsRow
								label="上次扫描结果"
								description={`新增/更新 ${lastScan.updated} 个会话 · 扫描 ${lastScan.scanned} 个文件`}
								action={
									lastScan.skipped_lines > 0 ? (
										<SettingsBadge tone="warning">
											{lastScan.skipped_lines} 行已跳过
										</SettingsBadge>
									) : (
										<SettingsBadge tone="success">全部解析成功</SettingsBadge>
									)
								}
							/>
						)}

						<SettingsHint icon={Info} title="增量摄取是怎么工作的">
							各 AI 入口的会话文件都是 JSONL
							追加写，摄取时按上次读到的字节偏移只读新增部分，
							不会重复解析历史内容。应用启动后会常驻文件监听，会话有更新时自动增量同步；
							这里的「立即扫描」用于首次导入、手动补齐，或刚装好新的 AI CLI 时。
						</SettingsHint>
					</div>
				</SettingsCardSection>
			</div>
			{/* ---------- 3. Web AI 站点 ---------- */}
			<div {...settingsAnchorProps("integrations.harnessHub.sites")}>
				<SettingsCardSection
					title="Web AI 站点"
					description="可内嵌浏览的 Web AI 入口。启用后会出现在中间栏标签条的「+」菜单里，可各开一个标签页；禁用后不再出现在 AI 入口列表中；内置站点只能禁用，不能删除。"
				>
					{sitesLoading ? (
						<div className="py-6 text-center text-[12px] text-text-muted">
							正在加载站点清单…
						</div>
					) : sitesError ? (
						<SettingsHint tone="error" icon={AlertCircle} title="加载站点失败">
							<span className="block">{sitesError}</span>
							<SettingsButton
								size="sm"
								variant="secondary"
								icon={RefreshCw}
								className="mt-2"
								onClick={() => void loadSites()}
							>
								重试
							</SettingsButton>
						</SettingsHint>
					) : (
						<>
							{sites.length === 0 ? (
								<SettingsHint tone="info" icon={Info} title="还没有任何站点">
									用下方的「添加自定义站点」把常用的 Web AI 加进来。
								</SettingsHint>
							) : (
								<div className="space-y-0">
									{sites.map((site) => {
										const expanded = expandedId === site.id;
										const busy = busySiteId === site.id;
										return (
											<div
												key={site.id}
												className="border-b border-border last:border-0"
											>
												<SettingsRow
													className="border-b-0"
													label={site.label}
													description={site.url}
													action={
														<div className="flex items-center gap-1.5">
															<SettingsBadge
																size="xs"
																tone={site.builtin ? "neutral" : "info"}
															>
																{site.builtin ? "内置" : "自定义"}
															</SettingsBadge>
															<SettingsButton
																size="sm"
																variant="ghost"
																icon={expanded ? ChevronUp : ChevronDown}
																onClick={() => toggleExpand(site)}
															>
																高级
															</SettingsButton>
															{!site.builtin && (
																<SettingsButton
																	size="sm"
																	variant="danger"
																	icon={Trash2}
																	disabled={busy}
																	aria-label={`删除 ${site.label}`}
																	onClick={() => void handleDeleteSite(site)}
																/>
															)}
															<SettingsSwitch
																checked={site.enabled}
																disabled={busy}
																onChange={(next) =>
																	void handleToggleSite(site, next)
																}
															/>
														</div>
													}
												/>
												{expanded && (
													<div className="pb-4">
														<div className="rounded-2xl border border-border bg-cream-50 px-3.5 py-3">
															<div className="text-[12px] font-medium text-text-primary">
																输入框选择器
															</div>
															<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
																每行一个（也支持逗号分隔），按顺序尝试；全部命中失败时会自动降级为复制到剪贴板。
																站点改版导致注入失效时，在这里换成新的 CSS
																选择器即可，不必等应用更新。
															</p>
															<SettingsTextArea
																className="mt-2"
																mono
																minHeight={76}
																value={selectorDraft}
																onChange={setSelectorDraft}
																placeholder="div[contenteditable='true']"
																aria-label={`${site.label} 的输入框选择器`}
															/>
															<div className="mt-2.5 flex items-center justify-end gap-2">
																<SettingsButton
																	size="sm"
																	variant="ghost"
																	onClick={() => setExpandedId(null)}
																>
																	取消
																</SettingsButton>
																<SettingsButton
																	size="sm"
																	variant="primary"
																	loading={busy}
																	onClick={() => void handleSaveSelectors(site)}
																>
																	保存选择器
																</SettingsButton>
															</div>
														</div>
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}

							<div className="mt-4 border-t border-border pt-4">
								{showAddForm ? (
									<div className="rounded-2xl border border-border bg-cream-50 px-3.5 py-3">
										<div className="text-[12px] font-medium text-text-primary">
											添加自定义站点
										</div>
										<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
											新站点会先用通用选择器兜底；若注入或提取失败，展开「高级」按该站点实际的
											DOM 结构修正选择器。
										</p>
										<div className="mt-2.5 space-y-2">
											<SettingsTextInput
												size="sm"
												value={draftLabel}
												onChange={setDraftLabel}
												placeholder="站点名称，例如 Mistral"
												aria-label="站点名称"
											/>
											<SettingsTextInput
												size="sm"
												mono
												value={draftUrl}
												onChange={setDraftUrl}
												placeholder="https://chat.mistral.ai/"
												aria-label="站点地址"
											/>
										</div>
										<div className="mt-2.5 flex items-center justify-end gap-2">
											<SettingsButton
												size="sm"
												variant="ghost"
												onClick={resetAddForm}
											>
												取消
											</SettingsButton>
											<SettingsButton
												size="sm"
												variant="primary"
												icon={Plus}
												loading={adding}
												onClick={() => void handleAddSite()}
											>
												确认添加
											</SettingsButton>
										</div>
									</div>
								) : (
									<SettingsButton
										icon={Plus}
										onClick={() => setShowAddForm(true)}
									>
										添加自定义站点
									</SettingsButton>
								)}
							</div>
						</>
					)}
				</SettingsCardSection>
			</div>
			{/* ---------- 4. 交接包蒸馏 ---------- */}{" "}
			<div {...settingsAnchorProps("integrations.harnessHub.handoff")}>
				<SettingsCardSection
					title="交接包蒸馏"
					description="把一段会话压缩成结构化的 HANDOFF 交接包，再注入到另一个 AI 入口接着聊。"
				>
					<div className="space-y-3">
						<SettingsHint icon={Sparkles} title="使用当前活跃模型">
							蒸馏走统一的 LLM 调用层，默认使用你在「AI 与模型 ·
							服务商与模型」里设为活跃的那个模型，
							无需在此单独配置。想换模型请到那里切换活跃模型。
						</SettingsHint>
						<SettingsHint icon={Info} title="超长转录自动分段">
							转录超出单次上下文预算时会自动走
							map-reduce：先把转录切成若干段分别摘要，
							再把段摘要合成最终交接包。个别分段失败会被跳过，不影响整体产出。
						</SettingsHint>
					</div>
				</SettingsCardSection>
			</div>
			{/* ---------- 5. 协作层：接力策略 / 互为工具 / 反向 MCP / 路由 / 额度 ---------- */}
			<HarnessInteropSection />
			{/* ---------- 6. 自动化：定时触发 / 并发与防休眠 / 失败处理 ---------- */}
			<HarnessAutomationSection />
		</SettingsPageContainer>
	);
}
