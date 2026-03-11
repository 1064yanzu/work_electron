import { X } from "lucide-react";
import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import {
	getSettingsPanelComponent,
	preloadSettingsPanel,
	type SettingsTabId,
} from "./panelLoaders";
import { SettingsSidebar } from "./SettingsSidebar";
import { FocusTrap } from "../ui/FocusTrap";
import { SettingsExperienceProvider } from "./context/SettingsExperienceContext";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState<SettingsTabId>("models");
	const [isClosing, setIsClosing] = useState(false);
	const [shouldRender, setShouldRender] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);

	// 处理关闭动画
	const handleClose = useCallback(() => {
		setIsClosing(true);
		setTimeout(() => {
			setIsClosing(false);
			onClose();
		}, 200);
	}, [onClose]);

	// 控制渲染
	useEffect(() => {
		if (isOpen) {
			setShouldRender(true);
			setIsClosing(false);
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
		<SettingsExperienceProvider>
			<div
				className={`fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm font-sans ${isClosing ? "animate-fade-out" : "animate-in fade-in duration-200"}`}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget) {
						handleClose();
					}
				}}
			>
				<FocusTrap
					className={`relative w-[88vw] h-[82vh] max-w-7xl rounded-[28px] bg-white/95 dark:bg-zinc-950/95 shadow-2xl border border-border overflow-hidden flex ${isClosing ? "animate-scale-out" : "animate-in zoom-in-95 duration-200"}`}
					onEscape={handleClose}
					initialFocusRef={closeButtonRef}
					role="dialog"
					aria-modal="true"
					aria-label="设置"
				>
					<SettingsSidebar
						activeTab={activeTab}
						onTabChange={(tabId) => setActiveTab(tabId as SettingsTabId)}
						onTabPrefetch={(tabId) =>
							preloadSettingsPanel(tabId as SettingsTabId)
						}
					/>

					<main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-background/80 dark:bg-zinc-950">
						<button
							ref={closeButtonRef}
							onClick={handleClose}
							className="absolute top-3 right-3 z-10 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer hover:bg-surface text-text-muted hover:text-text-primary btn-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
							title="关闭"
							aria-label="关闭设置"
						>
							<X className="w-5 h-5" />
						</button>

						<Suspense
							fallback={
								<div className="flex-1 flex items-center justify-center text-sm text-text-muted">
									正在加载设置面板...
								</div>
							}
						>
							<ActivePanel />
						</Suspense>
					</main>
				</FocusTrap>
			</div>
		</SettingsExperienceProvider>
	);
}
