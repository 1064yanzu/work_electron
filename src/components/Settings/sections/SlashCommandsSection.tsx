/**
 * Claude Code 风格斜杠命令 —— 设置分区（T8.2 / T8.3 / T8.4）。
 *
 * 挂载点：`AgentSettings` 下方，作为一个独立 `SettingsCardSection`。
 *
 * 功能：
 * 1. 启用总开关（slashCommands.enabled）
 * 2. 按 group 分组折叠的可见性 Checkbox（slashCommands.visibility）
 * 3. /theme 默认主题 Select（slashCommands.defaultColorThemeId）
 * 4. 自定义命令扫描开关（slashCommands.customScanEnabled）
 * 5. Save 失败回滚：`saveSlashCommandsPref(prev, next)` 统一封装
 *
 * 约束：
 * - 与 `settingsStore.prefs` 双向绑定；
 * - 修改主题时双写 themeManager + prefs，保持 /theme 与 Settings 同值；
 * - 可见性变化会立即反映到 Registry（因 buildCommandContext 每次现读）。
 */

import { ChevronDown, ChevronRight, Terminal } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { commandRegistry } from "../../../lib/slashCommands";
import {
	SLASH_COMMAND_PREF_KEYS,
	buildSlashCommandsSettingsSnapshot,
	onSlashCommandsPrefsChanged,
} from "../../../lib/slashCommands/settingsSnapshot";
import { settingsStore } from "../../../lib/settingsStore";
import { themeManager } from "../../../lib/theme";
import { toast } from "../../ui/Toast";
import {
	SettingsCardSection,
	SettingsFieldGroup,
	SettingsRow,
	SettingsSwitch,
	settingsInputClass,
} from "../ui/SettingsPrimitives";
import { rescanCustomSlashCommands } from "../../../lib/slashCommands/customScanner";

const GROUP_LABEL: Record<string, string> = {
	session: "会话管理",
	runtime: "运行时",
	inspect: "查看与诊断",
	workspace: "工作区",
	custom: "自定义",
};

const GROUP_ORDER = ["session", "runtime", "inspect", "workspace", "custom"] as const;

/**
 * 写入偏好并在失败时回滚；统一走此函数以保证一致性。
 */
async function saveSlashCommandsPref(
	key: string,
	prev: unknown,
	next: unknown,
): Promise<boolean> {
	try {
		await settingsStore.setPref(key, next);
		return true;
	} catch (err) {
		console.warn("[SlashCommandsSection] 保存偏好失败，已回滚。", err);
		try {
			await settingsStore.setPref(key, prev);
		} catch {
			/* 回滚也失败就只能吃掉了，避免无限循环 */
		}
		toast.error(
			`保存失败：${err instanceof Error ? err.message : String(err)}`,
		);
		return false;
	}
}

function useSlashCommandsSnapshot() {
	return useSyncExternalStore(
		onSlashCommandsPrefsChanged,
		() => buildSlashCommandsSettingsSnapshot(),
		() => buildSlashCommandsSettingsSnapshot(),
	);
}

export function SlashCommandsSection() {
	const snapshot = useSlashCommandsSnapshot();

	// 读取当前已注册命令（用最宽松的 ctx，保证能枚举全部）
	// visibility 相关的渲染不依赖 availability，使用空 ctx 即可拿到全部定义。
	const allCommands = useMemo(() => {
		// 直接遍历 registry 内部条目：通过 listIndexed 会过滤 hidden，
		// 所以我们这里使用 byId + 已知 id 列表的方式遍历……更简单的做法是构造一个
		// "完全开放" 的 fake ctx，但那样又要模拟各 store 状态。
		// 最稳妥：从 registry 拿一个 debug listing（用 "全开" settings 的 fake ctx）。
		try {
			return commandRegistry.listIndexed({
				activeSession: null,
				sdkSessionId: null,
				recentResumableSessions: [],
				currentModel: null,
				availableModels: [],
				planModeEnabled: false,
				permissionMode: "default",
				workspacePath: null,
				hasGitRepo: false,
				rightSidebarVisible: true,
				currentColorThemeId: snapshot.defaultColorThemeId,
				settings: {
					enabled: true,
					visibility: {},
					defaultColorThemeId: snapshot.defaultColorThemeId,
					customScanEnabled: snapshot.customScanEnabled,
				},
				invokeSelectModel: () => undefined,
			});
		} catch (err) {
			console.warn("[SlashCommandsSection] 读取命令列表失败。", err);
			return [];
		}
	}, [snapshot.defaultColorThemeId, snapshot.customScanEnabled]);

	// 按 group 分组并保持稳定序
	const grouped = useMemo(() => {
		const map: Record<string, { id: string; name: string }[]> = {};
		for (const it of allCommands) {
			const g = it.definition.group;
			if (!map[g]) map[g] = [];
			map[g].push({ id: it.definition.id, name: it.definition.name });
		}
		return map;
	}, [allCommands]);

	// 折叠状态
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const toggleGroup = (g: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(g)) next.delete(g);
			else next.add(g);
			return next;
		});
	};

	// 主题列表
	const themes = useMemo(() => themeManager.getAllThemes(), []);

	// ------------------ 处理函数 ------------------
	const handleToggleEnabled = useCallback(
		async (next: boolean) => {
			await saveSlashCommandsPref(
				SLASH_COMMAND_PREF_KEYS.enabled,
				snapshot.enabled,
				next,
			);
		},
		[snapshot.enabled],
	);

	const handleToggleCustomScan = useCallback(
		async (next: boolean) => {
			const ok = await saveSlashCommandsPref(
				SLASH_COMMAND_PREF_KEYS.customScanEnabled,
				snapshot.customScanEnabled,
				next,
			);
			if (ok) {
				// 立即触发一次 rescan（开/关都会清空或重扫）
				void rescanCustomSlashCommands();
			}
		},
		[snapshot.customScanEnabled],
	);

	const handleToggleVisibility = useCallback(
		async (id: string, visible: boolean) => {
			const prev = snapshot.visibility;
			const next = { ...prev };
			if (visible) {
				delete next[id];
			} else {
				next[id] = "hide";
			}
			await saveSlashCommandsPref(
				SLASH_COMMAND_PREF_KEYS.visibility,
				prev,
				next,
			);
		},
		[snapshot.visibility],
	);

	const handleThemeChange = useCallback(
		async (nextId: string) => {
			// 双写：themeManager 立即生效，pref 持久化默认值
			try {
				themeManager.setColorTheme(nextId);
			} catch (err) {
				console.warn("[SlashCommandsSection] 切换主题失败。", err);
			}
			await saveSlashCommandsPref(
				SLASH_COMMAND_PREF_KEYS.defaultColorThemeId,
				snapshot.defaultColorThemeId,
				nextId,
			);
		},
		[snapshot.defaultColorThemeId],
	);

	// ------------------ 渲染 ------------------
	return (
		<SettingsCardSection
			title="Claude Code 斜杠命令"
			description="控制聊天输入框内的「命令」类别与自定义命令扫描；与 Slash `/theme` 共享同一默认主题字段。"
			headerAction={
				<span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-full bg-warm-200 text-text-secondary">
					<Terminal className="w-3 h-3" strokeWidth={1.5} />
					{snapshot.enabled ? "已启用" : "已关闭"}
				</span>
			}
			bodyClassName="px-0 py-0"
		>
			<SettingsFieldGroup>
				<SettingsRow
					label="启用 Claude Code 斜杠命令"
					description="关闭后，聊天输入框的一级菜单将不再展示「命令」类别。"
					action={
						<SettingsSwitch
							checked={snapshot.enabled}
							onChange={handleToggleEnabled}
						/>
					}
				/>
				<SettingsRow
					label="扫描项目级自定义命令"
					description="启用后会扫描当前工作区 .claude/commands/ 与用户目录 ~/.claude/commands/ 的 Markdown 模板。"
					action={
						<SettingsSwitch
							checked={snapshot.customScanEnabled}
							onChange={handleToggleCustomScan}
						/>
					}
				/>
				<SettingsRow
					label="/theme 默认主题"
					description="与设置界面的主题选择共用同一字段；Slash /theme 选中的主题即是这里的默认值。"
					action={
						<select
							className={`${settingsInputClass} w-[200px]`}
							value={snapshot.defaultColorThemeId}
							onChange={(e) => void handleThemeChange(e.target.value)}
						>
							{themes.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name}
								</option>
							))}
						</select>
					}
				/>
			</SettingsFieldGroup>

			<div className="border-t border-border px-5 py-4">
				<div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-muted">
					命令可见性
				</div>
				<p className="mb-3 text-[11.5px] leading-relaxed text-text-muted">
					取消勾选以在菜单中隐藏某条命令；不影响其它入口的功能。
				</p>
				<div className="space-y-3">
					{GROUP_ORDER.map((g) => {
						const list = grouped[g];
						if (!list || list.length === 0) return null;
						const isCollapsed = collapsed.has(g);
						return (
							<div key={g}>
								<button
									type="button"
									onClick={() => toggleGroup(g)}
									className="w-full flex items-center gap-2 py-1 text-left transition-colors hover:text-text-primary"
								>
									{isCollapsed ? (
										<ChevronRight className="w-3.5 h-3.5 text-text-muted" />
									) : (
										<ChevronDown className="w-3.5 h-3.5 text-text-muted" />
									)}
									<span className="text-[12.5px] font-medium text-text-primary">
										{GROUP_LABEL[g] ?? g}
									</span>
									<span className="text-[11px] text-text-muted">
										{list.length}
									</span>
								</button>
								{!isCollapsed && (
									<div className="mt-1 ml-6 grid grid-cols-2 gap-1.5">
										{list.map((c) => {
											const visible = snapshot.visibility[c.id] !== "hide";
											return (
												<label
													key={c.id}
													className="flex items-center gap-2 py-1 cursor-pointer select-none text-[12.5px] text-text-secondary hover:text-text-primary"
												>
													<input
														type="checkbox"
														checked={visible}
														onChange={(e) =>
															void handleToggleVisibility(c.id, e.target.checked)
														}
														className="accent-primary"
													/>
													<span className="font-mono text-[11px] text-text-muted">
														/{c.id}
													</span>
													<span className="truncate">{c.name}</span>
												</label>
											);
										})}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</SettingsCardSection>
	);
}
