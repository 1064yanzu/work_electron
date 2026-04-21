import { Copy, ClipboardPaste, TextSelect, RotateCcw } from "lucide-react";
import { createElement } from "react";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";

/**
 * 构建通用区域默认右键菜单
 * 用于非特殊区域的基础操作：复制、粘贴、全选、刷新
 */
export function buildDefaultContextMenu(): ContextMenuItem[] {
	const selection = window.getSelection()?.toString() || "";
	const hasSelection = selection.trim().length > 0;

	return [
		{
			label: "复制",
			icon: createElement(Copy, { className: "w-4 h-4" }),
			onClick: () => {
				if (hasSelection) {
					void navigator.clipboard.writeText(selection);
				}
			},
			disabled: !hasSelection,
			shortcut: "⌘C",
		},
		{
			label: "粘贴",
			icon: createElement(ClipboardPaste, { className: "w-4 h-4" }),
			onClick: () => {
				const active = document.activeElement;
				if (
					active instanceof HTMLInputElement ||
					active instanceof HTMLTextAreaElement
				) {
					void navigator.clipboard.readText().then((text) => {
						document.execCommand("insertText", false, text);
					});
				}
			},
			shortcut: "⌘V",
		},
		{
			label: "全选",
			icon: createElement(TextSelect, { className: "w-4 h-4" }),
			onClick: () => {
				const active = document.activeElement;
				if (
					active instanceof HTMLInputElement ||
					active instanceof HTMLTextAreaElement
				) {
					active.select();
				} else {
					document.execCommand("selectAll");
				}
			},
			shortcut: "⌘A",
		},
		{ separator: true, label: "", onClick: () => {} },
		{
			label: "刷新页面",
			icon: createElement(RotateCcw, { className: "w-4 h-4" }),
			onClick: () => {
				window.location.reload();
			},
			shortcut: "⌘R",
		},
	];
}
