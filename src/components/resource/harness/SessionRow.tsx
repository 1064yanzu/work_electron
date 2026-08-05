/**
 * 会话列表项 + 迁移目标选择菜单。
 *
 * 列表项展开后露出三个操作：迁移到…／查看转录／删除；
 * 「迁移到…」再展开 MigrateMenu，按「本机 CLI / Web 站点 / 本应用」分组。
 */
import {
	ArrowRightLeft,
	ChevronDown,
	Globe,
	ScrollText,
	Sparkles,
	Terminal,
	Trash2,
} from "lucide-react";
import type { HarnessSessionRow } from "../../../lib/api/harnessHub";
import { cn } from "../../../lib/utils";
import { RowAction } from "./controls";
import type { MigrateTarget } from "./types";
import { formatRelativeTime, sessionTitle, shortCwd } from "./utils";

export function SessionRow({
	session,
	harnessLabel,
	expanded,
	migrateOpen,
	targets,
	onToggle,
	onToggleMigrate,
	onPickTarget,
	onTranscript,
	onDelete,
}: {
	session: HarnessSessionRow;
	harnessLabel: string;
	expanded: boolean;
	migrateOpen: boolean;
	targets: MigrateTarget[];
	onToggle: () => void;
	onToggleMigrate: () => void;
	onPickTarget: (target: MigrateTarget) => void;
	onTranscript: () => void;
	onDelete: () => void;
}) {
	const cwd = shortCwd(session.cwd);
	return (
		<div
			className={cn(
				"group rounded-lg transition-all duration-200",
				expanded
					? "bg-surface ring-1 ring-border shadow-sm"
					: "hover:bg-warm-200/60 dark:hover:bg-cream-800/30",
			)}
		>
			<div
				role="button"
				tabIndex={0}
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onToggle();
					}
				}}
				className="w-full flex items-start gap-2 px-3 py-2.5 text-left cursor-pointer"
			>
				{session.status === "active" ? (
					<span className="relative flex w-1.5 h-1.5 shrink-0 mt-[7px]">
						<span className="absolute inline-flex w-full h-full rounded-full bg-success opacity-60 animate-ping" />
						<span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-success" />
					</span>
				) : (
					<span className="w-1.5 h-1.5 rounded-full bg-warm-400 dark:bg-cream-700 shrink-0 mt-[7px]" />
				)}

				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-1.5 min-w-0">
						<span className="text-[12.5px] font-medium text-text-primary truncate">
							{sessionTitle(session)}
						</span>
						<span className="shrink-0 px-1.5 py-px text-[9px] uppercase tracking-[0.12em] rounded-sm bg-terracotta/[0.12] text-terracotta leading-tight">
							{harnessLabel}
						</span>
					</div>
					<div className="flex items-center gap-1.5 mt-0.5 text-[10.5px] text-text-light min-w-0">
						{cwd && (
							<>
								<span className="truncate font-mono" title={session.cwd ?? ""}>
									{cwd}
								</span>
								<span className="text-text-light/50 shrink-0">·</span>
							</>
						)}
						<span className="shrink-0 tabular-nums">
							{session.message_count} 条
						</span>
						<span className="text-text-light/50 shrink-0">·</span>
						<span className="shrink-0">
							{formatRelativeTime(session.updated_at)}
						</span>
					</div>
				</div>

				<ChevronDown
					className={cn(
						"w-3 h-3 text-text-light transition-transform duration-200 shrink-0 mt-1",
						expanded && "rotate-180",
						!expanded && "opacity-0 group-hover:opacity-60",
					)}
				/>
			</div>

			{expanded && (
				<div className="px-3 pb-3 ml-3.5 space-y-2 animate-fade-in">
					{session.summary && (
						<p className="text-[11px] text-text-secondary leading-relaxed line-clamp-4">
							{session.summary}
						</p>
					)}
					<div className="flex items-center gap-1 pt-1.5 border-t border-border">
						<RowAction
							icon={<ArrowRightLeft className="w-3 h-3" />}
							label="迁移到…"
							active={migrateOpen}
							onClick={onToggleMigrate}
						/>
						<RowAction
							icon={<ScrollText className="w-3 h-3" />}
							label="查看转录"
							onClick={onTranscript}
						/>
						<RowAction
							icon={<Trash2 className="w-3 h-3" />}
							label="删除"
							danger
							onClick={onDelete}
						/>
					</div>
					{migrateOpen && (
						<MigrateMenu targets={targets} onPick={onPickTarget} />
					)}
				</div>
			)}
		</div>
	);
}

// ============================================================
// 迁移目标选择
// ============================================================

export function MigrateMenu({
	targets,
	onPick,
}: {
	targets: MigrateTarget[];
	onPick: (target: MigrateTarget) => void;
}) {
	const groups: Array<{ title: string; items: MigrateTarget[] }> = [
		{
			title: "本机 CLI",
			items: targets.filter((item) => item.kind === "cli"),
		},
		{
			title: "Web 站点",
			items: targets.filter((item) => item.kind === "web"),
		},
		{
			title: "本应用",
			items: targets.filter((item) => item.kind === "app"),
		},
	].filter((group) => group.items.length > 0);

	return (
		<div className="rounded-xl bg-background dark:bg-cream-900/40 border border-border p-1.5 space-y-1.5 animate-fade-in">
			{groups.map((group) => (
				<div key={group.title}>
					<div className="px-2 pt-1 pb-1 text-[9px] font-semibold tracking-[0.18em] text-text-light uppercase">
						{group.title}
					</div>
					{group.items.map((item) => (
						<button
							key={`${item.kind}:${item.id}`}
							type="button"
							onClick={() => onPick(item)}
							className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11.5px] text-text-secondary hover:text-text-primary hover:bg-warm-200/70 dark:hover:bg-cream-800/40 transition duration-200"
						>
							<TargetIcon kind={item.kind} />
							<span className="truncate">{item.label}</span>
						</button>
					))}
				</div>
			))}
			{groups.length === 0 && (
				<p className="px-2 py-2 text-[11px] text-text-light">
					没有可迁移的目标：本机未检测到可启动的 CLI，Web 站点也都被禁用了。
				</p>
			)}
		</div>
	);
}

function TargetIcon({ kind }: { kind: MigrateTarget["kind"] }) {
	if (kind === "cli") return <Terminal className="w-3 h-3 shrink-0" />;
	if (kind === "web") return <Globe className="w-3 h-3 shrink-0" />;
	return <Sparkles className="w-3 h-3 shrink-0" />;
}

// ============================================================
