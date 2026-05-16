import {
	Palette,
	Plus,
	MoreHorizontal,
	Trash2,
	FolderOpen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	designDeleteSession,
	designGetSession,
	designListSessions,
	designRevealWorkDir,
	type DesignSession,
} from "../../lib/api/design";
import {
	designStore,
	layoutStore,
	useDesignStoreSelector,
} from "../../lib/stores";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { toast } from "../ui/Toast";

/**
 * 左栏「设计」子视图。
 *
 * - 顶部：标题 + 新建按钮（切到 design 入口，让用户在 NewProjectPanel 填写）
 * - 列表：DesignSession[] 按 updated_at 倒序
 * - 点击：切到该会话；已完成 → preview，未完成 → preview（让用户看工作目录）
 * - 右键：删除 / 在 Finder 打开
 */
export function DesignSessionList() {
	const sessions = useDesignStoreSelector((s) => s.sessionsList);
	const currentSessionId = useDesignStoreSelector((s) => s.currentSessionId);
	const [loading, setLoading] = useState(true);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		session: DesignSession;
	} | null>(null);

	const reload = useCallback(async () => {
		try {
			const list = await designListSessions({ limit: 100 });
			designStore.setSessionsList(list);
		} catch (err) {
			console.warn("[DesignSessionList] reload failed", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	const handleOpen = async (session: DesignSession) => {
		try {
			const fresh = await designGetSession(session.id);
			designStore.setCurrentSession(fresh);
			// 已完成 → preview；未完成 → preview（不再回二次答卷，让用户在 Copilot 里继续）
			designStore.setStage("preview");
			layoutStore.setMainView("design");
		} catch (err) {
			toast.error(
				`打开会话失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleCreate = () => {
		// 不再直接 startSession；切到 design 入口，让用户在左栏 NewProjectPanel 填写
		designStore.setCurrentSession(null);
		designStore.setStage("empty");
		layoutStore.setMainView("design");
		layoutStore.setLeftSidebarView("design");
	};

	const handleDelete = async (session: DesignSession) => {
		try {
			await designDeleteSession({
				session_id: session.id,
				delete_output: false,
				delete_work_dir: true,
			});
			if (currentSessionId === session.id) {
				designStore.setCurrentSession(null);
				designStore.setStage("empty");
			}
			await reload();
			toast.success("已删除");
		} catch (err) {
			toast.error(
				`删除失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const handleReveal = async (session: DesignSession) => {
		try {
			await designRevealWorkDir(session.id);
		} catch (err) {
			toast.error(
				`打开目录失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	const buildContextMenu = (session: DesignSession): ContextMenuItem[] => [
		{
			label: "打开",
			onClick: () => void handleOpen(session),
		},
		{
			label: "在 Finder 中打开工作目录",
			onClick: () => void handleReveal(session),
			icon: <FolderOpen className="w-4 h-4" strokeWidth={1.5} />,
		},
		{ separator: true, label: "", onClick: () => {} },
		{
			label: "删除",
			onClick: () => void handleDelete(session),
			icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />,
			danger: true,
		},
	];

	return (
		<div className="flex flex-col h-full bg-transparent">
			<header className="px-4 py-3 flex items-center justify-between border-b border-border">
				<div className="flex items-center gap-2">
					<Palette className="w-4 h-4 text-primary" strokeWidth={1.5} />
					<h2 className="text-sm font-semibold text-text-primary">设计会话</h2>
				</div>
				<button
					type="button"
					onClick={() => handleCreate()}
					className="p-1.5 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded-lg transition-colors"
					title="新建设计"
				>
					<Plus className="w-4 h-4" strokeWidth={1.5} />
				</button>
			</header>

			<div className="flex-1 overflow-y-auto px-2 py-2">
				{loading ? (
					<div className="text-xs text-text-muted px-3 py-2">加载中...</div>
				) : sessions.length === 0 ? (
					<div className="text-xs text-text-muted px-3 py-6 leading-relaxed text-center">
						还没有设计会话。
						<br />
						点击右上角「+」新建一个。
					</div>
				) : (
					<ul className="flex flex-col gap-0.5">
						{sessions.map((s) => {
							const isActive = currentSessionId === s.id;
							return (
								<li key={s.id}>
									<button
										type="button"
										onClick={() => void handleOpen(s)}
										onContextMenu={(e) => {
											e.preventDefault();
											setContextMenu({
												x: e.clientX,
												y: e.clientY,
												session: s,
											});
										}}
										className={[
											"w-full text-left px-3 py-2 rounded-lg transition-colors group flex flex-col gap-0.5",
											isActive
												? "bg-warm-200 text-text-primary"
												: "hover:bg-warm-200/60 text-text-muted",
										].join(" ")}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="text-sm font-medium truncate text-text-primary">
												{s.title || "未命名设计"}
											</span>
											<MoreHorizontal
												className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
												strokeWidth={1.5}
												onClick={(e) => {
													e.stopPropagation();
													setContextMenu({
														x: e.clientX,
														y: e.clientY,
														session: s,
													});
												}}
											/>
										</div>
										<div className="text-[10px] flex items-center gap-1.5 text-text-muted">
											{s.mode ? <span>{s.mode}</span> : null}
											{s.direction_id ? (
												<>
													<span>·</span>
													<span>{s.direction_id}</span>
												</>
											) : null}
											<span>·</span>
											<span>{new Date(s.updated_at).toLocaleDateString()}</span>
										</div>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			{contextMenu ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={buildContextMenu(contextMenu.session)}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
}
