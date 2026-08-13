// 键盘快捷键设置面板
//
// 数据来自 src/lib/shortcuts 注册中心（单一事实源），注册什么就展示什么；
// scoped 快捷键（沙盒/对话）随对应视图挂载注册，列表会实时反映当前生效项。
// 用户自定义重映射：registry 数据结构已预留，待后续版本开放。
//
// 版式：一个分组 = 「卡外分节标题 + 一张卡」，卡内只有行、行间只有一条 hairline。
// 以前是「一张大卡 + 卡内 5 个大写小标题 + 行间既有 gap 又有 border」，
// 同一份内容被切了三层，看起来比实际复杂得多。

import { Command, SquareSlash } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { modKey } from "../../../lib/platform";
import {
	formatKeys,
	shortcutRegistry,
	useShortcutRegistrySelector,
	type RegisteredShortcut,
	type ShortcutGroup,
} from "../../../lib/shortcuts";
import { cn } from "../../../lib/utils";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsSectionCard,
	settingsInputClass,
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
		<div className="flex items-center justify-between gap-4 border-b border-border py-3.5 last:border-0">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium leading-snug text-text-primary">
					{entry.label}
				</div>
				{entry.description ? (
					<div className="mt-1.5 text-xs leading-relaxed text-text-secondary">
						{entry.description}
					</div>
				) : null}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{keys.map((key, idx) => (
					<span key={`${entry.id}-${idx}`} className="flex items-center gap-1">
						<kbd className="rounded-lg border border-border bg-warm-200 px-2 py-1 text-xs font-medium text-text-secondary">
							{key}
						</kbd>
						{idx < keys.length - 1 && (
							<span className="text-2xs text-text-muted">+</span>
						)}
					</span>
				))}
			</div>
		</div>
	);
}

export function ShortcutsSettings() {
	const entries = useShortcutRegistrySelector((s) => s.entries);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	const groups = useMemo(() => {
		const keyword = deferredQuery.trim().toLowerCase();
		const byId = new Map<string, RegisteredShortcut>();
		for (const entry of entries) byId.set(entry.id, entry);

		const grouped = new Map<ShortcutGroup, RegisteredShortcut[]>();
		for (const entry of byId.values()) {
			if (entry.hidden) continue;
			if (keyword) {
				const keys = entry.keysDisplay ?? formatKeys(entry.keys);
				const haystack = [
					entry.label,
					entry.description ?? "",
					entry.group,
					keys.join(" "),
				]
					.join(" ")
					.toLowerCase();
				if (!haystack.includes(keyword)) continue;
			}
			const list = grouped.get(entry.group) ?? [];
			list.push(entry);
			grouped.set(entry.group, list);
		}
		return GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => ({
			title: g,
			items: grouped.get(g) as RegisteredShortcut[],
		}));
	}, [entries, deferredQuery]);

	const matched = groups.reduce((sum, g) => sum + g.items.length, 0);
	const filtering = deferredQuery.trim().length > 0;

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				title="键盘快捷键"
				description="下面是当前生效的全部快捷键。沙盒、对话等场景的快捷键会随对应视图出现或消失。"
			/>

			<div>
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="搜索快捷键"
					aria-label="搜索快捷键"
					autoComplete="off"
					spellCheck={false}
					className={cn(settingsInputClass, "rounded-xl px-4 py-2.5 text-sm")}
				/>
				{filtering && (
					<p className="mt-2 text-xs text-text-muted">
						{matched > 0
							? `匹配到 ${matched} 个快捷键`
							: "没有匹配的快捷键，换个关键词试试。"}
					</p>
				)}
			</div>

			{groups.map((group) => (
				<SettingsCardSection
					key={group.title}
					title={group.title}
					bodyClassName="px-5 py-1"
				>
					{group.items.map((entry) => (
						<ShortcutRow key={entry.id} entry={entry} />
					))}
				</SettingsCardSection>
			))}

			{!filtering && (
				<SettingsSectionCard>
					<div className="flex items-start gap-3.5 px-5 py-4">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warm-200 text-text-secondary">
							<Command className="h-4 w-4" strokeWidth={1.5} />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm leading-relaxed text-text-secondary">
								命令面板（{modKey}+K）是访问绝大多数功能的最快方式 ——
								新建项目、切换主题、跳转到任意设置 tab、唤起终端等都能直接搜索。
							</p>
							<button
								type="button"
								onClick={() => shortcutRegistry.openCheatSheet()}
								className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border bg-warm-200 px-3.5 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-warm-300 active:scale-[0.98]"
							>
								<SquareSlash className="h-3.5 w-3.5" strokeWidth={1.5} />
								打开速查表（{modKey}+/）
							</button>
						</div>
					</div>
				</SettingsSectionCard>
			)}
		</SettingsPageContainer>
	);
}
