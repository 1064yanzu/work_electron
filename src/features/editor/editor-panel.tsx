import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { FileText, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPanel } from "@/features/dashboard/dashboard-panel";
import {
	createOutputAsset,
	deleteOutputAsset,
	updateOutputAsset,
} from "@/features/workspace/ipc-api";
import {
	useOutputAssetsQuery,
	useSourceDetailQuery,
} from "@/features/workspace/queries";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { cn } from "@/lib/utils";

export function EditorPanel({
	onOpenSettings,
}: {
	onOpenSettings: () => void;
}) {
	const queryClient = useQueryClient();
	const { projectId, activeDoc, openDocs, openDoc, closeDoc } = useWorkspace();

	const sourceId = activeDoc?.kind === "source" ? activeDoc.id : null;
	const detailQuery = useSourceDetailQuery({ enabled: !!sourceId, sourceId });

	const outputsQuery = useOutputAssetsQuery({
		enabled: !!projectId,
		projectId,
	});
	const activeOutput = useMemo(() => {
		if (activeDoc?.kind !== "output") return null;
		return (outputsQuery.data ?? []).find((o) => o.id === activeDoc.id) ?? null;
	}, [activeDoc, outputsQuery.data]);

	const createOutputMutation = useMutation({
		mutationFn: async () => {
			if (!projectId) throw new Error("请先选择项目");
			const result = await createOutputAsset({
				title: "未命名产出",
				content: "",
				output_type: "article",
				project_id: projectId,
			});
			return result;
		},
		onSuccess: async (created) => {
			await queryClient.invalidateQueries({
				queryKey: ["output_assets", projectId],
			});
			openDoc({ kind: "output", id: created.id, title: created.title });
		},
	});

	const deleteOutputMutation = useMutation({
		mutationFn: async () => {
			if (activeDoc?.kind !== "output") throw new Error("当前不是产出");
			await deleteOutputAsset(activeDoc.id);
			return { id: activeDoc.id };
		},
		onSuccess: async ({ id }) => {
			closeDoc({ kind: "output", id });
			await queryClient.invalidateQueries({
				queryKey: ["output_assets", projectId],
			});
		},
	});

	if (!activeDoc || openDocs.length === 0) {
		return (
			<DashboardPanel
				onOpenSettings={onOpenSettings}
				onCreateOutput={() => createOutputMutation.mutate()}
			/>
		);
	}

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
				<div className="flex flex-1 items-center gap-1 overflow-x-auto">
					{openDocs.map((d) => {
						const isActive = d.kind === activeDoc.kind && d.id === activeDoc.id;
						return (
							<button
								type="button"
								key={`${d.kind}:${d.id}`}
								onClick={() => openDoc(d)}
								className={cn(
									"flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition-colors",
									isActive ? "bg-background/80" : "hover:bg-background/60",
								)}
							>
								<FileText className="h-3.5 w-3.5 text-muted-foreground" />
								<div className="max-w-[200px] truncate">{d.title}</div>
								<button
									type="button"
									className="ml-1 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60"
									onClick={(e) => {
										e.stopPropagation();
										closeDoc({ kind: d.kind, id: d.id });
									}}
								>
									<X className="h-3.5 w-3.5" />
								</button>
							</button>
						);
					})}
				</div>
				<Button
					variant="secondary"
					size="sm"
					className="h-8"
					disabled={!projectId || createOutputMutation.isPending}
					onClick={() => createOutputMutation.mutate()}
				>
					<Plus className="mr-2 h-4 w-4" />
					新建产出
				</Button>
				{activeDoc.kind === "output" && (
					<Button
						variant="destructive"
						size="sm"
						className="h-8"
						disabled={deleteOutputMutation.isPending}
						onClick={() => deleteOutputMutation.mutate()}
					>
						删除
					</Button>
				)}
			</div>

			<div className="flex-1 overflow-hidden">
				{activeDoc.kind === "source" ? (
					<SourceView
						loading={detailQuery.isLoading}
						data={detailQuery.data?.source}
						noteContent={detailQuery.data?.note?.content}
					/>
				) : (
					<OutputView
						projectId={projectId}
						loading={outputsQuery.isLoading}
						output={activeOutput}
					/>
				)}
			</div>
		</div>
	);
}

function SourceView({
	loading,
	data,
	noteContent,
}: {
	loading: boolean;
	data?: { title: string; kind: string; category: string; updated_at: number };
	noteContent?: string;
}) {
	if (loading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-sm text-muted-foreground">加载中…</div>
			</div>
		);
	}
	if (!data) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-sm text-muted-foreground">未找到资料</div>
			</div>
		);
	}
	return (
		<div className="flex h-full w-full flex-col">
			<div className="border-b border-border/60 px-6 py-4">
				<div className="text-base font-semibold">{data.title}</div>
				<div className="mt-1 text-xs text-muted-foreground">
					{data.kind} · {data.category} · 更新于{" "}
					{formatDistanceToNow(new Date(data.updated_at), { addSuffix: true })}
				</div>
			</div>
			<ScrollArea className="flex-1 px-6 py-4">
				{noteContent ? (
					<div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
						{noteContent}
					</div>
				) : (
					<div className="text-sm text-muted-foreground">暂无笔记内容</div>
				)}
			</ScrollArea>
		</div>
	);
}

function OutputView({
	projectId,
	loading,
	output,
}: {
	projectId: string | null;
	loading: boolean;
	output: {
		id: string;
		title: string;
		content: string;
		output_type: string;
		version: number;
	} | null;
}) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");

	useEffect(() => {
		setTitle(output?.title ?? "");
		setContent(output?.content ?? "");
	}, [output?.content, output?.title]);

	const saveMutation = useMutation({
		mutationFn: async () => {
			if (!output) throw new Error("未选择产出");
			return updateOutputAsset({ id: output.id, title, content });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["output_assets", projectId],
			});
		},
	});

	if (loading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-sm text-muted-foreground">加载中…</div>
			</div>
		);
	}
	if (!output) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<div className="text-sm text-muted-foreground">未找到产出</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex items-center gap-3 border-b border-border/60 px-6 py-4">
				<div className="flex-1">
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						className="h-9"
					/>
					<div className="mt-1 text-xs text-muted-foreground">
						{output.output_type} · v{output.version}
					</div>
				</div>
				<Button
					onClick={() => saveMutation.mutate()}
					disabled={saveMutation.isPending}
				>
					保存
				</Button>
			</div>
			<div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden">
				<div className="flex h-full flex-col border-r border-border/60">
					<div className="px-6 py-3 text-xs font-medium text-muted-foreground">
						编辑（Markdown）
					</div>
					<Textarea
						value={content}
						onChange={(e) => setContent(e.target.value)}
						className="flex-1 resize-none rounded-none border-0 px-6 py-4 text-sm leading-6 focus-visible:ring-0"
						placeholder="在这里编写 Markdown…"
					/>
				</div>
				<ScrollArea className="h-full">
					<div className="px-6 py-3 text-xs font-medium text-muted-foreground">
						预览（纯文本）
					</div>
					<div className="px-6 pb-6 whitespace-pre-wrap text-sm leading-6 text-foreground">
						{content || "暂无内容"}
					</div>
				</ScrollArea>
			</div>
		</div>
	);
}
