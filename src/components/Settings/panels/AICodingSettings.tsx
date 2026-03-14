import { Bot, Download, RefreshCcw, Save } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type {
	BackendCapabilityMatrix,
	CodingApprovalMode,
	CodingBackendId,
} from "../../../../electron/shared/coding-workspace";
import type { CliDetectionResult } from "../../../../electron/shared/ipc-schema";
import {
	DEFAULT_AI_CODING_SETTINGS,
	getAICodingSettings,
	setAICodingSettings,
	type AICodingSettings,
} from "../../../lib/coding/codingSettings";
import {
	detectCliBinary,
	getCodingBackendCapabilities,
	getClaudeCodeAuthStatus,
	invalidateCliCache,
	readUserCliConfig,
} from "../../../lib/coding/runtimeApi";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/Toast";
import { ClaudeAuthStatusCard } from "../components/ClaudeAuthStatusCard";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../ui/SettingsPrimitives";

const CLAUDE_APPROVAL_OPTIONS: Array<{
	value: CodingApprovalMode;
	label: string;
}> = [
	{ value: "default", label: "default" },
	{ value: "acceptEdits", label: "acceptEdits" },
	{ value: "dontAsk", label: "dontAsk" },
	{ value: "plan", label: "plan" },
	{ value: "bypassPermissions", label: "bypassPermissions" },
];

const CODEX_APPROVAL_OPTIONS: Array<{
	value: CodingApprovalMode;
	label: string;
}> = [
	{ value: "untrusted", label: "untrusted" },
	{ value: "on-request", label: "on-request" },
	{ value: "on-failure", label: "on-failure" },
	{ value: "never", label: "never" },
];

const HIGHLIGHT_THEME_OPTIONS = [
	{ value: "github-dark", label: "GitHub Dark" },
	{ value: "one-dark-pro", label: "One Dark Pro" },
	{ value: "dracula", label: "Dracula" },
	{ value: "github-light", label: "GitHub Light" },
	{ value: "nord", label: "Nord" },
	{ value: "vitesse-dark", label: "Vitesse Dark" },
];

export function AICodingSettings() {
	const [settings, setSettings] = useState<AICodingSettings>(
		DEFAULT_AI_CODING_SETTINGS,
	);
	const [capabilities, setCapabilities] = useState<
		Record<CodingBackendId, BackendCapabilityMatrix | null>
	>({
		"claude-code": null,
		codex: null,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [cliDetection, setCliDetection] = useState<
		Record<CodingBackendId, CliDetectionResult | null>
	>({
		"claude-code": null,
		codex: null,
	});
	const [claudeAuthStatus, setClaudeAuthStatus] = useState<{
		isLoggedIn: boolean;
		authMethod: "oauth" | "api_key" | "env_key" | "none";
		email?: string;
		model?: string;
		mcpServers?: Array<{
			name: string;
			command?: string;
			url?: string;
			type?: string;
		}>;
	} | null>(null);
	const [authLoading, setAuthLoading] = useState(false);
	const [syncingCli, setSyncingCli] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [nextSettings, nextCapabilities] = await Promise.all([
				getAICodingSettings(),
				getCodingBackendCapabilities() as Promise<
					Record<CodingBackendId, BackendCapabilityMatrix>
				>,
			]);
			setSettings(nextSettings);
			setCapabilities({
				"claude-code": nextCapabilities["claude-code"],
				codex: {
					...nextCapabilities.codex,
					modelCatalog: nextSettings.codexModelCatalog,
				},
			});
			// 并行检测两个后端的 CLI
			const [claudeDetection, codexDetection] = await Promise.all([
				detectCliBinary("claude-code", nextSettings.claudeCliPath || undefined),
				detectCliBinary("codex", nextSettings.codexCliPath || undefined),
			]);
			setCliDetection({
				"claude-code": claudeDetection,
				codex: codexDetection,
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	// 首次加载后，如果 Codex 默认模型为空，自动从本地 CLI 配置同步
	useEffect(() => {
		if (!loading && !settings.codexDefaultModel) {
			void handleSyncFromCli(true);
		}
	}, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		setAuthLoading(true);
		getClaudeCodeAuthStatus()
			.then((status) => setClaudeAuthStatus(status))
			.catch(() => setClaudeAuthStatus(null))
			.finally(() => setAuthLoading(false));
	}, []);

	const codexModelCatalogText = useMemo(
		() => settings.codexModelCatalog.join("\n"),
		[settings.codexModelCatalog],
	);

	const handleSave = useCallback(async () => {
		setSaving(true);
		try {
			await setAICodingSettings(settings);
			// 保存后清除 CLI 检测缓存，使下次检测使用最新的配置路径
			await invalidateCliCache();
			toast.success("AI 编程设置已保存");
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	}, [load, settings]);

	const handleSyncFromCli = useCallback(async (silent = false) => {
		setSyncingCli(true);
		try {
			const cliConfig = await readUserCliConfig();
			let synced = 0;
			setSettings((current) => {
				const next = { ...current };
				if (cliConfig.claude?.model && !current.claudeDefaultModel) {
					next.claudeDefaultModel = cliConfig.claude.model;
					synced++;
				}
				if (cliConfig.codex?.model && !current.codexDefaultModel) {
					next.codexDefaultModel = cliConfig.codex.model;
					synced++;
				}
				return next;
			});
			const hasAnything = cliConfig.claude ?? cliConfig.codex;
			if (!silent) {
				if (!hasAnything) {
					toast.error(
						"未找到本地 CLI 配置文件（~/.claude/settings.json 或 ~/.codex/config.toml）",
					);
				} else if (synced === 0) {
					toast.success("已检测到 CLI 配置，当前设置已是最新，无需同步");
				} else {
					toast.success(
						`已从本地 CLI 配置同步 ${synced} 项设置，请点击保存生效`,
					);
				}
			} else if (synced > 0) {
				// 静默模式下自动保存同步到的配置
				const updatesToSave: Partial<AICodingSettings> = {};
				if (cliConfig.codex?.model) {
					updatesToSave.codexDefaultModel = cliConfig.codex.model;
				}
				if (cliConfig.claude?.model) {
					updatesToSave.claudeDefaultModel = cliConfig.claude.model;
				}
				if (Object.keys(updatesToSave).length > 0) {
					await setAICodingSettings(updatesToSave);
				}
			}
		} catch (error) {
			if (!silent) {
				toast.error(error instanceof Error ? error.message : String(error));
			}
		} finally {
			setSyncingCli(false);
		}
	}, []);

	return (
		<SettingsPageContainer contentClassName="max-w-3xl space-y-8">
			<SettingsPanelHeader
				icon={Bot}
				title="AI 编程"
				description="配置工作台默认后端、模型、审批策略与 workspace memory。"
				actions={
					<>
						<button
							type="button"
							onClick={() => void handleSyncFromCli()}
							disabled={syncingCli || loading}
							title="读取 ~/.claude/settings.json 与 ~/.codex/config.toml，同步已检测到的模型等配置"
							className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							<Download
								className={`h-4 w-4 ${syncingCli ? "animate-pulse" : ""}`}
							/>
							从 CLI 同步
						</button>
						<button
							type="button"
							onClick={() => void load()}
							className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							<RefreshCcw
								className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
							/>
							刷新
						</button>
						<button
							type="button"
							onClick={() => void handleSave()}
							disabled={saving || loading}
							className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
						>
							<Save className="h-4 w-4" />
							保存
						</button>
					</>
				}
			/>

			<SettingsSectionCard className="p-5">
				<SettingsSectionTitle>默认工作台</SettingsSectionTitle>
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="默认后端">
						<Select
							value={settings.defaultBackend}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									defaultBackend: event.target.value as CodingBackendId,
								}))
							}
							options={[
								{ value: "claude-code", label: "Claude Code" },
								{ value: "codex", label: "Codex" },
							]}
						/>
					</Field>
					<Field label="workspace memory 策略">
						<Select
							value={settings.workspaceMemoryPolicy}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									workspaceMemoryPolicy: event.target.value as
										| "manual"
										| "always",
								}))
							}
							options={[
								{ value: "always", label: "always" },
								{ value: "manual", label: "manual" },
							]}
						/>
					</Field>
				</div>
			</SettingsSectionCard>

			<BackendSection
				title="Claude Code"
				capability={capabilities["claude-code"]}
				modelValue={settings.claudeDefaultModel}
				onModelChange={(value) =>
					setSettings((current) => ({ ...current, claudeDefaultModel: value }))
				}
				approvalValue={settings.claudeDefaultApprovalMode}
				onApprovalChange={(value) =>
					setSettings((current) => ({
						...current,
						claudeDefaultApprovalMode: value,
					}))
				}
				approvalOptions={CLAUDE_APPROVAL_OPTIONS}
				cliPath={settings.claudeCliPath}
				onCliPathChange={(value) =>
					setSettings((current) => ({ ...current, claudeCliPath: value }))
				}
				cliDetection={cliDetection["claude-code"]}
			>
				<div className="mt-4">
					<Field label="API 路由模式">
						<Select
							value={settings.claudeProxyMode}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									claudeProxyMode: event.target.value as
										| "proxy"
										| "transparent",
								}))
							}
							options={[
								{
									value: "transparent",
									label: "透明模式（使用用户自己的 Claude 配置）",
								},
								{
									value: "proxy",
									label: "代理模式（通过本地代理，支持多 Provider 路由）",
								},
							]}
						/>
					</Field>
					<p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
						{settings.claudeProxyMode === "transparent"
							? "CLI 将使用您自己的 API key、base URL 和配置文件，不做任何拦截。"
							: "所有 API 流量通过本地代理转发，支持多 Provider 模型路由和场景覆盖。"}
					</p>
				</div>
			</BackendSection>

			{settings.defaultBackend === "claude-code" && (
				<ClaudeAuthStatusCard status={claudeAuthStatus} loading={authLoading} />
			)}

			<SettingsSectionCard className="p-5">
				<div className="flex items-start justify-between gap-4">
					<div>
						<SettingsSectionTitle>Codex</SettingsSectionTitle>
						<div className="text-sm text-zinc-500 dark:text-zinc-400">
							{formatBackendMeta(capabilities.codex)}
						</div>
					</div>
					<CapabilityPill capability={capabilities.codex} />
				</div>
				<div className="mt-4 grid gap-4 md:grid-cols-2">
					<Field label="默认模型">
						<input
							value={settings.codexDefaultModel}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									codexDefaultModel: event.target.value,
								}))
							}
							className={INPUT_CLASSNAME}
						/>
					</Field>
					<Field label="默认审批模式">
						<Select
							value={settings.codexDefaultApprovalMode}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									codexDefaultApprovalMode: event.target
										.value as CodingApprovalMode,
								}))
							}
							options={CODEX_APPROVAL_OPTIONS}
						/>
					</Field>
				</div>
				<div className="mt-4">
					<Field label="Codex model catalog">
						<textarea
							value={codexModelCatalogText}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									codexModelCatalog: event.target.value
										.split(/\r?\n|,/)
										.map((item) => item.trim())
										.filter(Boolean),
								}))
							}
							rows={6}
							className={`${INPUT_CLASSNAME} min-h-[144px] py-3 font-mono text-[12px] leading-6`}
						/>
					</Field>
				</div>
				<div className="mt-4">
					<Field label="CLI 路径">
						<input
							value={settings.codexCliPath}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									codexCliPath: event.target.value,
								}))
							}
							placeholder="留空自动检测"
							className={`${INPUT_CLASSNAME} font-mono text-xs`}
						/>
					</Field>
					<CliDetectionInfo detection={cliDetection.codex} />
				</div>
			</SettingsSectionCard>

			{/* 编辑器与工作区设置 */}
			<SettingsSectionCard className="p-5">
				<SettingsSectionTitle>编辑器与工作区</SettingsSectionTitle>
				<div className="grid gap-4 md:grid-cols-2">
					<Field label="代码编辑器字号">
						<input
							type="number"
							min={8}
							max={32}
							value={settings.editorFontSize}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									editorFontSize: Math.max(
										8,
										Math.min(32, Number(event.target.value) || 13),
									),
								}))
							}
							className={INPUT_CLASSNAME}
						/>
					</Field>
					<Field label="显示 Minimap">
						<Select
							value={settings.editorShowMinimap ? "true" : "false"}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									editorShowMinimap: event.target.value === "true",
								}))
							}
							options={[
								{ value: "true", label: "显示" },
								{ value: "false", label: "隐藏" },
							]}
						/>
					</Field>
					<Field label="文件树自动刷新间隔 (ms)">
						<input
							type="number"
							min={100}
							max={10000}
							step={100}
							value={settings.fileTreeAutoRefreshMs}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									fileTreeAutoRefreshMs: Math.max(
										100,
										Math.min(10000, Number(event.target.value) || 500),
									),
								}))
							}
							className={INPUT_CLASSNAME}
						/>
					</Field>
					<Field label="终端默认 Shell">
						<input
							value={settings.terminalDefaultShell}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									terminalDefaultShell: event.target.value,
								}))
							}
							placeholder="留空使用系统默认"
							className={INPUT_CLASSNAME}
						/>
					</Field>
					<Field label="代码高亮主题">
						<Select
							value={settings.highlightTheme}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									highlightTheme: event.target.value,
								}))
							}
							options={HIGHLIGHT_THEME_OPTIONS}
						/>
					</Field>
					<Field label="文件监听">
						<Select
							value={settings.fileWatcherEnabled ? "true" : "false"}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									fileWatcherEnabled: event.target.value === "true",
								}))
							}
							options={[
								{ value: "true", label: "启用" },
								{ value: "false", label: "禁用" },
							]}
						/>
					</Field>
					<Field label="Diff 自动接受">
						<Select
							value={settings.autoAcceptDiffs ? "true" : "false"}
							onChange={(event) =>
								setSettings((current) => ({
									...current,
									autoAcceptDiffs: event.target.value === "true",
								}))
							}
							options={[
								{ value: "false", label: "手动审核" },
								{ value: "true", label: "自动接受（full-auto）" },
							]}
						/>
					</Field>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}

function BackendSection({
	title,
	capability,
	modelValue,
	onModelChange,
	approvalValue,
	onApprovalChange,
	approvalOptions,
	cliPath,
	onCliPathChange,
	cliDetection,
	children,
}: {
	title: string;
	capability: BackendCapabilityMatrix | null;
	modelValue: string;
	onModelChange: (value: string) => void;
	onApprovalChange: (value: CodingApprovalMode) => void;
	approvalValue: CodingApprovalMode;
	approvalOptions: Array<{ value: CodingApprovalMode; label: string }>;
	cliPath?: string;
	onCliPathChange?: (value: string) => void;
	cliDetection?: CliDetectionResult | null;
	children?: ReactNode;
}) {
	return (
		<SettingsSectionCard className="p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<SettingsSectionTitle>{title}</SettingsSectionTitle>
					<div className="text-sm text-zinc-500 dark:text-zinc-400">
						{formatBackendMeta(capability)}
					</div>
				</div>
				<CapabilityPill capability={capability} />
			</div>
			<div className="mt-4 grid gap-4 md:grid-cols-2">
				<Field label="默认模型">
					<input
						value={modelValue}
						onChange={(event) => onModelChange(event.target.value)}
						className={INPUT_CLASSNAME}
					/>
				</Field>
				<Field label="默认审批模式">
					<Select
						value={approvalValue}
						onChange={(event) =>
							onApprovalChange(event.target.value as CodingApprovalMode)
						}
						options={approvalOptions}
					/>
				</Field>
			</div>
			{onCliPathChange && (
				<div className="mt-4">
					<Field label="CLI 路径">
						<input
							value={cliPath ?? ""}
							onChange={(event) => onCliPathChange(event.target.value)}
							placeholder="留空自动检测"
							className={`${INPUT_CLASSNAME} font-mono text-xs`}
						/>
					</Field>
					<CliDetectionInfo detection={cliDetection ?? null} />
				</div>
			)}
			{children}
		</SettingsSectionCard>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="block space-y-2">
			<div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">
				{label}
			</div>
			{children}
		</label>
	);
}

function CapabilityPill({
	capability,
}: {
	capability: BackendCapabilityMatrix | null;
}) {
	const available = capability?.available === true;
	return (
		<div
			className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
				available
					? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					: "bg-red-500/10 text-red-500"
			}`}
		>
			{available ? "已就绪" : "不可用"}
		</div>
	);
}

function formatBackendMeta(capability: BackendCapabilityMatrix | null): string {
	if (!capability) return "尚未检测到 CLI 能力";
	if (!capability.available) return capability.error || "当前环境不可用";
	return [capability.version, capability.binaryPath]
		.filter(Boolean)
		.join(" · ");
}

const CLI_SOURCE_LABELS: Record<string, string> = {
	user_configured: "用户配置",
	system_detected: "系统检测",
	sdk_bundled: "SDK 内嵌",
	not_found: "未检测到",
};

function CliDetectionInfo({
	detection,
}: {
	detection: CliDetectionResult | null;
}) {
	if (!detection) return null;
	const sourceLabel = CLI_SOURCE_LABELS[detection.source] ?? detection.source;
	const found = detection.source !== "not_found";
	return (
		<div className="mt-1.5 space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
			<div className="flex items-center gap-1.5">
				<span
					className={`inline-block h-1.5 w-1.5 rounded-full ${
						found ? "bg-emerald-500" : "bg-red-400"
					}`}
				/>
				<span className="font-medium">{sourceLabel}</span>
				{detection.version && (
					<span className="text-zinc-400 dark:text-zinc-500">
						v{detection.version}
					</span>
				)}
			</div>
			{detection.path && (
				<div className="truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
					{detection.path}
				</div>
			)}
			{detection.error && (
				<div className="text-red-500 dark:text-red-400">{detection.error}</div>
			)}
		</div>
	);
}

const INPUT_CLASSNAME =
	"w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
