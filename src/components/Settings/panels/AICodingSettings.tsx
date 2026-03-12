import { Bot, RefreshCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
	BackendCapabilityMatrix,
	CodingApprovalMode,
	CodingBackendId,
} from "../../../../electron/shared/coding-workspace";
import {
	DEFAULT_AI_CODING_SETTINGS,
	getAICodingSettings,
	setAICodingSettings,
	type AICodingSettings,
} from "../../../lib/coding/codingSettings";
import { getCodingBackendCapabilities } from "../../../lib/coding/runtimeApi";
import { Select } from "../../ui/Select";
import { toast } from "../../ui/Toast";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../ui/SettingsPrimitives";

const CLAUDE_APPROVAL_OPTIONS: Array<{ value: CodingApprovalMode; label: string }> = [
	{ value: "default", label: "default" },
	{ value: "acceptEdits", label: "acceptEdits" },
	{ value: "dontAsk", label: "dontAsk" },
	{ value: "plan", label: "plan" },
	{ value: "bypassPermissions", label: "bypassPermissions" },
];

const CODEX_APPROVAL_OPTIONS: Array<{ value: CodingApprovalMode; label: string }> = [
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
	const [settings, setSettings] = useState<AICodingSettings>(DEFAULT_AI_CODING_SETTINGS);
	const [capabilities, setCapabilities] = useState<Record<CodingBackendId, BackendCapabilityMatrix | null>>({
		"claude-code": null,
		codex: null,
	});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [nextSettings, nextCapabilities] = await Promise.all([
				getAICodingSettings(),
				getCodingBackendCapabilities() as Promise<Record<CodingBackendId, BackendCapabilityMatrix>>,
			]);
			setSettings(nextSettings);
			setCapabilities({
				"claude-code": nextCapabilities["claude-code"],
				codex: {
					...nextCapabilities.codex,
					modelCatalog: nextSettings.codexModelCatalog,
				},
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

	const codexModelCatalogText = useMemo(
		() => settings.codexModelCatalog.join("\n"),
		[settings.codexModelCatalog],
	);

	const handleSave = useCallback(async () => {
		setSaving(true);
		try {
			await setAICodingSettings(settings);
			toast.success("AI 编程设置已保存");
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	}, [load, settings]);

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
							onClick={() => void load()}
							className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
						>
							<RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
									workspaceMemoryPolicy: event.target.value as "manual" | "always",
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
			/>

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
								setSettings((current) => ({ ...current, codexDefaultModel: event.target.value }))
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
									codexDefaultApprovalMode: event.target.value as CodingApprovalMode,
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
									editorFontSize: Math.max(8, Math.min(32, Number(event.target.value) || 13)),
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
									fileTreeAutoRefreshMs: Math.max(100, Math.min(10000, Number(event.target.value) || 500)),
								}))
							}
							className={INPUT_CLASSNAME}
						/>
					</Field>
					<Field label="终端默认 Shell">
						<input
							value={settings.terminalDefaultShell}
							onChange={(event) =>
								setSettings((current) => ({ ...current, terminalDefaultShell: event.target.value }))
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
}: {
	title: string;
	capability: BackendCapabilityMatrix | null;
	modelValue: string;
	onModelChange: (value: string) => void;
	onApprovalChange: (value: CodingApprovalMode) => void;
	approvalValue: CodingApprovalMode;
	approvalOptions: Array<{ value: CodingApprovalMode; label: string }>;
}) {
	return (
		<SettingsSectionCard className="p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<SettingsSectionTitle>{title}</SettingsSectionTitle>
					<div className="text-sm text-zinc-500 dark:text-zinc-400">{formatBackendMeta(capability)}</div>
				</div>
				<CapabilityPill capability={capability} />
			</div>
			<div className="mt-4 grid gap-4 md:grid-cols-2">
				<Field label="默认模型">
					<input value={modelValue} onChange={(event) => onModelChange(event.target.value)} className={INPUT_CLASSNAME} />
				</Field>
				<Field label="默认审批模式">
					<Select
						value={approvalValue}
						onChange={(event) => onApprovalChange(event.target.value as CodingApprovalMode)}
						options={approvalOptions}
					/>
				</Field>
			</div>
		</SettingsSectionCard>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="block space-y-2">
			<div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</div>
			{children}
		</label>
	);
}

function CapabilityPill({ capability }: { capability: BackendCapabilityMatrix | null }) {
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
	return [capability.version, capability.binaryPath].filter(Boolean).join(" · ");
}

const INPUT_CLASSNAME =
	"w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
