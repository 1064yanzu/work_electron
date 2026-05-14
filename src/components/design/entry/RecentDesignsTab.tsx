import { CalendarClock, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import {
	designGetSession,
	designListSessions,
	type DesignSession,
	type DesignSessionStatus,
} from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import { toast } from "../../ui/Toast";
import { ModeBadge } from "../ModeBadge";

interface RecentDesignsTabProps {
	loading: boolean;
}

const STATUS_LABEL: Record<DesignSessionStatus, { label: string; cls: string }> = {
	draft: { label: "草稿", cls: "bg-warm-200 text-text-muted" },
	discovery: { label: "答卷中", cls: "bg-warm-200 text-text-muted" },
	running: { label: "生成中", cls: "bg-primary/10 text-primary" },
	done: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
	error: { label: "失败", cls: "bg-red-100 text-red-700" },
};

function formatRelative(ts: number): string {
	const diff = Date.now() - ts;
	const min = 60 * 1000;
	const hour = 60 * min;
	const day = 24 * hour;
	if (diff < min) return "刚刚";
	if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
	if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
	if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
	return new Date(ts).toLocaleDateString();
}

function pickColor(seed: string): { from: string; to: string } {
	const palette: Array<{ from: string; to: string }> = [
		{ from: "#FAEFE9", to: "#F4D6C7" }, // peach
		{ from: "#F6EBE0", to: "#E8C8A8" }, // sand
		{ from: "#F2E9DC", to: "#D7B998" }, // warm tan
		{ from: "#F0E3E8", to: "#D8B8C7" }, // rose
		{ from: "#E8E9F1", to: "#BDC1DE" }, // periwinkle
		{ from: "#E0EAE5", to: "#9EC3B3" }, // sage
	];
	let h = 0;
	for (let i = 0; i < seed.length; i += 1) {
		h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	}
	return palette[h % palette.length];
}

export function RecentDesignsTab({ loading }: RecentDesignsTabProps) {
	const sessions = useDesignStoreSelector((s) => s.sessionsList);

	const items = useMemo(() => sessions.slice(0, 24), [sessions]);

	const handleOpen = async (session: DesignSession) => {
		try {
			const fresh = await designGetSession(session.id);
			designStore.setCurrentSession(fresh);
			designStore.setStage(fresh.status === "done" ? "preview" : "discovery");
			// 顺手刷新列表
			void designListSessions({ limit: 50 }).then((list) =>
				designStore.setSessionsList(list),
			);
		} catch (err) {
			toast.error(
				`打开会话失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	};

	if (loading) {
		return (
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton row
						key={i}
						className="aspect-[16/10] rounded-2xl bg-warm-200/40 animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<div className="w-12 h-12 rounded-2xl bg-warm-200/50 text-text-muted flex items-center justify-center mb-3">
					<FolderOpen className="w-5 h-5" strokeWidth={1.5} />
				</div>
				<div className="text-sm text-text-primary font-medium mb-1">
					还没有设计稿
				</div>
				<div className="text-xs text-text-muted leading-relaxed max-w-xs">
					点击右下角「新建空白设计」开始你的第一个设计；或先从「设计系统」/「内置 Skill」挑一个起点。
				</div>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{items.map((s) => {
				const status = STATUS_LABEL[s.status] ?? STATUS_LABEL.draft;
				const colors = pickColor(s.id);
				return (
					<button
						key={s.id}
						type="button"
						onClick={() => void handleOpen(s)}
						className="group text-left flex flex-col rounded-2xl border border-border bg-bg-surface overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5"
					>
						<div
							className="aspect-[16/10] w-full relative flex items-end p-4"
							style={{
								backgroundImage: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
							}}
						>
							<div className="absolute top-3 right-3">
								<span
									className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.cls}`}
								>
									{status.label}
								</span>
							</div>
							<div className="flex flex-col gap-1 max-w-full">
								<div className="text-base font-semibold text-text-primary line-clamp-2 leading-snug">
									{s.title || "未命名设计"}
								</div>
								{s.direction_id || s.system_id ? (
									<div className="text-[11px] text-text-primary/70 truncate">
										{s.system_id || s.direction_id}
									</div>
								) : null}
							</div>
						</div>
						<div className="px-4 py-3 flex items-center justify-between gap-2">
							<div className="flex items-center gap-2 min-w-0">
								<ModeBadge mode={s.mode ?? undefined} />
							</div>
							<div className="flex items-center gap-1.5 text-[11px] text-text-muted shrink-0">
								<CalendarClock className="w-3 h-3" strokeWidth={1.5} />
								{formatRelative(s.updated_at)}
							</div>
						</div>
					</button>
				);
			})}
		</div>
	);
}
