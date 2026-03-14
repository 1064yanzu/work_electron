/**
 * 外部线程来源标签
 * 用于在线程列表中标识线程来源（Codex CLI / Claude Code CLI）
 */

export type ExternalBadgeSource = "codex-cli" | "claude-code-cli" | "local";

interface ExternalThreadBadgeProps {
	source: ExternalBadgeSource;
}

const badgeConfig: Record<
	Exclude<ExternalBadgeSource, "local">,
	{ label: string; classes: string }
> = {
	"codex-cli": {
		label: "Codex",
		classes:
			"bg-emerald-50 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
	},
	"claude-code-cli": {
		label: "Claude",
		classes:
			"bg-blue-50 text-blue-600 ring-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20",
	},
};

export function ExternalThreadBadge({ source }: ExternalThreadBadgeProps) {
	if (source === "local") return null;

	const config = badgeConfig[source];
	if (!config) return null;

	return (
		<span
			className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1 ring-inset ${config.classes}`}
		>
			{config.label}
		</span>
	);
}
