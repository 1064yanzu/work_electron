import { Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { codingRuntimeStore, useCodingRuntimeSelector } from "../../lib/stores/codingRuntimeStore";
import { useCodingWorkspaceSelector } from "../../lib/stores/codingWorkspaceStore";
import { toast } from "../ui/Toast";

type MemoryTab = "workspace" | "rules" | "memory";

const TAB_LABELS: Record<MemoryTab, string> = {
	workspace: "workspace.md",
	rules: "rules.md",
	memory: "memory.md",
};

export function CodingMemoryPanel() {
	const projectPath = useCodingWorkspaceSelector((state) => state.projectPath);
	const workspaceMemory = useCodingRuntimeSelector((state) => state.workspaceMemory);
	const loading = useCodingRuntimeSelector((state) => state.loading);
	const [activeTab, setActiveTab] = useState<MemoryTab>("workspace");
	const [drafts, setDrafts] = useState<Record<MemoryTab, string>>({
		workspace: "",
		rules: "",
		memory: "",
	});
	const [savingTab, setSavingTab] = useState<MemoryTab | null>(null);

	useEffect(() => {
		if (!workspaceMemory) return;
		setDrafts({
			workspace: workspaceMemory.workspace,
			rules: workspaceMemory.rules,
			memory: workspaceMemory.memory,
		});
	}, [workspaceMemory]);

	const sources = useMemo(() => workspaceMemory?.sources ?? [], [workspaceMemory]);

	const handleSave = async () => {
		if (!projectPath) return;
		setSavingTab(activeTab);
		try {
			await codingRuntimeStore.saveWorkspaceMemory({
				projectPath,
				target: activeTab,
				content: drafts[activeTab],
			});
			toast.success(`${TAB_LABELS[activeTab]} 已保存`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setSavingTab(null);
		}
	};

	if (loading && !workspaceMemory) {
		return (
			<div className="flex h-full items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
			</div>
		);
	}

	if (!workspaceMemory) {
		return <div className="px-4 py-12 text-center text-xs text-zinc-400">当前项目还没有 workspace memory</div>;
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-black/[0.04] px-3 py-2 dark:border-white/[0.04]">
				<div className="flex items-center gap-2">
					{(["workspace", "rules", "memory"] as MemoryTab[]).map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`rounded-lg px-2.5 py-1.5 text-[11px] transition-colors ${activeTab === tab ? "bg-zinc-900 text-white dark:bg-white dark:text-black" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
						>
							{TAB_LABELS[tab]}
						</button>
					))}
					<button
						onClick={() => void handleSave()}
						disabled={savingTab !== null}
						className="ml-auto inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
					>
						{savingTab === activeTab ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
						保存
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-hidden">
				<textarea
					value={drafts[activeTab]}
					onChange={(event) =>
						setDrafts((current) => ({ ...current, [activeTab]: event.target.value }))
					}
					className="h-full w-full resize-none bg-transparent px-4 py-3 text-[12px] leading-6 text-zinc-800 outline-none dark:text-zinc-200"
				/>
			</div>
			<div className="border-t border-black/[0.04] px-3 py-2 dark:border-white/[0.04]">
				<div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">合并来源</div>
				<div className="max-h-24 space-y-1 overflow-y-auto">
					{sources.map((source) => (
						<div key={source.path} className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
							{source.label}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
