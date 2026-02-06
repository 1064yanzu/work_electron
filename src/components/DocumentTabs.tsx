// 文档标签栏组件 - 类似 Cursor/VS Code 的多标签文档切换

import { Circle, FileText, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "../lib/workspaceStore";

interface DocumentTabsProps {
	onNewDoc?: () => void;
	onCloseDoc?: (docId: string, dirty: boolean) => void;
}

export default function DocumentTabs({
	onNewDoc,
	onCloseDoc,
}: DocumentTabsProps) {
	const { openedDocs, activeDocId, docCache, setActiveDoc, closeDoc } =
		useWorkspaceStore();
	const tabsRef = useRef<HTMLDivElement>(null);

	// 当激活文档改变时，滚动到可见区域
	useEffect(() => {
		if (activeDocId && tabsRef.current) {
			const activeTab = tabsRef.current.querySelector(
				`[data-doc-id="${activeDocId}"]`,
			);
			if (activeTab) {
				activeTab.scrollIntoView({
					behavior: "smooth",
					block: "nearest",
					inline: "nearest",
				});
			}
		}
	}, [activeDocId]);

	// 键盘快捷键
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd/Ctrl + W 关闭当前标签
			if ((e.metaKey || e.ctrlKey) && e.key === "w") {
				e.preventDefault();
				if (activeDocId) {
					const doc = docCache[activeDocId];
					if (onCloseDoc) {
						onCloseDoc(activeDocId, doc?.dirty || false);
					} else {
						closeDoc(activeDocId);
					}
				}
			}

			// Cmd/Ctrl + 1-9 快速切换标签
			if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
				e.preventDefault();
				const index = parseInt(e.key) - 1;
				if (index < openedDocs.length) {
					setActiveDoc(openedDocs[index]);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [activeDocId, openedDocs, docCache, closeDoc, setActiveDoc, onCloseDoc]);

	const handleTabClick = (docId: string) => {
		setActiveDoc(docId);
	};

	const handleCloseClick = (e: React.MouseEvent, docId: string) => {
		e.stopPropagation();
		const doc = docCache[docId];
		if (onCloseDoc) {
			onCloseDoc(docId, doc?.dirty || false);
		} else {
			closeDoc(docId);
		}
	};

	if (openedDocs.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-sm border-b border-zinc-200/60 dark:border-zinc-800/60">
			{/* 标签列表 */}
			<div
				ref={tabsRef}
				className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
			>
				{openedDocs.map((docId) => {
					const doc = docCache[docId];
					const isActive = docId === activeDocId;

					return (
						<div
							key={docId}
							data-doc-id={docId}
							onClick={() => handleTabClick(docId)}
							className={`
                group flex items-center gap-2 px-3.5 py-2 cursor-pointer
                transition-all duration-150 min-w-[120px] max-w-[220px] mx-0.5 my-1 rounded-xl
                ${
									isActive
										? "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
										: "bg-transparent text-zinc-500 dark:text-zinc-500 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50 hover:text-zinc-700 dark:hover:text-zinc-300"
								}
              `}
						>
							{/* 文档图标 */}
							<FileText className="w-4 h-4 shrink-0 text-zinc-400" />

							{/* 文档标题 */}
							<span className="flex-1 text-sm font-medium truncate">
								{doc?.title || "未命名文档"}
							</span>

							{/* 脏标记 / 关闭按钮 */}
							<div className="shrink-0 w-4 h-4 flex items-center justify-center relative">
								{/* 脏标记：未保存时显示，悬停时隐藏 */}
								{doc?.dirty && (
									<Circle className="w-2 h-2 fill-blue-500 text-blue-500 group-hover:opacity-0 transition-opacity" />
								)}
								{/* 关闭按钮：始终存在，悬停时显示 */}
								<button
									onClick={(e) => handleCloseClick(e, docId)}
									className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all`}
								>
									<X className="w-3 h-3" />
								</button>
							</div>
						</div>
					);
				})}
			</div>

			{/* 新建文档按钮 */}
			{onNewDoc && (
				<button
					onClick={onNewDoc}
					className="shrink-0 p-2 mx-1 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50 transition-colors"
					title="新建文档 (Cmd+N)"
				>
					<Plus className="w-4 h-4" />
				</button>
			)}
		</div>
	);
}
