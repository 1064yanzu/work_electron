// 键盘快捷键设置面板
//
// 数据来自 src/lib/shortcuts 注册中心（单一事实源），注册什么就展示什么；
// scoped 快捷键（沙盒/对话）随对应视图挂载注册，列表会实时反映当前生效项。
// 用户自定义重映射：registry 数据结构已预留，待后续版本开放。

import { Command, Keyboard, SquareSlash } from "lucide-react";
import { useMemo } from "react";
import { modKey } from "../../../lib/platform";
import {
	formatKeys,
	shortcutRegistry,
	useShortcutRegistrySelector,
	type RegisteredShortcut,
	type ShortcutGroup,
} from "../../../lib/shortcuts";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsHeader,
} from "../ui/SettingsPrimitives";

const GROUP_ORDER: ShortcutGroup[] = [
	"全局",
	"工作区",
	"对话",
	"沙盒",
	"面板与对话框",
];

function ShortcutRow({ entry }: { entry: RegisteredShortcut }) {
	const keys = entry.keysDisplay ?? formatKeys(entry.keys);
	return (
		<div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-text-primary">
					{entry.label}
				</div>
				{entry.description ? (
					<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
						{entry.description}
					</div>
				) : null}
			</div>
			<div className="flex items-center gap-1 shrink-0">
				{keys.map((key, idx) => (
					<span key={`${entry.id}-${idx}`} className="flex items-center gap-1">
						<kbd className="px-2 py-1 rounded-md text-[11px] font-medium text-text-secondary bg-warm-200 border border-border">
							{key}
						</kbd>
						{idx < keys.length - 1 && (
							<span className="text-text-muted text-[10px]">+</span>
						)}
					</span>
				))}
			</div>
		</div>
	);
}

export function ShortcutsSettings() {
	const entries = useShortcutRegistrySelector((s) => s.entries);

	const groups = useMemo(() => {
		const byId = new Map<string, RegisteredShortcut>();
		for (const entry of entries) byId.set(entry.id, entry);
		const grouped = new Map<ShortcutGroup, RegisteredShortcut[]>();
		for (const entry of byId.values()) {
			const list = grouped.get(entry.group) ?? [];
			list.push(entry);
			grouped.set(entry.group, list);
		}
		return GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => ({
			title: g,
			items: grouped.get(g) as RegisteredShortcut[],
		}));
	}, [entries]);

	return (
		<SettingsPageContainer>
			<div>
				<SettingsSectionTitle>键盘快捷键</SettingsSectionTitle>
				<SettingsSectionCard>
					<SettingsHeader
						title="当前生效的快捷键"
						description="沙盒 / 对话等场景快捷键随对应视图出现；自定义键位将在后续版本开放"
					/>
					<div className="px-5 py-4 space-y-6">
						{groups.map((group) => (
							<div key={group.title}>
								<h4 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-3 flex items-center gap-1.5">
									<Keyboard className="w-3 h-3" strokeWidth={1.5} />
									{group.title}
								</h4>
								<div className="space-y-2">
									{group.items.map((entry) => (
										<ShortcutRow key={entry.id} entry={entry} />
									))}
								</div>
							</div>
						))}
					</div>
				</SettingsSectionCard>
			</div>

			<div>
				<SettingsSectionTitle>提示</SettingsSectionTitle>
				<SettingsSectionCard>
					<div className="px-5 py-4 flex items-start gap-3">
						<div className="w-9 h-9 rounded-xl bg-warm-200 flex items-center justify-center text-text-secondary shrink-0">
							<Command className="w-4 h-4" strokeWidth={1.5} />
						</div>
						<div className="text-[13px] text-text-secondary leading-relaxed">
							<p>
								命令面板（{modKey}+K）是访问绝大多数功能的最快方式 ——
								新建项目、切换主题、跳转到任意设置 tab、唤起终端等都能直接搜索。
							</p>
							<p className="mt-2 text-text-muted text-[12px]">
								在任意界面按 {modKey}+/ 可随时唤起快捷键速查表。
							</p>
						</div>
					</div>
					<div className="px-5 pb-4">
						<button
							type="button"
							onClick={() => shortcutRegistry.openCheatSheet()}
							className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-medium text-text-primary bg-warm-200 border border-border hover:bg-warm-300 transition-colors active:scale-[0.98]"
						>
							<SquareSlash className="w-3.5 h-3.5" strokeWidth={1.5} />
							打开速查表（{modKey}+/）
						</button>
					</div>
				</SettingsSectionCard>
			</div>
		</SettingsPageContainer>
	);
}
