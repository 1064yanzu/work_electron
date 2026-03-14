/**
 * ModelSelectorDropdown — 模型选择下拉菜单
 * 从 codingRuntimeStore 读取模型目录，支持 fallback 默认列表
 */
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { Check, PenLine, Sparkles } from "lucide-react";
import { DropdownPortal } from "../ui/DropdownPortal";
import { useBackendCapabilities } from "../../hooks/useBackendCapabilities";
import { formatModelName } from "../../lib/coding/modelUtils";
import { FALLBACK_MODEL_CATALOG } from "../../lib/coding/codingSettings";
import {
	executeCodingCommand,
	type CommandContext,
} from "../../lib/coding/codingCommandExecutor";
import { useCodingThreadSelector } from "../../lib/stores/codingThreadStore";
import { useCodingWorkspaceSelector } from "../../lib/stores/codingWorkspaceStore";
import { toast } from "../ui/Toast";

interface ModelSelectorDropdownProps {
	anchorRef: RefObject<HTMLElement | null>;
	open: boolean;
	onClose: () => void;
}

export function ModelSelectorDropdown({
	anchorRef,
	open,
	onClose,
}: ModelSelectorDropdownProps) {
	const { backend, modelCatalog, defaultModel } = useBackendCapabilities();
	const activeThread = useCodingThreadSelector((s) =>
		s.activeThreadId ? s.threads.find((t) => t.id === s.activeThreadId) : null,
	);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const [showCustomInput, setShowCustomInput] = useState(false);
	const [customModel, setCustomModel] = useState("");
	const customInputRef = useRef<HTMLInputElement>(null);

	const currentModel = activeThread?.model ?? defaultModel;

	const models = useMemo(() => {
		if (modelCatalog.length > 0) return modelCatalog;
		return FALLBACK_MODEL_CATALOG[backend] ?? [];
	}, [modelCatalog, backend]);

	const handleSelect = useCallback(
		async (model: string) => {
			const ctx: CommandContext = {
				threadId: activeThreadId,
				projectPath,
			};
			const result = await executeCodingCommand("set_model", ctx, { model });
			if (!result.success && result.error) {
				toast.error(result.error);
			} else if (result.message) {
				toast.success(result.message);
			}
			onClose();
		},
		[activeThreadId, projectPath, onClose],
	);

	const handleCustomSubmit = useCallback(() => {
		const trimmed = customModel.trim();
		if (!trimmed) return;
		setShowCustomInput(false);
		setCustomModel("");
		void handleSelect(trimmed);
	}, [customModel, handleSelect]);

	return (
		<DropdownPortal
			anchorRef={anchorRef}
			open={open}
			onClose={onClose}
			placement="top-start"
			minWidth={200}
		>
			<div className="rounded-xl border border-black/[0.06] bg-white shadow-lg dark:border-white/[0.08] dark:bg-zinc-800">
				<div className="px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04]">
					<span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
						模型
					</span>
				</div>
				<div className="py-1 max-h-[280px] overflow-y-auto">
					{models.map((model) => {
						const isActive = model === currentModel;
						return (
							<button
								key={model}
								onClick={() => handleSelect(model)}
								className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
									isActive
										? "bg-[#D96C46]/8 text-[#D96C46]"
										: "text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
								}`}
							>
								<Sparkles className="h-3.5 w-3.5 shrink-0 opacity-50" />
								<span className="flex-1 truncate">
									{formatModelName(model)}
								</span>
								{isActive && (
									<Check className="h-3.5 w-3.5 shrink-0 text-[#D96C46]" />
								)}
							</button>
						);
					})}
					{models.length === 0 && (
						<div className="px-3 py-4 text-center text-xs text-zinc-400">
							暂无可用模型
						</div>
					)}
				</div>
				<div className="border-t border-black/[0.04] dark:border-white/[0.04]">
					{showCustomInput ? (
						<div className="flex items-center gap-2 px-3 py-2">
							<input
								ref={customInputRef}
								value={customModel}
								onChange={(e) => setCustomModel(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleCustomSubmit();
									} else if (e.key === "Escape") {
										setShowCustomInput(false);
										setCustomModel("");
									}
								}}
								autoFocus
								placeholder="输入模型名称..."
								className="flex-1 min-w-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none transition-colors focus:border-[#D96C46]/40 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 font-mono"
							/>
							<button
								onClick={handleCustomSubmit}
								disabled={!customModel.trim()}
								className="shrink-0 rounded-lg bg-[#D96C46] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C45D3A] disabled:opacity-40"
							>
								确认
							</button>
						</div>
					) : (
						<button
							onClick={() => {
								setShowCustomInput(true);
								requestAnimationFrame(() => customInputRef.current?.focus());
							}}
							className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-500 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
						>
							<PenLine className="h-3.5 w-3.5 shrink-0" />
							<span>自定义模型...</span>
						</button>
					)}
				</div>
			</div>
		</DropdownPortal>
	);
}
