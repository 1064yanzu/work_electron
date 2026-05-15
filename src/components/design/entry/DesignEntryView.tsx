/**
 * Design 模块入口首屏（重构自 DesignEmpty）
 *
 * 两栏布局：
 * - 左 420px：NewProjectPanel（创建项目）
 * - 右 flex：浏览（最近设计 / 设计系统 / 内置 Skill / 品牌）
 *
 * 视觉规范：
 * - 创建按钮在左栏底部 CTA；不再有右下 FAB
 * - 右栏 EntryTabs 用 underline variant，与左栏 tab 风格统一
 */
import { useEffect, useState } from "react";
import {
	designListDirections,
	designListSessions,
} from "../../../lib/api/design";
import { designStore } from "../../../lib/stores";
import { BrandExtractTab } from "./BrandExtractTab";
import { BuiltinSkillsTab } from "./BuiltinSkillsTab";
import { EntryHeader } from "./EntryHeader";
import { EntryTabs, type EntryTabKey } from "./EntryTabs";
import { NewProjectPanel } from "./newProject/NewProjectPanel";
import { RecentDesignsTab } from "./RecentDesignsTab";
import { SystemsLibraryTab } from "./SystemsLibraryTab";

export function DesignEntryView() {
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

	return (
		<div className="h-full w-full flex bg-background overflow-hidden">
			{/* 左栏：创建面板 */}
			<aside className="w-[420px] shrink-0 h-full">
				<NewProjectPanel />
			</aside>

			{/* 右栏：浏览 */}
			<section className="flex-1 min-w-0 h-full overflow-y-auto">
				<div className="max-w-5xl mx-auto px-8 pt-10 pb-16 flex flex-col gap-6">
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
			</section>
		</div>
	);
}
