/**
 * CodingInputActions — 输入框附加功能栏
 * 包含：+ 附加按钮、模型选择器下拉菜单
 */
import { useState, useRef } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { useCodingThreadSelector } from '../../lib/stores/codingThreadStore';
import { formatModelName } from '../../lib/coding/modelUtils';
import { ModelSelectorDropdown } from './ModelSelectorDropdown';

interface CodingInputActionsProps {
	onAddFile?: () => void;
}

export function CodingInputActions({ onAddFile }: CodingInputActionsProps) {
	const activeThread = useCodingThreadSelector((s) =>
		s.activeThreadId ? s.threads.find((t) => t.id === s.activeThreadId) : null
	);

	const [showModelMenu, setShowModelMenu] = useState(false);
	const modelRef = useRef<HTMLButtonElement>(null);

	const modelLabel = activeThread?.model
		? formatModelName(activeThread.model)
		: '选择模型';

	return (
		<div className="flex items-center gap-1.5">
			{/* + 附加按钮 */}
			<button
				onClick={onAddFile}
				className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 transition-colors"
				title="附加文件"
			>
				<Plus className="h-4 w-4" />
			</button>

			{/* 模型选择器 */}
			<button
				ref={modelRef}
				onClick={() => setShowModelMenu(!showModelMenu)}
				className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
			>
				{modelLabel}
				<ChevronDown className={`h-3 w-3 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
			</button>

			{/* 模型选择下拉菜单 */}
			<ModelSelectorDropdown
				anchorRef={modelRef}
				open={showModelMenu}
				onClose={() => setShowModelMenu(false)}
			/>
		</div>
	);
}
