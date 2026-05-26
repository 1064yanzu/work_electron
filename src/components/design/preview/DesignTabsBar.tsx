/**
 * Design 预览界面 tabs 行(h-11)。
 *
 * 第一个 tab 始终是「设计文件」(sticky,不可关闭),后面跟用户已打开的文件 tab(可关闭)。
 * 切到设计文件 tab 时,中栏主体显示 inline 的 DesignFilesPanel。
 * 切到具体文件 tab 时,主体根据 viewerMode 显示预览或源代码。
 */
import { File, FileCode, FileText, FolderTree, Image, X } from "lucide-react";
import { useMemo } from "react";
import { DESIGN_FILES_TAB } from "./constants";

interface DesignTabsBarProps {
	activeTab: string;
	openTabs: string[];
	onActivate: (tab: string) => void;
	onClose: (relative: string) => void;
}

function fileIcon(name: string) {
	const lower = name.toLowerCase();
	if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(lower)) return Image;
	if (/\.(html?|md|markdown|txt)$/i.test(lower)) return FileText;
	if (/\.(css|m?js|cjs|tsx?|jsx?|json|ya?ml|toml)$/i.test(lower))
		return FileCode;
	return File;
}

function baseName(rel: string) {
	const i = rel.lastIndexOf("/");
	return i === -1 ? rel : rel.slice(i + 1);
}

export function DesignTabsBar({
	activeTab,
	openTabs,
	onActivate,
	onClose,
}: DesignTabsBarProps) {
	const tabs = useMemo(
		() => openTabs.map((rel) => ({ rel, name: baseName(rel) })),
		[openTabs],
	);

	return (
		<div className="h-11 px-2.5 flex items-center gap-1 border-b border-border bg-bg-surface overflow-x-auto select-none">
			<button
				type="button"
				onClick={() => onActivate(DESIGN_FILES_TAB)}
				className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md text-[12px] transition-colors shrink-0 ${
					activeTab === DESIGN_FILES_TAB
						? "bg-cream-300 text-text-primary"
						: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
				}`}
				title="设计文件总览"
			>
				<FolderTree className="w-3.5 h-3.5" strokeWidth={1.6} />
				设计文件
			</button>
			{tabs.map((t) => {
				const Icon = fileIcon(t.name);
				const active = activeTab === t.rel;
				return (
					<div
						key={t.rel}
						className={`group inline-flex items-center gap-1.5 h-[26px] pl-2.5 pr-1 rounded-md text-[12px] cursor-pointer transition-colors shrink-0 ${
							active
								? "bg-cream-300 text-text-primary"
								: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
						}`}
						onClick={() => onActivate(t.rel)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onActivate(t.rel);
						}}
						role="tab"
						aria-selected={active}
						tabIndex={0}
						title={t.rel}
					>
						<Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} />
						<span className="truncate max-w-[160px]">{t.name}</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onClose(t.rel);
							}}
							className="p-0.5 rounded hover:bg-warm-200 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
							aria-label={`关闭 ${t.name}`}
						>
							<X className="w-3 h-3" />
						</button>
					</div>
				);
			})}
		</div>
	);
}
