/**
 * Agent 长期记忆 · 上下文全景面板
 *
 * 把 6 个会影响 Agent 行为的 markdown 文件统一抽象成 Tab：
 *   - SOUL / USER / MEMORY        ：本应用维护的三件套（<userData>/agent-memory/）
 *   - ~/.claude/CLAUDE.md         ：SDK 自动加载的全局用户级
 *   - <线程 cwd>/CLAUDE.md        ：SDK 自动加载的项目级
 *   - <线程 cwd>/AGENTS.md        ：SDK 自动加载的项目级子 Agent 定义
 *
 * 写入 ~/.claude/CLAUDE.md 需要二次确认，避免误改全局配置。
 * 项目级 Tab 在没有选中线程时给出明确空态而非崩。
 */
import {
	AlertTriangle,
	Database,
	FolderOpen,
	Loader2,
	RefreshCw,
	RotateCcw,
	Save,
	Trash2,
} from "lucide-react";
import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useSyncExternalStore } from "react";
import { toast } from "../../ui/Toast";
import { confirmDialog } from "../../ui/ConfirmDialog";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsCardSection,
	SettingsPageContainer,
} from "../ui/SettingsPrimitives";
import { cn } from "../../../lib/utils";
import { workspaceStore } from "../../../lib/workspaceStore";
import {
	type MemoryFileInfo,
	type MemoryFileToken,
	type MemoryStats,
	memoryStore,
} from "../../../lib/agent/memoryStore";
import { MEMORY_FILE_ORDER, MEMORY_FILE_STYLES } from "./memory/categoryConfig";
import { MemoryStatsGrid } from "./memory/MemoryStatsGrid";

const MonacoEditor = lazy(() =>
	import("../../sandbox/workspace/MonacoEditor").then((m) => ({
		default: m.MonacoEditor,
	})),
);

type ContextFileWithSnapshot = MemoryFileInfo & {
	injectedInActiveSnapshot: boolean;
};

function formatRelativeTime(ts: number): string {
	if (!ts) return "未修改";
	const diff = Date.now() - ts;
	if (diff < 60_000) return "刚刚";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
	const date = new Date(ts);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MemorySettings() {
	// 当前线程 cwd —— 项目级 Tab 跟随它刷新
	const currentThreadPath = useSyncExternalStore(
		workspaceStore.subscribe,
		() => workspaceStore.getState().currentThreadPath,
		() => workspaceStore.getState().currentThreadPath,
	);

	const [activeTab, setActiveTab] = useState<MemoryFileToken>("soul");
	const [files, setFiles] = useState<
		Map<MemoryFileToken, ContextFileWithSnapshot>
	>(new Map());
	const [stats, setStats] = useState<MemoryStats | null>(null);
	const [loading, setLoading] = useState(false);
	const [draft, setDraft] = useState<string>("");
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const [showGlobalConfirm, setShowGlobalConfirm] = useState(false);
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const tickRef = useRef(0);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const [list, s] = await Promise.all([
				memoryStore.listContextFiles(currentThreadPath ?? null),
				memoryStore.getStats(true),
			]);
			const map = new Map<MemoryFileToken, ContextFileWithSnapshot>();
			for (const item of list) {
				map.set(item.token as MemoryFileToken, item);
			}
			setFiles(map);
			setStats(s);
			tickRef.current += 1;
		} catch (err) {
			console.error("[MemorySettings] refresh failed", err);
			toast.error("加载记忆文件失败");
		} finally {
			setLoading(false);
		}
	}, [currentThreadPath]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// 同步当前线程 cwd 给后端 watcher，让项目级 markdown 变更被推送
	useEffect(() => {
		void memoryStore.setActiveCwd(currentThreadPath ?? null);
	}, [currentThreadPath]);

	// 订阅 memoryStore 派发（chokidar 推送 / 工具写入），自动 refresh
	useEffect(() => {
		const unsub = memoryStore.subscribe(() => {
			void refresh();
		});
		return unsub;
	}, [refresh]);

	// 切换 tab 时同步 draft，dirty 时弹确认
	const switchTab = useCallback(
		async (token: MemoryFileToken) => {
			if (dirty) {
				const confirmed = await confirmDialog.show({
					title: "未保存的更改",
					message: "当前编辑有未保存的更改，确认放弃并切换 Tab 吗？",
					type: "warning",
					confirmText: "放弃更改",
					cancelText: "取消",
				});
				if (!confirmed) return;
			}
			setActiveTab(token);
			setDirty(false);
			const f = files.get(token);
			setDraft(f?.content ?? "");
		},
		[dirty, files],
	);

	// 文件加载完成后初始化 draft（仅当 dirty=false 才覆盖，避免抹去用户编辑）
	useEffect(() => {
		if (dirty) return;
		const f = files.get(activeTab);
		setDraft(f?.content ?? "");
	}, [activeTab, files, dirty]);

	const activeFile = files.get(activeTab) ?? null;
	const activeStyle = MEMORY_FILE_STYLES[activeTab];

	const handleEditorChange = useCallback((value: string | undefined) => {
		setDraft(value ?? "");
		setDirty(true);
	}, []);

	const handleReset = useCallback(() => {
		const f = files.get(activeTab);
		setDraft(f?.content ?? "");
		setDirty(false);
	}, [activeTab, files]);

	const performSave = useCallback(
		async (confirmed: boolean) => {
			if (!activeFile) return;
			setSaving(true);
			try {
				const res = await memoryStore.writeFile(activeTab, draft, {
					cwd: currentThreadPath ?? null,
					confirmed,
				});
				if (!res.ok) {
					if (res.error === "REQUIRES_CONFIRMATION") {
						setShowGlobalConfirm(true);
						return;
					}
					if (res.error?.startsWith("OVER_QUOTA")) {
						toast.error(`超出字符上限：${res.error}`);
						return;
					}
					toast.error(`保存失败：${res.error ?? "未知错误"}`);
					return;
				}
				toast.success(`${activeStyle.label} 已保存`);
				setDirty(false);
				await refresh();
			} catch (err) {
				toast.error(
					`保存失败：${err instanceof Error ? err.message : String(err)}`,
				);
			} finally {
				setSaving(false);
			}
		},
		[
			activeFile,
			activeStyle.label,
			activeTab,
			currentThreadPath,
			draft,
			refresh,
		],
	);

	const handleSave = useCallback(() => {
		if (activeTab === "global_claude_md") {
			setShowGlobalConfirm(true);
			return;
		}
		void performSave(false);
	}, [activeTab, performSave]);

	const handleConfirmGlobalSave = useCallback(async () => {
		setShowGlobalConfirm(false);
		await performSave(true);
	}, [performSave]);

	const handleClearAll = useCallback(async () => {
		setShowClearConfirm(false);
		try {
			const res = await memoryStore.clearAll();
			toast.success(`已清空 USER + MEMORY（共 ${res.deleted} 字符）`);
			await refresh();
		} catch (err) {
			toast.error(
				`清空失败：${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}, [refresh]);

	const handleReveal = useCallback(async () => {
		if (!activeFile?.path) return;
		await memoryStore.revealInFolder(activeFile.path);
	}, [activeFile?.path]);

	const projectTabUnavailable =
		(activeTab === "project_claude_md" || activeTab === "project_agents_md") &&
		!currentThreadPath;

	return (
		<SettingsPageContainer width="wide">
			<div id="ai.memory.overview" data-settings-anchor="ai.memory.overview">
				<SettingsPanelHeader
					icon={Database}
					title="Agent 记忆"
					description="管理影响 Agent 行为的 markdown 文件 —— SOUL/USER/MEMORY 由本应用维护、CLAUDE.md/AGENTS.md 由 SDK 自动加载。每个 run 启动时一次性冻结快照，会话中改动在下一个 run 生效。"
					actions={
						<div className="flex items-center gap-2">
							<SettingsButton
								variant="secondary"
								icon={RefreshCw}
								onClick={() => void refresh()}
							>
								刷新
							</SettingsButton>
							<SettingsButton
								variant="danger"
								icon={Trash2}
								onClick={() => setShowClearConfirm(true)}
							>
								清空 USER + MEMORY
							</SettingsButton>
						</div>
					}
				/>
			</div>

			{showClearConfirm && (
				<ClearConfirmDialog
					stats={stats}
					onConfirm={handleClearAll}
					onCancel={() => setShowClearConfirm(false)}
				/>
			)}

			{stats && <MemoryStatsGrid stats={stats} />}

			<SettingsCardSection>
				<TabBar activeTab={activeTab} files={files} onSwitch={switchTab} />

				{projectTabUnavailable ? (
					<ProjectUnavailableState />
				) : !activeFile ? (
					<div className="flex items-center justify-center py-16 text-text-light">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						<span className="text-sm">加载中…</span>
					</div>
				) : (
					<div className="border-t border-border">
						{activeTab === "global_claude_md" && <GlobalWarningBar />}
						<FileStatusBar
							file={activeFile}
							onReveal={handleReveal}
							loading={loading}
						/>
						<div className="px-4 pt-3 pb-4">
							{!activeFile.exists && activeFile.managedBy === "sdk" ? (
								<EmptyProjectFileState
									file={activeFile}
									onCreate={() => {
										setDraft("");
										setDirty(true);
									}}
								/>
							) : null}
							<div
								key={`${activeTab}-${tickRef.current}`}
								className="h-[480px] rounded-xl border border-border overflow-hidden bg-surface"
							>
								<Suspense
									fallback={
										<div className="flex h-full items-center justify-center text-text-light">
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											<span className="text-xs">加载编辑器…</span>
										</div>
									}
								>
									<MonacoEditor
										value={draft}
										language="markdown"
										path={activeFile.path || activeTab}
										onChange={handleEditorChange}
										onSave={handleSave}
										wordWrap
										minimap={false}
									/>
								</Suspense>
							</div>
							<div className="mt-3 flex items-center justify-between gap-3">
								<div className="text-xs text-text-muted">
									{dirty ? (
										<span className="text-warning">● 有未保存的更改</span>
									) : (
										<span>已保存</span>
									)}
									{activeFile.limit ? (
										<span className="ml-2 tabular-nums">
											{draft.length} / {activeFile.limit}
										</span>
									) : (
										<span className="ml-2 tabular-nums">
											{draft.length} 字符（无限额）
										</span>
									)}
								</div>
								<div className="flex items-center gap-2">
									<SettingsButton
										variant="secondary"
										icon={RotateCcw}
										onClick={handleReset}
										disabled={!dirty || saving}
									>
										撤销
									</SettingsButton>
									<SettingsButton
										variant="primary"
										icon={saving ? Loader2 : Save}
										onClick={handleSave}
										disabled={!dirty || saving}
									>
										{saving ? "保存中…" : "保存"}
									</SettingsButton>
								</div>
							</div>
						</div>
					</div>
				)}
			</SettingsCardSection>

			{showGlobalConfirm && (
				<GlobalConfirmDialog
					onConfirm={handleConfirmGlobalSave}
					onCancel={() => setShowGlobalConfirm(false)}
				/>
			)}
		</SettingsPageContainer>
	);
}

// =====================================================
// 内部组件
// =====================================================

interface TabBarProps {
	activeTab: MemoryFileToken;
	files: Map<MemoryFileToken, ContextFileWithSnapshot>;
	onSwitch: (token: MemoryFileToken) => void;
}

function TabBar({ activeTab, files, onSwitch }: TabBarProps) {
	const grouped = useMemo(() => {
		const ipo: MemoryFileToken[] = [];
		const sdk: MemoryFileToken[] = [];
		for (const token of MEMORY_FILE_ORDER) {
			const file = files.get(token);
			if (!file) continue;
			if (file.managedBy === "ipo") ipo.push(token);
			else sdk.push(token);
		}
		return { ipo, sdk };
	}, [files]);

	return (
		<div className="flex flex-wrap items-center gap-1 px-3 py-2.5">
			{grouped.ipo.map((token) => (
				<TabButton
					key={token}
					token={token}
					file={files.get(token)!}
					active={activeTab === token}
					onClick={() => onSwitch(token)}
				/>
			))}
			<div className="mx-2 h-5 w-px bg-border" aria-hidden />
			{grouped.sdk.map((token) => (
				<TabButton
					key={token}
					token={token}
					file={files.get(token)!}
					active={activeTab === token}
					onClick={() => onSwitch(token)}
				/>
			))}
		</div>
	);
}

interface TabButtonProps {
	token: MemoryFileToken;
	file: ContextFileWithSnapshot;
	active: boolean;
	onClick: () => void;
}

function TabButton({ token, file, active, onClick }: TabButtonProps) {
	const style = MEMORY_FILE_STYLES[token];
	const Icon = style.icon;
	const fillPct =
		file.limit && file.limit > 0
			? Math.min(100, Math.round((file.charCount / file.limit) * 100))
			: file.exists
				? 100
				: 0;
	const isWarn = file.limit && file.charCount / (file.limit || 1) >= 0.85;
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
				active
					? cn("border bg-surface shadow-sm", style.accentBorder)
					: "border border-transparent hover:bg-surface",
			)}
		>
			<span
				className={cn(
					"inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
					style.accentBg,
				)}
			>
				<Icon
					className={cn("h-3.5 w-3.5", style.accentText)}
					strokeWidth={1.8}
				/>
			</span>
			<div className="min-w-0">
				<div
					className={cn(
						"text-xs font-semibold leading-tight",
						active ? "text-text-primary" : "text-text-secondary",
					)}
				>
					{style.label}
				</div>
				<div className="text-2xs tabular-nums leading-tight text-text-muted">
					{file.limit ? (
						<span className={cn(isWarn && "text-error")}>
							{file.charCount} / {file.limit}
						</span>
					) : file.exists ? (
						<span>{file.charCount} 字符</span>
					) : (
						<span className="text-text-muted">未创建</span>
					)}
				</div>
			</div>
			{file.injectedInActiveSnapshot && (
				<span
					className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-primary"
					aria-label="已注入活动会话"
				/>
			)}
			{file.limit ? (
				<span className="ml-1 h-1 w-8 overflow-hidden rounded-full bg-background">
					<span
						className={cn(
							"block h-full rounded-full",
							isWarn ? "bg-error" : "bg-primary",
						)}
						style={{ width: `${fillPct}%` }}
					/>
				</span>
			) : null}
		</button>
	);
}

function FileStatusBar({
	file,
	onReveal,
	loading,
}: {
	file: ContextFileWithSnapshot;
	onReveal: () => void | Promise<void>;
	loading: boolean;
}) {
	const style = MEMORY_FILE_STYLES[file.token as MemoryFileToken];
	return (
		<div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-surface/60 text-xs">
			<div className="flex items-center gap-1.5 text-text-muted">
				<span className={cn("font-medium", style.accentText)}>
					{style.subtitle}
				</span>
			</div>
			<div className="text-text-light">·</div>
			<button
				type="button"
				onClick={() => void onReveal()}
				disabled={!file.path}
				className="inline-flex items-center gap-1 font-mono text-text-secondary hover:text-primary transition-colors disabled:opacity-50"
				title="在 Finder/Explorer 中显示"
			>
				<FolderOpen className="h-3 w-3" strokeWidth={1.6} />
				<span className="truncate max-w-[420px]">
					{file.path || "(未确定路径)"}
				</span>
			</button>
			<div className="text-text-light">·</div>
			<span className="tabular-nums text-text-muted">
				修改：{formatRelativeTime(file.lastModified)}
			</span>
			{file.injectedInActiveSnapshot && (
				<>
					<div className="text-text-light">·</div>
					<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">
						<span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
						已注入活动会话
					</span>
				</>
			)}
			{loading && (
				<Loader2 className="ml-auto h-3 w-3 animate-spin text-text-muted" />
			)}
		</div>
	);
}

function GlobalWarningBar() {
	return (
		<div className="flex items-start gap-2 border-y border-[rgba(181,51,51,0.28)] bg-[rgba(181,51,51,0.06)] px-4 py-2.5">
			<AlertTriangle
				className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error"
				strokeWidth={1.8}
			/>
			<div className="text-xs leading-relaxed text-error">
				这是全局用户级 <span className="font-mono">~/.claude/CLAUDE.md</span>
				，会影响
				<span className="font-semibold"> 所有 Claude Code 实例</span>
				（含 IDE 插件、CLI、其它桌面应用）。保存时会要求二次确认。
			</div>
		</div>
	);
}

function EmptyProjectFileState({
	file,
	onCreate,
}: {
	file: ContextFileWithSnapshot;
	onCreate: () => void;
}) {
	return (
		<div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-3">
			<div className="text-xs leading-relaxed text-text-secondary">
				<span className="font-semibold">{file.displayName}</span>{" "}
				不存在。点击右侧按钮创建空文件，SDK 在下次 run 启动时会自动加载。
			</div>
			<SettingsButton variant="secondary" onClick={onCreate}>
				创建空文件
			</SettingsButton>
		</div>
	);
}

function ProjectUnavailableState() {
	return (
		<div className="border-t border-border px-6 py-12 text-center">
			<div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
				<FolderOpen className="h-5 w-5 text-text-light" strokeWidth={1.5} />
			</div>
			<p className="mt-3 text-sm font-medium text-text-secondary">
				尚未选中对话
			</p>
			<p className="mt-1 text-xs leading-relaxed text-text-muted">
				项目级 CLAUDE.md / AGENTS.md
				跟随当前对话的工作目录。请先在左栏选中一条对话。
			</p>
		</div>
	);
}

function GlobalConfirmDialog({
	onConfirm,
	onCancel,
}: {
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="flex items-start justify-between gap-3 rounded-2xl border border-[rgba(181,51,51,0.28)] bg-[rgba(181,51,51,0.06)] px-4 py-3 animate-in slide-in-from-top-2 duration-150">
			<div>
				<div className="flex items-center gap-2 text-sm font-semibold text-error">
					<AlertTriangle className="h-4 w-4" strokeWidth={1.8} />
					确认写入 ~/.claude/CLAUDE.md
				</div>
				<div className="mt-1 text-xs leading-relaxed text-text-muted">
					该文件是全局级别的 Claude Code 配置，会影响所有 Claude Code
					实例。请确认你确实希望修改全局配置。
				</div>
			</div>
			<div className="flex shrink-0 gap-2">
				<SettingsButton variant="secondary" onClick={onCancel}>
					取消
				</SettingsButton>
				<SettingsButton variant="danger-solid" onClick={onConfirm}>
					确认保存
				</SettingsButton>
			</div>
		</div>
	);
}

function ClearConfirmDialog({
	stats,
	onConfirm,
	onCancel,
}: {
	stats: MemoryStats | null;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const total = stats ? stats.user.chars + stats.memory.chars : 0;
	return (
		<div className="flex items-center justify-between gap-3 rounded-2xl border border-[rgba(181,51,51,0.28)] bg-[rgba(181,51,51,0.06)] px-4 py-3 animate-in slide-in-from-top-2 duration-150">
			<div>
				<div className="text-sm font-medium text-error">
					确认清空 USER 与 MEMORY（共 {total} 字符）
				</div>
				<div className="mt-0.5 text-xs leading-relaxed text-text-muted">
					SOUL 不受影响。此操作不可恢复，Agent
					将失去所有积累的用户偏好与环境事实。
				</div>
			</div>
			<div className="flex gap-2">
				<SettingsButton variant="secondary" onClick={onCancel}>
					取消
				</SettingsButton>
				<SettingsButton variant="danger-solid" onClick={onConfirm}>
					确认清空
				</SettingsButton>
			</div>
		</div>
	);
}
