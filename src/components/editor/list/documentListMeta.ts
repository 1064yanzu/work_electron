export type DocumentViewMode = "grid" | "list";

export interface ScopeBadgeMeta {
	label: string;
	className: string;
}

export function getScopeBadge(scope?: "global" | "project"): ScopeBadgeMeta {
	if (scope === "project") {
		return {
			label: "项目内",
			className:
				"bg-zinc-100 dark:bg-zinc-700/70 text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-600/70",
		};
	}

	return {
		label: "全局",
		className:
			"bg-primary/12 dark:bg-primary/24 text-primary border border-primary/25",
	};
}

export function formatDocumentDate(
	date: string | number | undefined | null,
): string {
	if (!date) return "未知日期";
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return "未知日期";
	return d.toLocaleDateString("zh-CN", {
		month: "short",
		day: "numeric",
	});
}

export function getOutputTypeLabel(type: string | undefined): string {
	if (!type) return "Article";
	return String(type)
		.replace(/_/g, " ")
		.replace(/\b\w/g, (s) => s.toUpperCase());
}

export function isInteractiveTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		target.isContentEditable
	);
}
