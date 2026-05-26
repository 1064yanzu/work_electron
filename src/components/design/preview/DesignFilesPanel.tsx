/**
 * 设计稿工作目录文件树。
 * 直接平铺为「父目录 → 子文件」的两级分组,深层文件用相对路径完整显示——
 * AI 生成的工程一般不会嵌得很深,几十个文件平铺已经够看。
 *
 * 后端通过 design_list_work_dir_files (走 *_safe handler) 列出 work_dir 下的
 * 全部条目,返回相对路径 + 大小 + mtime。
 */
import { File, FileText, FolderTree, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	designListWorkDirFiles,
	type DesignWorkDirEntry,
} from "../../../lib/api/design";

interface DesignFilesPanelProps {
	sessionId: string;
	activePath: string | null;
	onOpenFile: (relative: string) => void;
	onClose?: () => void;
	/**
	 * inline 模式:嵌在主体而不是右侧侧栏。
	 * - 占满父容器宽度,无左边框,无关闭按钮
	 * - 用网格展示而非紧凑列表
	 */
	inline?: boolean;
}

function formatSize(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(name: string) {
	if (/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i.test(name)) return FileText;
	if (/\.(html?|css|m?js|tsx?|json|ya?ml|toml|md|txt)$/i.test(name))
		return FileText;
	return File;
}

export function DesignFilesPanel({
	sessionId,
	activePath,
	onOpenFile,
	onClose,
	inline = false,
}: DesignFilesPanelProps) {
	const [entries, setEntries] = useState<DesignWorkDirEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				setLoading(true);
				setError(null);
				const list = await designListWorkDirFiles(sessionId);
				if (cancelled) return;
				setEntries(list);
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
	}, [sessionId, reloadKey]);

	const groups = useMemo(() => {
		const files = entries.filter((e) => !e.is_dir);
		const map = new Map<string, DesignWorkDirEntry[]>();
		for (const e of files) {
			const sep = e.relative.lastIndexOf("/");
			const dir = sep === -1 ? "." : e.relative.slice(0, sep);
			const arr = map.get(dir) ?? [];
			arr.push(e);
			map.set(dir, arr);
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([dir, items]) => ({
				dir,
				items: items.sort((a, b) => a.name.localeCompare(b.name)),
			}));
	}, [entries]);

	return (
		<div
			className={
				inline
					? "w-full h-full flex flex-col bg-background"
					: "w-72 h-full flex flex-col border-l border-border bg-background"
			}
		>
			<header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-surface">
				<div className="flex items-center gap-1.5 min-w-0">
					<FolderTree
						className="w-3.5 h-3.5 text-primary shrink-0"
						strokeWidth={1.5}
					/>
					<span className="text-[11px] uppercase tracking-wider text-text-muted shrink-0">
						work dir
					</span>
					<span className="text-xs text-text-muted truncate">
						· {entries.filter((e) => !e.is_dir).length} files
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setReloadKey((k) => k + 1)}
						className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
						title="刷新"
					>
						<RefreshCw className="w-3 h-3" strokeWidth={1.5} />
					</button>
					{onClose && !inline ? (
						<button
							type="button"
							onClick={onClose}
							className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
							title="关闭"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					) : null}
				</div>
			</header>
			<div className="flex-1 min-h-0 overflow-y-auto py-1.5">
				{loading ? (
					<div className="px-3 py-4 text-xs text-text-muted">加载中…</div>
				) : error ? (
					<div className="px-3 py-4 text-xs text-text-muted leading-relaxed">
						{error}
					</div>
				) : groups.length === 0 ? (
					<div className="px-3 py-4 text-xs text-text-muted">工作目录为空</div>
				) : (
					groups.map(({ dir, items }) => (
						<div key={dir} className="mb-1.5">
							<div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-muted/80 select-none">
								{dir === "." ? "/" : dir}
							</div>
							<ul>
								{items.map((entry) => {
									const Icon = iconFor(entry.name);
									const active = entry.relative === activePath;
									return (
										<li key={entry.relative}>
											<button
												type="button"
												onClick={() => onOpenFile(entry.relative)}
												className={`w-full flex items-center gap-1.5 px-3 py-1 text-[12px] transition-colors text-left ${
													active
														? "bg-primary/10 text-primary"
														: "text-text-primary hover:bg-warm-200/60"
												}`}
												title={entry.relative}
											>
												<Icon className="w-3 h-3 shrink-0" strokeWidth={1.5} />
												<span className="flex-1 truncate">{entry.name}</span>
												<span className="text-[10px] text-text-muted shrink-0">
													{formatSize(entry.size)}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					))
				)}
			</div>
		</div>
	);
}
