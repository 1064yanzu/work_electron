/**
 * RemoteTerminalSection — 远程控制「终端」Tab
 *
 * 让手机端通过 IM /cli 指令接管桌面端 pty，远程驱动 codex / claude code /
 * opencode 等 TUI 编码工具。本面板配置：
 *   - 总开关 / 屏幕尺寸 / 快照节流 / 空闲超时
 *   - 自由命令模式（允许任意命令，等同 SSH，默认关）
 *   - 预设 CLI 列表（id / name / command / cwd）
 *   - 默认 cwd 候选
 *   - 当前活跃会话表（含强制结束按钮）
 *
 * 后端实现见 electron/main/remote-control/core/ptyBridge/。
 */

import {
	AlertTriangle,
	Monitor,
	RefreshCw,
	Terminal,
	Trash2,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	RemoteControlConfig,
	RemoteTerminalConfig,
	RemoteTerminalPreset,
	RemoteTerminalSession,
} from "../../../../../lib/api";
import {
	listRemoteTerminalSessions,
	terminateRemoteTerminalSession,
} from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { toast } from "../../../../ui/Toast";
import { Button } from "../../../../ui/Button";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";
import { StatusDot } from "../StatusDot";

const INPUT_CLASS =
	"w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-out focus:border-primary/60 focus:ring-2 focus:ring-primary/20 hover:border-cream-500";

const TEXTAREA_CLASS = cn(INPUT_CLASS, "font-mono leading-relaxed");

type Props = {
	config: RemoteControlConfig;
	saving: boolean;
	onSave: (
		updater: (draft: RemoteControlConfig) => RemoteControlConfig,
	) => void;
};

function presetsToText(presets: RemoteTerminalPreset[]): string {
	return presets
		.map((p) => {
			const tail = p.cwd ? `\t${p.cwd}` : "";
			return `${p.id}\t${p.name}\t${p.command}${tail}`;
		})
		.join("\n");
}

function parsePresetsText(text: string): RemoteTerminalPreset[] {
	const lines = text.split(/\r?\n/);
	const presets: RemoteTerminalPreset[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const parts = line
			.split(/\t|\s{2,}/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (parts.length < 3) continue;
		const [id, name, command, cwd] = parts;
		const preset: RemoteTerminalPreset = { id, name, command };
		if (cwd) preset.cwd = cwd;
		presets.push(preset);
	}
	return presets;
}

function cwdsToText(cwds: string[]): string {
	return cwds.join("\n");
}

function parseCwdsText(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((s) => s.trim())
		.filter(Boolean);
}

function formatTimestamp(ts: number): string {
	try {
		return new Date(ts).toLocaleTimeString();
	} catch {
		return String(ts);
	}
}

function formatDuration(startedAt: number): string {
	const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	const rem = sec % 60;
	if (min < 60) return `${min}m${rem}s`;
	const hr = Math.floor(min / 60);
	return `${hr}h${min % 60}m`;
}

export function RemoteTerminalSection({ config, saving, onSave }: Props) {
	const terminal: RemoteTerminalConfig = config.terminal;
	const [presetsDraft, setPresetsDraft] = useState(
		presetsToText(terminal.presets),
	);
	const [cwdsDraft, setCwdsDraft] = useState(cwdsToText(terminal.defaultCwds));
	const [sessions, setSessions] = useState<RemoteTerminalSession[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const [busySessionId, setBusySessionId] = useState<string | null>(null);

	const refreshSessions = useCallback(async () => {
		setRefreshing(true);
		try {
			const next = await listRemoteTerminalSessions();
			setSessions(next);
		} catch (error) {
			toast.error(
				`刷新会话失败：${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		setPresetsDraft(presetsToText(terminal.presets));
	}, [terminal.presets]);

	useEffect(() => {
		setCwdsDraft(cwdsToText(terminal.defaultCwds));
	}, [terminal.defaultCwds]);

	useEffect(() => {
		void refreshSessions();
	}, [refreshSessions]);

	const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
	useEffect(() => {
		if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
		if (terminal.enabled) {
			autoRefreshRef.current = setInterval(() => void refreshSessions(), 8_000);
		}
		return () => {
			if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
		};
	}, [terminal.enabled, refreshSessions]);

	const handleTerminate = useCallback(
		async (sessionId: string) => {
			setBusySessionId(sessionId);
			try {
				const result = await terminateRemoteTerminalSession(sessionId);
				if (result.success) {
					toast.success("已结束会话");
				} else {
					toast.warning("会话已不在线");
				}
				await refreshSessions();
			} catch (error) {
				toast.error(
					`结束失败：${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setBusySessionId(null);
			}
		},
		[refreshSessions],
	);

	const dirtyPresets = presetsDraft !== presetsToText(terminal.presets);
	const dirtyCwds = cwdsDraft !== cwdsToText(terminal.defaultCwds);

	const commitPresets = useCallback(() => {
		const parsed = parsePresetsText(presetsDraft);
		onSave((draft) => {
			draft.terminal.presets = parsed;
			return draft;
		});
	}, [presetsDraft, onSave]);

	const commitCwds = useCallback(() => {
		const parsed = parseCwdsText(cwdsDraft);
		onSave((draft) => {
			draft.terminal.defaultCwds = parsed;
			return draft;
		});
	}, [cwdsDraft, onSave]);

	const sortedSessions = useMemo(
		() => [...sessions].sort((a, b) => b.started_at - a.started_at),
		[sessions],
	);

	return (
		<div className="space-y-6">
			{/* 总开关 */}
			<SettingsSectionCard className="p-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="bai-icon-badge h-10 w-10">
							<Terminal className="h-5 w-5 text-primary" strokeWidth={1.5} />
							{terminal.enabled ? (
								<span className="absolute -right-1 -top-1">
									<StatusDot tone="emerald" pulse size="xs" />
								</span>
							) : null}
						</div>
						<div className="max-w-xl">
							<div className="flex items-center gap-2">
								<SettingsSectionTitle className="mb-0 text-base">
									IM 远程终端
								</SettingsSectionTitle>
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
										terminal.enabled
											? "bg-mint-500/10 text-mint-600"
											: "bg-warm-200 text-text-muted",
									)}
								>
									<StatusDot
										tone={terminal.enabled ? "emerald" : "zinc"}
										size="xs"
										pulse={terminal.enabled}
									/>
									{terminal.enabled ? "可用" : "未启用"}
								</span>
							</div>
							<p className="mt-1 text-xs leading-relaxed text-text-secondary">
								启用后，已配对的 IM 用户可发送
								<code className="mx-1 rounded bg-warm-200 px-1 py-0.5 text-[11px]">
									/cli start &lt;preset&gt;
								</code>
								接管桌面端 pty，运行 codex / claude code / opencode 等 TUI。
								终端输出经虚拟屏幕渲染后通过同一渠道的流式卡片实时推送。
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={terminal.enabled}
						onChange={(next) => {
							onSave((draft) => {
								draft.terminal.enabled = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>
			</SettingsSectionCard>

			{/* 屏幕 & 节流 */}
			<SettingsSectionCard className="p-5 space-y-4">
				<SettingsSectionTitle className="mb-0 text-base">
					运行参数
				</SettingsSectionTitle>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-text-secondary">屏幕列数</span>
						<input
							type="number"
							min={40}
							max={240}
							value={terminal.cols}
							onChange={(e) => {
								const v = Math.min(
									240,
									Math.max(40, Number(e.target.value || 100)),
								);
								onSave((draft) => {
									draft.terminal.cols = v;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-text-secondary">屏幕行数</span>
						<input
							type="number"
							min={10}
							max={80}
							value={terminal.rows}
							onChange={(e) => {
								const v = Math.min(
									80,
									Math.max(10, Number(e.target.value || 40)),
								);
								onSave((draft) => {
									draft.terminal.rows = v;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-text-secondary">
							快照节流（ms）
						</span>
						<input
							type="number"
							min={100}
							max={5000}
							step={50}
							value={terminal.snapshotIntervalMs}
							onChange={(e) => {
								const v = Math.min(
									5000,
									Math.max(100, Number(e.target.value || 350)),
								);
								onSave((draft) => {
									draft.terminal.snapshotIntervalMs = v;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-text-secondary">
							空闲超时（分钟）
						</span>
						<input
							type="number"
							min={1}
							max={1440}
							value={Math.round(terminal.idleTimeoutMs / 60_000)}
							onChange={(e) => {
								const minutes = Math.min(
									1440,
									Math.max(1, Number(e.target.value || 30)),
								);
								onSave((draft) => {
									draft.terminal.idleTimeoutMs = minutes * 60_000;
									return draft;
								});
							}}
							className={INPUT_CLASS}
						/>
					</label>
				</div>
				<p className="text-xs text-text-muted leading-relaxed">
					建议保持节流 300~500ms，过低会触发 IM
					编辑限频；屏幕尺寸越大手机端越难一屏读全。
				</p>
			</SettingsSectionCard>

			{/* 桌面端自动显示 */}
			<SettingsSectionCard className="p-5 space-y-3">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-warm-200 text-text-secondary">
							<Monitor className="h-4 w-4" strokeWidth={1.5} />
						</div>
						<div className="max-w-2xl">
							<SettingsSectionTitle className="mb-1 text-base">
								桌面端自动显示
							</SettingsSectionTitle>
							<p className="text-xs leading-relaxed text-text-secondary">
								开启后，IM 远端启动
								<code className="mx-1 rounded bg-warm-200 px-1 py-0.5 text-[11px]">
									/cli start
								</code>
								时桌面端会自动弹出终端面板并切到该会话，方便你在电脑前同屏观察、必要时接管输入。
								关闭则保持静默：远控 pty
								仍会运行，桌面端不主动打扰，可通过快捷键 / 命令面板手动调出。
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={terminal.autoShowOnDesktop}
						onChange={(next) => {
							onSave((draft) => {
								draft.terminal.autoShowOnDesktop = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>
			</SettingsSectionCard>

			{/* 自由命令开关 */}
			<SettingsSectionCard
				className={cn(
					"p-5 space-y-3",
					terminal.freeCommandMode ? "border-[#b53333]/40" : undefined,
				)}
			>
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div
							className={cn(
								"flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
								terminal.freeCommandMode
									? "bg-[#b53333]/[0.08] text-[#b53333]"
									: "bg-warm-200 text-text-muted",
							)}
						>
							<Zap className="h-4 w-4" strokeWidth={1.5} />
						</div>
						<div className="max-w-2xl">
							<SettingsSectionTitle className="mb-1 text-base">
								自由命令模式
							</SettingsSectionTitle>
							<p className="text-xs leading-relaxed text-text-secondary">
								关闭时仅允许启动预设里的 CLI；开启后
								<code className="mx-1 rounded bg-warm-200 px-1 py-0.5 text-[11px]">
									/cli start &lt;任意命令&gt;
								</code>
								会被直接执行，等同 SSH。请确保只对你完全信任的 IM 帐号开放。
							</p>
						</div>
					</div>
					<SettingsSwitch
						checked={terminal.freeCommandMode}
						onChange={(next) => {
							onSave((draft) => {
								draft.terminal.freeCommandMode = next;
								return draft;
							});
						}}
						disabled={saving}
					/>
				</div>
				{terminal.freeCommandMode ? (
					<div className="flex items-start gap-2 rounded-lg bg-[#b53333]/[0.06] p-3 text-xs text-[#b53333]">
						<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
						<span>
							自由命令模式已开启。任何已配对 IM 用户都可以远程执行任意 shell
							命令。
						</span>
					</div>
				) : null}
			</SettingsSectionCard>

			{/* 预设 CLI */}
			<SettingsSectionCard className="p-5 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<SettingsSectionTitle className="mb-0 text-base">
						预设 CLI
					</SettingsSectionTitle>
					<Button
						variant="outline"
						size="sm"
						disabled={!dirtyPresets || saving}
						onClick={commitPresets}
					>
						保存预设
					</Button>
				</div>
				<p className="text-xs leading-relaxed text-text-muted">
					每行一项，制表符或两个以上空格分隔。格式：
					<code className="ml-1 rounded bg-warm-200 px-1 py-0.5 text-[11px]">
						id\tname\tcommand[\tcwd]
					</code>
					。 cwd 可选；缺省则使用第一条「默认 cwd」或用户主目录。
				</p>
				<textarea
					value={presetsDraft}
					onChange={(e) => setPresetsDraft(e.target.value)}
					rows={Math.max(4, presetsDraft.split("\n").length + 1)}
					className={TEXTAREA_CLASS}
					spellCheck={false}
				/>
			</SettingsSectionCard>

			{/* 默认 cwd */}
			<SettingsSectionCard className="p-5 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<SettingsSectionTitle className="mb-0 text-base">
						默认 cwd 候选
					</SettingsSectionTitle>
					<Button
						variant="outline"
						size="sm"
						disabled={!dirtyCwds || saving}
						onClick={commitCwds}
					>
						保存 cwd
					</Button>
				</div>
				<p className="text-xs leading-relaxed text-text-muted">
					每行一个绝对路径，
					<code className="mx-1 rounded bg-warm-200 px-1 py-0.5 text-[11px]">
						~
					</code>
					会自动展开到家目录。 /cli start 未指定 --cwd 时使用第一条。
				</p>
				<textarea
					value={cwdsDraft}
					onChange={(e) => setCwdsDraft(e.target.value)}
					rows={Math.max(3, cwdsDraft.split("\n").length + 1)}
					className={TEXTAREA_CLASS}
					placeholder={"~/projects/foo\n~/work/bar"}
					spellCheck={false}
				/>
			</SettingsSectionCard>

			{/* 活跃会话 */}
			<SettingsSectionCard className="p-5 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<SettingsSectionTitle className="mb-0 text-base">
						活跃会话
					</SettingsSectionTitle>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void refreshSessions()}
						loading={refreshing}
					>
						<RefreshCw className="h-3.5 w-3.5" />
						刷新
					</Button>
				</div>
				{sortedSessions.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border bg-cream-50/40 px-4 py-8 text-center text-xs text-text-muted">
						{terminal.enabled
							? "当前没有活跃的远程终端会话。"
							: "终端功能未启用。"}
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border border-border">
						<table className="w-full text-xs">
							<thead className="bg-warm-100/60 text-text-muted">
								<tr>
									<th className="px-3 py-2 text-left font-medium">渠道</th>
									<th className="px-3 py-2 text-left font-medium">用户</th>
									<th className="px-3 py-2 text-left font-medium">命令</th>
									<th className="px-3 py-2 text-left font-medium">cwd</th>
									<th className="px-3 py-2 text-left font-medium">pid</th>
									<th className="px-3 py-2 text-left font-medium">运行</th>
									<th className="px-3 py-2 text-right font-medium">操作</th>
								</tr>
							</thead>
							<tbody>
								{sortedSessions.map((s) => (
									<tr key={s.session_id} className="border-t border-border">
										<td className="px-3 py-2 font-medium text-text-secondary">
											{s.channel_id}
										</td>
										<td className="px-3 py-2 text-text-secondary">
											{s.peer_name || s.peer_id}
										</td>
										<td
											className="px-3 py-2 font-mono text-[11px] text-text-primary"
											title={s.command}
										>
											<span className="block max-w-[12rem] truncate">
												{s.command}
											</span>
										</td>
										<td
											className="px-3 py-2 font-mono text-[11px] text-text-secondary"
											title={s.cwd}
										>
											<span className="block max-w-[12rem] truncate">
												{s.cwd}
											</span>
										</td>
										<td className="px-3 py-2 text-text-muted tabular-nums">
											{s.pid ?? "—"}
										</td>
										<td className="px-3 py-2 text-text-muted">
											<span title={formatTimestamp(s.started_at)}>
												{formatDuration(s.started_at)}
											</span>
										</td>
										<td className="px-3 py-2 text-right">
											<Button
												variant="ghost"
												size="sm"
												loading={busySessionId === s.session_id}
												onClick={() => void handleTerminate(s.session_id)}
												className="text-[#b53333] hover:bg-[#b53333]/[0.08]"
											>
												<Trash2 className="h-3.5 w-3.5" />
												结束
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</SettingsSectionCard>
		</div>
	);
}
