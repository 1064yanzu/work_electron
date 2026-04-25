import { CheckCircle2, Circle, Clock, FileText } from "lucide-react";
import type { OutputAsset } from "../../../types";
import {
	formatDocumentDate,
	getOutputTypeLabel,
	getScopeBadge,
} from "./documentListMeta";
import { cn } from "../../../lib/utils";

interface DocumentGridCardProps {
	output: OutputAsset;
	isManaging: boolean;
	checked: boolean;
	onToggleManageSelection: (id: string) => void;
	onOpen: (output: OutputAsset) => void | Promise<void>;
}

export function DocumentGridCard({
	output,
	isManaging,
	checked,
	onToggleManageSelection,
	onOpen,
}: DocumentGridCardProps) {
	const scopeBadge = getScopeBadge(output.scope);

	return (
		<article
			className={cn(
				"doc-card relative rounded-2xl border p-4 sm:p-5 bg-surface/95/78",
				"border-border/75/70 shadow-[0_6px_24px_-16px_rgba(0,0,0,0.22)]",
				"transition-all duration-200 ease-out",
				"hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-[0_18px_36px_-24px_rgba(0,0,0,0.30)] hover:-translate-y-1",
				checked &&
					"ring-2 ring-primary/35 border-primary/45 dark:border-primary/40 bg-primary/[0.04] dark:bg-primary/[0.12]",
			)}
		>
			{isManaging ? (
				<button
					type="button"
					onClick={() => onToggleManageSelection(output.id)}
					className="focus-ring absolute left-3 top-3 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-text-secondary dark:text-zinc-200 bg-surface/90/90 hover:bg-warm-200 dark:hover:bg-zinc-700 border border-border"
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
				className={cn(
					"focus-ring w-full text-left rounded-xl transition-colors",
					isManaging ? "cursor-default" : "cursor-pointer",
					isManaging ? "pl-12" : "",
				)}
				disabled={isManaging}
			>
				<div className="flex items-start justify-between gap-3 mb-3">
					<div className="h-11 w-11 rounded-xl border border-border/80/70 bg-warm-200/75/72 inline-flex items-center justify-center text-text-secondary">
						<FileText className="w-5 h-5" />
					</div>
					<div className="flex items-center flex-wrap justify-end gap-1.5">
						<span
							className={cn(
								"inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium",
								scopeBadge.className,
							)}
						>
							{scopeBadge.label}
						</span>
						<span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-medium text-text-secondary bg-warm-200 border border-border/80/70">
							{getOutputTypeLabel(output.output_type)}
						</span>
					</div>
				</div>

				<h3 className="text-[15px] font-semibold leading-6 text-text-primary line-clamp-2 min-h-[3rem]">
					{output.title || "无标题文档"}
				</h3>

				{(output.tags || []).length > 0 ? (
					<div className="mt-3 flex items-center gap-1.5 flex-wrap">
						{(output.tags || []).slice(0, 3).map((tag) => (
							<span
								key={`${output.id}-grid-tag-${tag}`}
								className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] text-text-secondary dark:text-zinc-200 bg-warm-200/90 dark:bg-zinc-700/75 border border-border/80 dark:border-zinc-600/70"
							>
								#{tag}
							</span>
						))}
					</div>
				) : null}

				<div className="mt-4 pt-3 border-t border-border/70/70 inline-flex items-center gap-1.5 text-xs text-text-secondary">
					<Clock className="w-3.5 h-3.5" />
					{formatDocumentDate(output.updated_at)}
				</div>
			</button>
		</article>
	);
}
