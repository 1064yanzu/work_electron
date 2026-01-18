import { formatDistanceToNow } from "date-fns";
import { BookOpen, FileText, Plus } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	useFoldersQuery,
	useOutputAssetsQuery,
	useProjectsQuery,
	useSourcesQuery,
} from "@/features/workspace/queries";
import { useWorkspace } from "@/features/workspace/workspace-context";

export function DashboardPanel({
	onOpenSettings,
	onCreateOutput,
}: {
	onOpenSettings: () => void;
	onCreateOutput: () => void;
}) {
	const { projectId, openDoc } = useWorkspace();
	const projectsQuery = useProjectsQuery(true);
	const foldersQuery = useFoldersQuery({ enabled: !!projectId, projectId });
	const sourcesQuery = useSourcesQuery({
		enabled: !!projectId,
		projectId,
		folderId: null,
		limit: 200,
	});
	const outputsQuery = useOutputAssetsQuery({
		enabled: !!projectId,
		projectId,
	});

	const project = useMemo(() => {
		return (projectsQuery.data ?? []).find((p) => p.id === projectId) ?? null;
	}, [projectId, projectsQuery.data]);

	const recentOutputs = useMemo(() => {
		const items = outputsQuery.data ?? [];
		return [...items].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
	}, [outputsQuery.data]);

	const recentSources = useMemo(() => {
		const items = sourcesQuery.data ?? [];
		return [...items].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
	}, [sourcesQuery.data]);

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
				<div>
					<div className="text-base font-semibold">
						{project ? project.name : "首页"}
					</div>
					<div className="mt-1 text-xs text-muted-foreground">
						{project ? "工作区概览与快捷入口" : "选择项目后查看概览"}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="secondary" onClick={onOpenSettings}>
						设置
					</Button>
					<Button onClick={onCreateOutput} disabled={!projectId}>
						<Plus className="mr-2 h-4 w-4" />
						新建产出
					</Button>
				</div>
			</div>

			<ScrollArea className="flex-1 px-6 py-6">
				<div className="grid grid-cols-3 gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">统计</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground">文件夹</div>
								<div className="font-semibold">
									{(foldersQuery.data ?? []).length}
								</div>
							</div>
							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground">资料</div>
								<div className="font-semibold">
									{(sourcesQuery.data ?? []).length}
								</div>
							</div>
							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground">产出</div>
								<div className="font-semibold">
									{(outputsQuery.data ?? []).length}
								</div>
							</div>
						</CardContent>
					</Card>

					<Card className="col-span-2">
						<CardHeader>
							<CardTitle className="text-sm">最近产出</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-2">
							{recentOutputs.length === 0 ? (
								<div className="col-span-2 text-sm text-muted-foreground">
									暂无产出
								</div>
							) : (
								recentOutputs.map((o) => (
									<button
										type="button"
										key={o.id}
										onClick={() =>
											openDoc({ kind: "output", id: o.id, title: o.title })
										}
										className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-left hover:bg-secondary/60"
									>
										<div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
											<FileText className="h-4 w-4 text-muted-foreground" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">
												{o.title}
											</div>
											<div className="mt-0.5 text-[11px] text-muted-foreground">
												{o.output_type} · v{o.version} · 更新于{" "}
												{formatDistanceToNow(new Date(o.updated_at), {
													addSuffix: true,
												})}
											</div>
										</div>
									</button>
								))
							)}
						</CardContent>
					</Card>

					<Card className="col-span-3">
						<CardHeader>
							<CardTitle className="text-sm">最近资料</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-3 gap-2">
							{recentSources.length === 0 ? (
								<div className="col-span-3 text-sm text-muted-foreground">
									暂无资料
								</div>
							) : (
								recentSources.map((s) => (
									<button
										type="button"
										key={s.id}
										onClick={() =>
											openDoc({ kind: "source", id: s.id, title: s.title })
										}
										className="flex items-start gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-left hover:bg-secondary/60"
									>
										<div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
											<BookOpen className="h-4 w-4 text-muted-foreground" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium">
												{s.title}
											</div>
											<div className="mt-0.5 text-[11px] text-muted-foreground">
												{s.kind} · {s.category}
											</div>
										</div>
									</button>
								))
							)}
						</CardContent>
					</Card>
				</div>
			</ScrollArea>
		</div>
	);
}
