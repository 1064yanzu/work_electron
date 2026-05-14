/**
 * Design 模块入口首屏（重构自 DesignEmpty）
 *
 * 4 Tab：最近设计 / 设计系统库 / 内置 Skill / 品牌
 * 右下角 FAB：新建空白设计
 *
 * 视觉规范：
 * - Tab 用 pill 风格（borderRadius 999）
 * - 卡片 3-4 列响应式网格；卡面 16:9 缩略图（M2 起为真实截图）
 * - hover 升阴影 + translateY(-2px)，140ms 过渡
 */
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import {
	designListDirections,
	designListSessions,
	designStartSession,
} from "../../../lib/api/design";
import { designStore, useDesignStoreSelector } from "../../../lib/stores";
import { toast } from "../../ui/Toast";
import { BrandExtractTab } from "./BrandExtractTab";
import { BuiltinSkillsTab } from "./BuiltinSkillsTab";
import { EntryHeader } from "./EntryHeader";
import { EntryTabs, type EntryTabKey } from "./EntryTabs";
import { RecentDesignsTab } from "./RecentDesignsTab";
import { SystemsLibraryTab } from "./SystemsLibraryTab";

export function DesignEntryView() {
	const isStarting = useDesignStoreSelector((s) => s.isStarting);
	const [activeTab, setActiveTab] = useState<EntryTabKey>("recent");
	const [initialLoading, setInitialLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [directions, list] = await Promise.all([
					designListDirections(),
					designListSessions({ limit: 50 }),
				]);
				if (cancelled) return;
				designStore.setDirections(directions);
				designStore.setSessionsList(list);
			} catch (err) {
				console.error("[DesignEntryView] init failed", err);
			} finally {
				if (!cancelled) setInitialLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleStartBlank = async () => {
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
			designStore.resetDraft();
			designStore.setStage("discovery");
			const list = await designListSessions({ limit: 50 });
			designStore.setSessionsList(list);
		} catch (err) {
			console.error("[DesignEntryView] start failed", err);
			toast.error(
				`新建设计失败: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			designStore.setStarting(false);
		}
	};

	return (
		<div className="h-full w-full flex flex-col bg-background relative overflow-hidden">
			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="max-w-6xl mx-auto px-8 pt-12 pb-24 flex flex-col gap-8">
					<EntryHeader />

					<EntryTabs value={activeTab} onChange={setActiveTab} />

					<div className="min-h-[320px]">
						{activeTab === "recent" ? (
							<RecentDesignsTab loading={initialLoading} />
						) : null}
						{activeTab === "systems" ? <SystemsLibraryTab /> : null}
						{activeTab === "skills" ? <BuiltinSkillsTab /> : null}
						{activeTab === "brand" ? <BrandExtractTab /> : null}
					</div>
				</div>
			</div>

			<button
				type="button"
				onClick={() => void handleStartBlank()}
				disabled={isStarting}
				title="新建空白设计"
				className="design-entry-fab fixed bottom-8 right-8 h-12 pl-4 pr-5 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:bg-primary/95 active:scale-95 transition-all flex items-center gap-2 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
			>
				<Plus className="w-4 h-4" strokeWidth={2.2} />
				{isStarting ? "正在新建…" : "新建空白设计"}
			</button>
		</div>
	);
}
