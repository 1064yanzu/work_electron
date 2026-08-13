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
				"rounded-xl border border-border/70 bg-surface/70 p-2.5",
				className,
			)}
		>
			<div className="text-xs font-semibold tracking-wide text-text-muted uppercase mb-2">
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
						className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
					>
						<Eye className="w-3.5 h-3.5" />
						预览文件
					</button>
				</div>
			) : null}

			{input && Object.keys(input).length > 0 ? (
				<Section title="输入">
					<div className="space-y-1.5">
						{Object.entries(input).map(([key, value]) => (
							<div key={key} className="text-xs leading-relaxed">
								<div className="text-text-muted">{key}</div>
								<div className="mt-1 rounded-lg bg-warm-200/70 p-2 text-text-secondary break-all whitespace-pre-wrap">
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
				<Section title="错误" className="border-error/30 bg-error/8">
					<div className="text-xs text-error whitespace-pre-wrap">{error}</div>
				</Section>
			) : null}

			{outputNode ? <Section title="输出">{outputNode}</Section> : null}
		</div>
	);
}
