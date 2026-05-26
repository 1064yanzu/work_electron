/**
 * Design 源代码视图 — Monaco 包装。
 *
 * 读 work_dir 下的文件,根据 editable 切只读/可写。
 * Cmd+S 保存通过 design_write_work_dir_file IPC(在 Phase 7 接通)。
 *
 * Monaco 已经在 MonacoEditor.tsx 内通过 lazy import 处理,这里直接复用。
 */
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	designReadWorkDirFile,
	designWriteWorkDirFile,
} from "../../../lib/api/design";
import { designPreviewStore } from "../../../lib/stores/designPreviewStore";
import {
	getMonacoLanguage,
	MonacoEditor,
} from "../../sandbox/workspace/MonacoEditor";
import { toast } from "../../ui/Toast";

interface DesignSourceViewProps {
	sessionId: string;
	relativePath: string;
	editable: boolean;
	theme?: "light" | "dark";
}

export function DesignSourceView({
	sessionId,
	relativePath,
	editable,
	theme = "light",
}: DesignSourceViewProps) {
	const [content, setContent] = useState<string>("");
	const [originalContent, setOriginalContent] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const ext = (() => {
		const i = relativePath.lastIndexOf(".");
		return i === -1 ? "" : relativePath.slice(i + 1);
	})();
	const language = getMonacoLanguage(ext);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				setLoading(true);
				setError(null);
				const r = await designReadWorkDirFile({
					session_id: sessionId,
					relative_path: relativePath,
					mode: "text",
				});
				if (cancelled) return;
				const text = r.content ?? "";
				setContent(text);
				setOriginalContent(text);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [sessionId, relativePath]);

	const handleSave = useCallback(async () => {
		if (!editable) return;
		if (content === originalContent) return;
		try {
			setSaving(true);
			await designWriteWorkDirFile({
				session_id: sessionId,
				relative_path: relativePath,
				content,
			});
			setOriginalContent(content);
			designPreviewStore.bumpRefreshKey();
			const name = relativePath.includes("/")
				? relativePath.slice(relativePath.lastIndexOf("/") + 1)
				: relativePath;
			toast.success(`已保存 ${name}`);
		} catch (e) {
			toast.error(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setSaving(false);
		}
	}, [editable, content, originalContent, sessionId, relativePath]);

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center text-xs text-text-muted gap-2">
				<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
				加载中…
			</div>
		);
	}
	if (error) {
		return (
			<div className="h-full flex items-center justify-center text-xs text-text-muted px-6 text-center leading-relaxed">
				{error}
			</div>
		);
	}

	const dirty = content !== originalContent;

	return (
		<div className="h-full w-full flex flex-col bg-background">
			{editable ? (
				<div className="h-7 px-3 flex items-center justify-between text-[11px] text-text-muted bg-cream-200/40 border-b border-border">
					<span className="truncate">
						{relativePath}
						{dirty ? <span className="text-primary ml-1">●</span> : null}
					</span>
					<span className="flex items-center gap-2">
						<span>编辑模式 · Cmd+S 保存</span>
						{saving ? (
							<Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.6} />
						) : null}
					</span>
				</div>
			) : null}
			<div className="flex-1 min-h-0">
				<MonacoEditor
					value={content}
					language={language}
					path={`design://${sessionId}/${relativePath}`}
					theme={theme === "dark" ? "vs-dark" : "vs"}
					readOnly={!editable}
					onChange={(v) => setContent(v ?? "")}
					onSave={handleSave}
					minimap={false}
				/>
			</div>
		</div>
	);
}
