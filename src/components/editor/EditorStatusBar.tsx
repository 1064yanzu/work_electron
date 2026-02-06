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
		<div className="shrink-0 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between text-xs text-zinc-400">
			<div className="inline-flex items-center gap-2">
				<span>{editorContentLength} 字</span>
				<span className="text-zinc-300 dark:text-zinc-600">·</span>
				<span>
					{Math.max(1, Math.ceil(editorContentLength / 400))} 分钟阅读
				</span>
			</div>
			<div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
				{isSaving ? (
					<>
						<Loader2 className="w-3 h-3 animate-spin" />
						<span>保存中…</span>
					</>
				) : hasUnsavedChanges ? (
					<>
						<span className="w-2 h-2 rounded-full bg-amber-400" />
						<span>待保存</span>
					</>
				) : (
					<>
						<Check className="w-3 h-3 text-green-500" />
						<span>
							{lastSavedLabel ? `已保存 · ${lastSavedLabel}` : "已保存"}
						</span>
					</>
				)}
			</div>
		</div>
	);
}
