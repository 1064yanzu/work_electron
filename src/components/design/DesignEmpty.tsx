import { Palette, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import {
	designListDirections,
	designListSessions,
	designStartSession,
	type DesignSession,
} from "../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../lib/stores";
import { toast } from "../ui/Toast";

/**
 * 设计模块空态欢迎页 + 最近会话快速访问
 */
export function DesignEmpty() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const sessions = useDesignStoreSelector((s) => s.sessionsList);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [directions, list] = await Promise.all([
					designListDirections(),
					designListSessions({ limit: 6 }),
				]);
				if (cancelled) return;
				designStore.setDirections(directions);
				designStore.setSessionsList(list);
			} catch (err) {
				console.error("[DesignEmpty] init failed", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleStart = async () => {
		try {
			designStore.setStarting(true);
			const result = await designStartSession({ title: "未命名设计" });
			designStore.setDiscoveryForm(result.discovery_form);
			designStore.setCurrentSession({
				id: result.session_id,
				title: "未命名设计",
				status: "draft",
				work_dir: result.work_dir,
				created_at: Date.now(),
				updated_at: Date.now(),
			});
			designStore.setStage("discovery");
			const list = await designListSessions({ limit: 50 });
			designStore.setSessionsList(list);
		} catch (err) {
			console.error("[DesignEmpty] start failed", err);
			toast.error(`新建设计失败: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			designStore.setStarting(false);
		}
	};

	const handleResume = async (session: DesignSession) => {
		designStore.setCurrentSession({ ...session });
		designStore.setStage(session.status === "done" ? "preview" : "discovery");
	};

	return (
		<div className="h-full w-full overflow-y-auto bg-background flex flex-col items-center justify-start px-12 py-16 gap-12">
			<div className="max-w-2xl w-full flex flex-col items-center gap-6 text-center mt-8">
				<div className="w-16 h-16 rounded-2xl bg-warm-200 flex items-center justify-center">
					<Palette className="w-8 h-8 text-primary" strokeWidth={1.5} />
				</div>
				<h1 className="text-3xl font-semibold text-text-primary tracking-tight">
					设计
				</h1>
				<p className="text-base text-text-muted leading-relaxed max-w-xl">
					把一句简介 → 一份 hi-fi HTML 设计稿。
					<br />
					内置 5 个方向、5 维自检、多格式导出；完成后可一键安置到当前线程让 Copilot 接着写代码。
				</p>
				<button
					type="button"
					disabled={isStarting}
					onClick={() => void handleStart()}
					className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
				>
					<Plus className="w-4 h-4" strokeWidth={2} />
					{isStarting ? "正在新建..." : "新建设计"}
				</button>
			</div>

			<div className="max-w-3xl w-full">
				<div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-text-muted">
					<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					<span>最近的设计</span>
				</div>
				{loading ? (
					<div className="text-sm text-text-muted">正在加载...</div>
				) : sessions.length === 0 ? (
					<div className="text-sm text-text-muted">
						暂无历史会话。点击「新建设计」开始第一个。
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{sessions.slice(0, 6).map((s) => (
							<button
								type="button"
								key={s.id}
								onClick={() => void handleResume(s)}
								className="text-left p-4 rounded-xl border border-border bg-bg-surface hover:border-primary/30 transition-colors"
							>
								<div className="flex items-center justify-between gap-3 mb-1">
									<span className="text-sm font-medium text-text-primary truncate">
										{s.title || "未命名设计"}
									</span>
									<StatusBadge status={s.status} />
								</div>
								<div className="text-[11px] text-text-muted flex items-center gap-2">
									<span>{s.mode || "—"}</span>
									<span>·</span>
									<span>{s.direction_id || "—"}</span>
									<span>·</span>
									<span>{new Date(s.updated_at).toLocaleString()}</span>
								</div>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function StatusBadge({ status }: { status: DesignSession["status"] }) {
	const map: Record<string, { label: string; cls: string }> = {
		draft: { label: "草稿", cls: "bg-warm-200 text-text-muted" },
		discovery: { label: "答卷中", cls: "bg-warm-200 text-text-muted" },
		running: { label: "生成中", cls: "bg-primary/10 text-primary" },
		done: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
		error: { label: "失败", cls: "bg-red-100 text-red-700" },
	};
	const m = map[status] ?? map.draft;
	return (
		<span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}>
			{m.label}
		</span>
	);
}
