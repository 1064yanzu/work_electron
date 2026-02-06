import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ToolCallDetailsPanelProps {
	canPreviewFile: boolean;
	onPreviewFile?: () => void;
	input?: Record<string, unknown>;
	error?: string;
	outputNode?: ReactNode;
}

function Section({
	title,
	children,
	className,
}: {
	title: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 bg-white/70 dark:bg-zinc-900/50 p-2.5",
				className,
			)}
		>
			<div className="text-[11px] font-semibold tracking-wide text-zinc-500 dark:text-zinc-400 uppercase mb-2">
				{title}
			</div>
			{children}
		</section>
	);
}

export function ToolCallDetailsPanel({
	canPreviewFile,
	onPreviewFile,
	input,
	error,
	outputNode,
}: ToolCallDetailsPanelProps) {
	return (
		<div className="ml-8 mt-2 space-y-2.5">
			{canPreviewFile ? (
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onPreviewFile}
						className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-2.5 py-1.5 text-[11px] font-medium hover:opacity-90 transition-opacity"
					>
						<Eye className="w-3.5 h-3.5" />
						预览文件
					</button>
				</div>
			) : null}

			{input && Object.keys(input).length > 0 ? (
				<Section title="Input">
					<div className="space-y-1.5">
						{Object.entries(input).map(([key, value]) => (
							<div key={key} className="text-[11px] leading-relaxed">
								<div className="text-zinc-500 dark:text-zinc-400">{key}</div>
								<div className="mt-1 rounded-md bg-zinc-100/70 dark:bg-zinc-800/60 p-2 text-zinc-700 dark:text-zinc-200 break-all whitespace-pre-wrap">
									{typeof value === "string"
										? value
										: JSON.stringify(value, null, 2)}
								</div>
							</div>
						))}
					</div>
				</Section>
			) : null}

			{error ? (
				<Section
					title="Error"
					className="border-red-300/70 dark:border-red-900/60 bg-red-50/60 dark:bg-red-900/20"
				>
					<div className="text-[11px] text-red-600 dark:text-red-300 whitespace-pre-wrap">
						{error}
					</div>
				</Section>
			) : null}

			{outputNode ? <Section title="Output">{outputNode}</Section> : null}
		</div>
	);
}
