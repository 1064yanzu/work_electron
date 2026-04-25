import { CheckCircle2, Circle, Clock, FileText } from "lucide-react";
import type { OutputAsset } from "../../../types";
import {
	formatDocumentDate,
	getOutputTypeLabel,
	getScopeBadge,
} from "./documentListMeta";
import { cn } from "../../../lib/utils";

interface DocumentRowItemProps {
	output: OutputAsset;
	isManaging: boolean;
	checked: boolean;
	onToggleManageSelection: (id: string) => void;
	onOpen: (output: OutputAsset) => void | Promise<void>;
}

export function DocumentRowItem({
	output,
	isManaging,
	checked,
	onToggleManageSelection,
	onOpen,
}: DocumentRowItemProps) {
	const scopeBadge = getScopeBadge(output.scope);

	return (
		<article
			className={cn(
				"doc-card rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 bg-surface/95/78",
				"border-border/75/70",
				"transition-[box-shadow,border-color,background-color] duration-200",
				"hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.35)]",
				checked &&
					"ring-2 ring-primary/35 border-primary/45 dark:border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.12]",
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0 flex items-center gap-2.5 sm:gap-3">
					{isManaging ? (
						<button
							type="button"
							onClick={() => onToggleManageSelection(output.id)}
							className="focus-ring min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-text-secondary dark:text-zinc-200 bg-surface/90/90 hover:bg-warm-200 dark:hover:bg-zinc-700 border border-border"
							aria-label={checked ? "取消选择文档" : "选择文档"}
						>
							{checked ? (
								<CheckCircle2 className="w-5 h-5 text-primary" />
							) : (
								<Circle className="w-5 h-5" />
							)}
						</button>
					) : null}

					<button
						type="button"
						onClick={() => !isManaging && void onOpen(output)}
						disabled={isManaging}
						className={cn(
							"focus-ring min-w-0 text-left rounded-xl px-1.5 py-1 inline-flex items-center gap-3 transition-colors",
							isManaging ? "cursor-default" : "cursor-pointer",
						)}
					>
						<div className="h-10 w-10 rounded-xl border border-border/80/70 bg-warm-200/75/72 inline-flex items-center justify-center text-text-secondary shrink-0">
							<FileText className="w-4.5 h-4.5" />
						</div>

						<div className="min-w-0">
							<h3 className="text-[15px] font-semibold leading-6 text-text-primary truncate">
								{output.title || "无标题文档"}
							</h3>
							<div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
								<span className="inline-flex items-center gap-1">
									<Clock className="w-3.5 h-3.5" />
									{formatDocumentDate(output.updated_at)}
								</span>
								<span className="text-text-light">·</span>
								<span>{getOutputTypeLabel(output.output_type)}</span>
							</div>
						</div>
					</button>
				</div>

				<div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
					<span
						className={cn(
							"inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium",
							scopeBadge.className,
						)}
					>
						{scopeBadge.label}
					</span>
					{(output.tags || []).slice(0, 2).map((tag) => (
						<span
							key={`${output.id}-row-tag-${tag}`}
							className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] text-text-secondary dark:text-zinc-200 bg-warm-200/90 dark:bg-zinc-700/75 border border-border/80 dark:border-zinc-600/70"
						>
							#{tag}
						</span>
					))}
				</div>
			</div>
		</article>
	);
}
