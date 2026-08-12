// 快捷键速查表 — ⌘/ 唤起的全局 overlay
//
// 数据完全来自 shortcutRegistry（含 displayOnly 展示型条目），
// 注册什么就展示什么，与设置面板/命令面板共享同一事实源。

import { Keyboard, X } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import {
	formatKeys,
	shortcutRegistry,
	useShortcutRegistrySelector,
	type RegisteredShortcut,
	type ShortcutGroup,
} from "../../lib/shortcuts";
import { FocusTrap } from "./FocusTrap";

const GROUP_ORDER: ShortcutGroup[] = [
	"全局",
	"工作区",
	"对话",
	"沙盒",
	"面板与对话框",
];

function Kbd({ children }: { children: string }) {
	return (
		<kbd className="min-w-[22px] px-1.5 py-0.5 rounded-md text-xs font-medium text-center text-text-secondary bg-warm-200 border border-border shadow-[0_1px_0_0_var(--t-border)]">
			{children}
		</kbd>
	);
}

function ShortcutRow({ entry }: { entry: RegisteredShortcut }) {
	const keys = entry.keysDisplay ?? formatKeys(entry.keys);
	return (
		<div className="flex items-center justify-between gap-3 py-1.5">
			<span className="text-[12.5px] text-text-secondary truncate">
				{entry.label}
			</span>
			<span className="flex items-center gap-1 shrink-0">
				{keys.map((key, idx) => (
					<Kbd key={`${entry.id}-${idx}`}>{key}</Kbd>
				))}
			</span>
		</div>
	);
}

export function ShortcutCheatSheet() {
	const open = useShortcutRegistrySelector((s) => s.cheatSheetOpen);
	const entries = useShortcutRegistrySelector((s) => s.entries);

	const groups = useMemo(() => {
		if (!open) return [];
		// 同 id 只展示一份（scoped 重复注册时取后者），displayOnly 与可分发条目并列
		const byId = new Map<string, RegisteredShortcut>();
		for (const entry of entries) byId.set(entry.id, entry);
		const grouped = new Map<ShortcutGroup, RegisteredShortcut[]>();
		for (const entry of byId.values()) {
			if (entry.hidden) continue;
			const list = grouped.get(entry.group) ?? [];
			list.push(entry);
			grouped.set(entry.group, list);
		}
		return GROUP_ORDER.filter((g) => grouped.has(g)).map((g) => ({
			title: g,
			items: grouped.get(g) as RegisteredShortcut[],
		}));
	}, [open, entries]);

	if (!open) return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[9980] flex items-center justify-center p-6"
			role="presentation"
			onClick={() => shortcutRegistry.closeCheatSheet()}
		>
			<div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-150" />
			<FocusTrap
				active
				onEscape={() => shortcutRegistry.closeCheatSheet()}
				className="relative w-full max-w-2xl max-h-[78vh] overflow-hidden flex flex-col rounded-2xl border border-border bg-surface shadow-bai-pop animate-in fade-in zoom-in-95 duration-150"
				role="dialog"
				aria-modal="true"
				aria-label="快捷键速查表"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
					<div className="flex items-center gap-2 text-text-primary">
						<Keyboard className="w-4 h-4" strokeWidth={1.5} />
						<span className="text-[13.5px] font-semibold">快捷键速查表</span>
					</div>
					<button
						type="button"
						onClick={() => shortcutRegistry.closeCheatSheet()}
						className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-warm-200 transition-colors"
						aria-label="关闭速查表"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</div>

				<div className="flex-1 overflow-y-auto px-5 py-4">
					<div className="columns-1 sm:columns-2 gap-8 [column-fill:balance]">
						{groups.map((group) => (
							<section
								key={group.title}
								className="break-inside-avoid mb-5"
								aria-label={group.title}
							>
								<h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted mb-1.5">
									{group.title}
								</h4>
								<div className="divide-y divide-border/60">
									{group.items.map((entry) => (
										<ShortcutRow key={entry.id} entry={entry} />
									))}
								</div>
							</section>
						))}
					</div>
				</div>

				<div className="px-5 py-2.5 border-t border-border text-xs text-text-muted shrink-0">
					按 Esc 关闭 · 快捷键详情见 设置 → 键盘快捷键
				</div>
			</FocusTrap>
		</div>,
		document.body,
	);
}
