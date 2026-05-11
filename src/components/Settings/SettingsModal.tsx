/**
 * SettingsModal — 设置面板根容器
 *
 * Phase 1 落地：两层导航 + legacy id 归一化 + 外壳圆角。
 * Phase 3 增量：顶部内嵌 `SettingsSearch`；命中结果通过 `navigateTo(tabId, anchorId)`
 *              切 Tab → `requestAnimationFrame` 内 `scrollIntoView({block:"center"})`
 *              → 目标容器加 `data-settings-field-highlight="true"`，1.2s 后移除。
 */
import { X } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SettingsSearch } from "./components/SettingsSearch";
import { resolveSettingsTabId } from "./legacyTabMap";
import {
	getSettingsPanelComponent,
	preloadSettingsPanel,
} from "./panelLoaders";
import type { SettingsTabId } from "./settingsCatalog";
import { SettingsSidebar } from "./SettingsSidebar";
import { FocusTrap } from "../ui/FocusTrap";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** 入口传入的 raw id，可能是新 `SettingsTabId` 或旧 legacy id，会自动归一化 */
	initialTab?: string;
}

/** 高亮持续时间（ms），对齐 R7.5。 */
const HIGHLIGHT_DURATION_MS = 1200;

export function SettingsModal({
	isOpen,
	onClose,
	initialTab,
}: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState<SettingsTabId>(() =>
		resolveSettingsTabId(initialTab),
	);
	const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null);
	const [isClosing, setIsClosing] = useState(false);
	const [shouldRender, setShouldRender] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);
	const contentRef = useRef<HTMLElement | null>(null);
	// 跟踪上一次高亮元素的计时器，避免多次跳转时残留
	const highlightCleanupRef = useRef<(() => void) | null>(null);

	const handleClose = useCallback(() => {
		setIsClosing(true);
		setTimeout(() => {
			setIsClosing(false);
			onClose();
		}, 200);
	}, [onClose]);

	// 尝试滚动到 anchor 并高亮；如果面板还没挂上（Suspense / 第一次切换），
	// 交给 effect 在 activeTab / pendingAnchorId 变化时重试。
	const tryScrollAndHighlight = useCallback((anchorId: string) => {
		const scope = contentRef.current ?? document;
		const el = scope.querySelector<HTMLElement>(
			`[data-settings-anchor="${CSS.escape(anchorId)}"]`,
		);
		if (!el) return false;

		// 清理上一次高亮
		if (highlightCleanupRef.current) {
			highlightCleanupRef.current();
			highlightCleanupRef.current = null;
		}

		// rAF 内执行滚动 + 加 attr，保证 DOM 已经布局完
		requestAnimationFrame(() => {
			try {
				el.scrollIntoView({ block: "center", behavior: "smooth" });
			} catch {
				el.scrollIntoView();
			}
			el.setAttribute("data-settings-field-highlight", "true");
			const timer = window.setTimeout(() => {
				el.removeAttribute("data-settings-field-highlight");
				highlightCleanupRef.current = null;
			}, HIGHLIGHT_DURATION_MS);
			highlightCleanupRef.current = () => {
				window.clearTimeout(timer);
				el.removeAttribute("data-settings-field-highlight");
			};
		});
		return true;
	}, []);

	// 切 Tab / 跳转锚点的统一入口，供 Sidebar 与 SettingsSearch 共用
	const navigateTo = useCallback((tabId: SettingsTabId, anchorId?: string) => {
		setActiveTab(tabId);
		setPendingAnchorId(anchorId ?? null);
	}, []);

	// 面板切换后尝试消费 pendingAnchorId；如果面板组件还没准备好，最多重试 10 次
	useEffect(() => {
		if (!pendingAnchorId) return;
		let cancelled = false;
		let attempts = 0;
		const tick = () => {
			if (cancelled) return;
			const ok = tryScrollAndHighlight(pendingAnchorId);
			if (ok) {
				setPendingAnchorId(null);
				return;
			}
			attempts += 1;
			if (attempts > 10) {
				// 目标 anchor 找不到，放弃；panel 依然完成了 Tab 切换
				setPendingAnchorId(null);
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		return () => {
			cancelled = true;
		};
	}, [activeTab, pendingAnchorId, tryScrollAndHighlight]);

	// 组件卸载时清理残留高亮
	useEffect(() => {
		return () => {
			if (highlightCleanupRef.current) {
				highlightCleanupRef.current();
				highlightCleanupRef.current = null;
			}
		};
	}, []);

	// isOpen 切换 + initialTab 归一化
	useEffect(() => {
		if (isOpen) {
			setShouldRender(true);
			setIsClosing(false);
			const next = resolveSettingsTabId(initialTab);
			setActiveTab(next);
			setPendingAnchorId(null);
			preloadSettingsPanel(next);
		}
	}, [initialTab, isOpen]);

	// activeTab 变化时预加载
	useEffect(() => {
		if (isOpen) {
			preloadSettingsPanel(activeTab);
		}
	}, [activeTab, isOpen]);

	// 关闭后清理渲染状态
	useEffect(() => {
		if (!isOpen && !isClosing) {
			setShouldRender(false);
		}
	}, [isOpen, isClosing]);

	if (!shouldRender && !isOpen) return null;
	const ActivePanel = getSettingsPanelComponent(activeTab);

	return (
		<div
			className={`fixed inset-0 z-[100] flex items-center justify-center bg-cream-900/20 backdrop-blur-sm font-sans ${isClosing ? "animate-fade-out" : "animate-in fade-in duration-200"}`}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					handleClose();
				}
			}}
		>
			<FocusTrap
				className={`relative w-[88vw] h-[82vh] max-w-7xl rounded-3xl shadow-bai-pop border border-border overflow-hidden flex transition-colors duration-300 ${isClosing ? "animate-scale-out" : "animate-in zoom-in-95 duration-200"}`}
				style={{ backgroundColor: "var(--t-bg-surface)" }}
				onEscape={handleClose}
				initialFocusRef={closeButtonRef}
				role="dialog"
				aria-modal="true"
				aria-label="设置"
			>
				<SettingsSidebar
					activeTab={activeTab}
					onNavigate={navigateTo}
					onPrefetch={preloadSettingsPanel}
				/>

				<main
					ref={contentRef}
					className="flex-1 flex flex-col min-w-0 overflow-hidden relative transition-colors duration-300"
					style={{ backgroundColor: "var(--t-bg-surface)" }}
				>
					<button
						ref={closeButtonRef}
						onClick={handleClose}
						className="absolute top-3 right-3 z-10 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer hover:bg-warm-200 text-text-muted hover:text-text-primary transition-transform duration-150 ease-out-expo active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
						title="关闭"
						aria-label="关闭设置"
					>
						<X className="w-5 h-5" />
					</button>

					{/* 顶部搜索：始终可见，占据 close 按钮左侧空间 */}
					<div className="shrink-0 border-b border-border/60 px-6 pr-14 pt-4 pb-3">
						<SettingsSearch onResultClick={navigateTo} />
					</div>

					<Suspense
						fallback={
							<div className="flex-1 flex items-center justify-center text-sm text-text-muted">
								正在加载设置面板...
							</div>
						}
					>
						{/* key={activeTab} 让面板切换时重新挂载，清理残留状态 */}
						<ActivePanel key={activeTab} />
					</Suspense>
				</main>
			</FocusTrap>
		</div>
	);
}
