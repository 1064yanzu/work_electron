import {
	ChevronRight,
	FileText,
	FileType,
	Folder,
	Settings2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useFoldersQuery,
	useOutputAssetsQuery,
	useProjectsQuery,
	useSourcesQuery,
} from "@/features/workspace/queries";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useMouseDrag } from "@/hooks/mouse-drag";
import { cn } from "@/lib/utils";
import { buildFolderTree } from "./folder-tree";

export function ResourcesSidebar({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	const { projectId, folderId, setProjectId, setFolderId, openDoc } =
		useWorkspace();
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const { startDrag } = useMouseDrag();

	const projectsQuery = useProjectsQuery(true);
	const foldersQuery = useFoldersQuery({ enabled: !!projectId, projectId });
	const sourcesQuery = useSourcesQuery({
		enabled: !!projectId,
		projectId,
		folderId,
		limit: 200,
	});
	const outputsQuery = useOutputAssetsQuery({
		enabled: !!projectId,
		projectId,
	});

	const folderTree = useMemo(
		() => buildFolderTree(foldersQuery.data ?? []),
		[foldersQuery.data],
	);

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex h-12 items-center gap-2 border-b border-border/60 px-4">
				<div className="flex-1">
					<Select
						value={projectId ?? undefined}
						onValueChange={(value) => setProjectId(value)}
					>
						<SelectTrigger className="h-8 w-full text-xs">
							<SelectValue placeholder="选择项目" />
						</SelectTrigger>
						<SelectContent>
							{(projectsQuery.data ?? []).map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
							{projectsQuery.isLoading && (
								<div className="p-2 text-xs text-muted-foreground">加载中…</div>
							)}
						</SelectContent>
					</Select>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={onOpenSettings}
				>
					<Settings2 className="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea className="flex-1 p-3">
				<div className="space-y-4">
					<div>
						<div className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">
							文件夹
						</div>
						<div className="space-y-1">
							{projectId ? (
								<FolderTree
									nodes={folderTree}
									level={0}
									expanded={expanded}
									activeId={folderId}
									onToggle={(id) => {
										const next = new Set(expanded);
										next.has(id) ? next.delete(id) : next.add(id);
										setExpanded(next);
									}}
									onSelect={(id) => setFolderId(id === folderId ? null : id)}
								/>
							) : (
								<div className="px-2 py-6 text-xs text-muted-foreground">
									先选择一个项目
								</div>
							)}
						</div>
					</div>

					<div>
						<div className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">
							资料
						</div>
						<div className="space-y-1">
							{(sourcesQuery.data ?? []).map((s) => (
								<button
									type="button"
									key={s.id}
									onClick={() =>
										openDoc({ kind: "source", id: s.id, title: s.title })
									}
									onMouseDown={(e) => {
										if (e.button !== 0) return;
										startDrag(
											{ kind: "source", id: s.id, title: s.title },
											{ clientX: e.clientX, clientY: e.clientY },
										);
									}}
									className={cn(
										"group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors",
										"hover:bg-background/60",
									)}
								>
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
										<FileText className="h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium text-foreground">
											{s.title}
										</div>
										<div className="mt-0.5 truncate text-[10px] text-muted-foreground">
											{s.kind} · {s.category}
										</div>
									</div>
								</button>
							))}
							{sourcesQuery.isLoading && (
								<div className="px-2 py-2 text-xs text-muted-foreground">
									加载中…
								</div>
							)}
							{projectId &&
								!sourcesQuery.isLoading &&
								(sourcesQuery.data ?? []).length === 0 && (
									<div className="px-2 py-6 text-xs text-muted-foreground">
										暂无资料
									</div>
								)}
						</div>
					</div>

					<div>
						<div className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">
							产出
						</div>
						<div className="space-y-1">
							{(outputsQuery.data ?? []).map((o) => (
								<button
									type="button"
									key={o.id}
									onClick={() =>
										openDoc({ kind: "output", id: o.id, title: o.title })
									}
									className={cn(
										"group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors",
										"hover:bg-background/60",
									)}
								>
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
										<FileType className="h-4 w-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-medium text-foreground">
											{o.title}
										</div>
										<div className="mt-0.5 truncate text-[10px] text-muted-foreground">
											{o.output_type} · v{o.version}
										</div>
									</div>
								</button>
							))}
							{outputsQuery.isLoading && (
								<div className="px-2 py-2 text-xs text-muted-foreground">
									加载中…
								</div>
							)}
							{projectId &&
								!outputsQuery.isLoading &&
								(outputsQuery.data ?? []).length === 0 && (
									<div className="px-2 py-6 text-xs text-muted-foreground">
										暂无产出
									</div>
								)}
						</div>
					</div>
				</div>
			</ScrollArea>
		</div>
	);
}

function FolderTree({
	nodes,
	level,
	expanded,
	activeId,
	onToggle,
	onSelect,
}: {
	nodes: FolderTreeNode[];
	level: number;
	expanded: Set<string>;
	activeId: string | null;
	onToggle: (id: string) => void;
	onSelect: (id: string) => void;
}) {
	return (
		<>
			{nodes.map((n) => {
				const isExpanded = expanded.has(n.id);
				const hasChildren = n.children.length > 0;
				return (
					<div key={n.id}>
						<button
							type="button"
							className={cn(
								"group flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors",
								activeId === n.id
									? "bg-background/80"
									: "hover:bg-background/60",
							)}
							style={{ paddingLeft: 8 + level * 12 }}
							onClick={() => {
								if (hasChildren) onToggle(n.id);
								onSelect(n.id);
							}}
						>
							<div
								className={cn(
									"flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60",
									!hasChildren && "opacity-0 pointer-events-none",
								)}
							>
								<ChevronRight
									className={cn(
										"h-4 w-4 transition-transform",
										isExpanded && "rotate-90",
									)}
								/>
							</div>
							<Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 flex-1 truncate">{n.name}</div>
						</button>
						{hasChildren && isExpanded && (
							<div className="mt-1 space-y-1">
								<FolderTree
									nodes={n.children}
									level={level + 1}
									expanded={expanded}
									activeId={activeId}
									onToggle={onToggle}
									onSelect={onSelect}
								/>
							</div>
						)}
					</div>
				);
			})}
		</>
	);
}

type FolderTreeNode = { id: string; name: string; children: FolderTreeNode[] };
