/**
 * 终端标签栏
 * 管理多个终端标签的切换、创建和关闭
 */

import { Plus, X, Terminal as TerminalIcon } from "lucide-react";
import { useCallback } from "react";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";

export function TerminalTabBar() {
	const terminals = useTerminalStoreSelector((s) => s.terminals);
	const activeId = useTerminalStoreSelector((s) => s.activeTerminalId);

	const handleNewTerminal = useCallback(() => {
		terminalStore.createTerminal();
	}, []);

	const handleClose = useCallback((e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		terminalStore.destroyTerminal(id);
	}, []);

	const handleSelect = useCallback((id: string) => {
		terminalStore.setActiveTerminal(id);
	}, []);

	return (
		<div className="flex items-center h-9 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 px-1 gap-0.5 overflow-x-auto">
			{terminals.map((t) => {
				const isActive = t.id === activeId;
				return (
					<button
						key={t.id}
						type="button"
						onClick={() => handleSelect(t.id)}
						className={`group flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 ${
							isActive
								? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
								: "text-zinc-500 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-zinc-800/40"
						}`}
					>
						<TerminalIcon className="w-3 h-3" />
						<span className="max-w-[100px] truncate">{t.name}</span>
						<button
							type="button"
							onClick={(e) => handleClose(e, t.id)}
							className="opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded p-0.5 transition-all cursor-pointer"
						>
							<X className="w-2.5 h-2.5" />
						</button>
					</button>
				);
			})}

			{/* 新建终端按钮 */}
			<button
				type="button"
				onClick={handleNewTerminal}
				className="flex items-center justify-center w-6 h-6 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer shrink-0"
				title="新建终端"
			>
				<Plus className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}
