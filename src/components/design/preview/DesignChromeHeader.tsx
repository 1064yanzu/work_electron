/**
 * Design 预览界面顶部 chrome 行(h-12)。
 *
 * 布局:
 *   ← 返回   设计标题 / 副文(方向 · 系统 · 状态)   [drag spacer]   演示  分享▾  完成→
 *
 * - 左侧返回按钮:清空当前 design session,回到设计模块主页 (DesignEmpty),不 finalize 不收纳
 * - 右侧 ExitDesignButton:沿用原有"完成 → 写代码"逻辑
 *
 * 演示模式下不渲染本组件(由父级根据 presentationMode 控制)。
 */
import { ArrowLeft, BookOpen, Play } from "lucide-react";
import { DesignSession } from "../../../lib/api/design";
import {
	cancelCopilotMirror,
	hasCopilotMirror,
} from "../../../lib/design/copilotMirror";
import { designStore } from "../../../lib/stores/designStore";
import { layoutStore, useLayoutStoreSelector } from "../../../lib/stores";
import { designPreviewStore } from "../../../lib/stores/designPreviewStore";
import { ExitDesignButton } from "../ExitDesignButton";
import { ModeBadge } from "../ModeBadge";
import { ShareMenu } from "./ShareMenu";

interface DesignChromeHeaderProps {
	session: DesignSession;
	currentThreadPath?: string;
	currentThreadTitle?: string;
	onAdvancedExport: () => void;
	docButton?: {
		active: boolean;
		title: string;
		onToggle: () => void;
	};
}

export function DesignChromeHeader({
	session,
	currentThreadPath,
	currentThreadTitle,
	onAdvancedExport,
	docButton,
}: DesignChromeHeaderProps) {
	const rightSidebarVisible = useLayoutStoreSelector(
		(s) => s.rightSidebarVisible,
	);

	const handleBack = () => {
		// 返回到设计模块主页 (DesignEmpty),不离开 design 视图、不 finalize。
		if (hasCopilotMirror()) {
			cancelCopilotMirror("");
		}
		designPreviewStore.reset();
		designStore.setCurrentSession(null);
		designStore.setStage("empty");
	};

	const handlePresent = () => {
		designPreviewStore.enterPresentation(rightSidebarVisible);
		layoutStore.setRightSidebarVisible(false);
	};

	return (
		<header
			className="min-h-12 px-3.5 flex items-center gap-3 border-b border-border bg-bg-surface select-none"
			data-design-chrome="header"
		>
			<button
				type="button"
				onClick={handleBack}
				className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors shrink-0"
				title="返回编辑器"
				aria-label="返回编辑器"
			>
				<ArrowLeft className="w-4 h-4" strokeWidth={1.6} />
			</button>

			<div className="flex flex-col min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-medium text-text-primary truncate max-w-[280px]">
						{session.title}
					</span>
					<ModeBadge mode={session.mode ?? undefined} />
				</div>
				<div className="text-[11px] text-text-muted flex items-center gap-1.5">
					{session.direction_id ? <span>{session.direction_id}</span> : null}
					{session.system_id ? (
						<>
							<span>·</span>
							<span>{session.system_id}</span>
						</>
					) : null}
					{session.status ? (
						<>
							<span>·</span>
							<span className="capitalize">{session.status}</span>
						</>
					) : null}
				</div>
			</div>

			{/* drag spacer */}
			<div className="flex-1" />

			<button
				type="button"
				onClick={handlePresent}
				className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12.5px] font-medium text-text-muted hover:text-text-primary hover:bg-warm-200/60 transition-colors"
				title="进入演示模式 (ESC 退出)"
			>
				<Play className="w-3.5 h-3.5" strokeWidth={1.6} />
				演示
			</button>

			{docButton ? (
				<button
					type="button"
					onClick={docButton.onToggle}
					className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
						docButton.active
							? "bg-primary/10 text-primary"
							: "text-text-muted hover:text-text-primary hover:bg-warm-200/60"
					}`}
					title={docButton.title}
					aria-pressed={docButton.active}
				>
					<BookOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
				</button>
			) : null}

			<ShareMenu
				session={session}
				currentThreadPath={currentThreadPath}
				currentThreadTitle={currentThreadTitle}
				onAdvancedExport={onAdvancedExport}
			/>

			<ExitDesignButton
				session={session}
				threadPath={currentThreadPath}
				threadTitle={currentThreadTitle}
			/>
		</header>
	);
}
