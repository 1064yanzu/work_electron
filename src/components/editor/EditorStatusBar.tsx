import { Check, Loader2 } from "lucide-react";

interface EditorStatusBarProps {
	editorContentLength: number;
	isSaving: boolean;
	hasUnsavedChanges: boolean;
	lastSavedLabel: string;
}

export function EditorStatusBar({
	editorContentLength,
	isSaving,
	hasUnsavedChanges,
	lastSavedLabel,
}: EditorStatusBarProps) {
	return (
		<footer className="doc-toolbar shrink-0 px-4 py-2.5 border-t border-border/70 flex items-center justify-between text-xs">
			<div className="inline-flex items-center gap-2 text-text-secondary">
				<span>{editorContentLength} 字</span>
				<span className="text-text-light">·</span>
				<span>
					{Math.max(1, Math.ceil(editorContentLength / 400))} 分钟阅读
				</span>
			</div>

			<div
				className="inline-flex items-center gap-1.5 text-text-secondary dark:text-zinc-200"
				role="status"
				aria-live="polite"
			>
				{isSaving ? (
					<>
						<Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
						<span>保存中…</span>
					</>
				) : hasUnsavedChanges ? (
					<>
						<span className="w-2 h-2 rounded-full bg-primary" />
						<span>待保存</span>
					</>
				) : (
					<>
						<Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
						<span>
							{lastSavedLabel ? `已保存 · ${lastSavedLabel}` : "已保存"}
						</span>
					</>
				)}
			</div>
		</footer>
	);
}
