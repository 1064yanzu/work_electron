import { X } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { AgentSettings } from "./panels/AgentSettings";
import { ArtifactSettings } from "./panels/ArtifactSettings";
import { DashboardSettings } from "./panels/DashboardSettings";
import { DataSettings } from "./panels/DataSettings";
import { GeneralSettings } from "./panels/GeneralSettings";
import { ImageGenSettings } from "./panels/ImageGenSettings";
import { MCPSettings } from "./panels/MCPSettings";
import { ModelSettings } from "./panels/ModelSettings";
import { PromptSettings } from "./panels/PromptSettings";
import { RemoteControlSettings } from "./panels/RemoteControlSettings";
import { SkillsSettings } from "./panels/SkillsSettings";
import { SettingsSidebar } from "./SettingsSidebar";
import { FocusTrap } from "../ui/FocusTrap";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState("models");
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
		}
	}, [isOpen, handleClose]);

	// 关闭后清理渲染状态
	useEffect(() => {
		if (!isOpen && !isClosing) {
			setShouldRender(false);
		}
	}, [isOpen, isClosing]);

	if (!shouldRender && !isOpen) return null;

	const renderContent = () => {
		switch (activeTab) {
			case "dashboard":
				return <DashboardSettings />;
			case "models":
				return <ModelSettings />;
			case "prompts":
				return <PromptSettings />;
			case "imagegen":
				return <ImageGenSettings />;
			case "agent":
				return <AgentSettings />;
			case "skills":
				return <SkillsSettings />;
			case "mcp":
				return <MCPSettings />;
			case "remoteControl":
				return <RemoteControlSettings />;
			case "general":
				return <GeneralSettings />;
			case "data":
				return <DataSettings />;
			case "artifacts":
				return <ArtifactSettings />;
			default:
				return (
					<div className="flex-1 flex items-center justify-center text-text-muted">
						功能开发中...
					</div>
				);
		}
	};

	return (
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm font-sans ${isClosing ? "animate-fade-out" : "animate-in fade-in duration-200"}`}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					handleClose();
				}
			}}
		>
			<FocusTrap
				className={`relative w-[85vw] h-[80vh] max-w-6xl rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-border overflow-hidden flex ${isClosing ? "animate-scale-out" : "animate-in zoom-in-95 duration-200"}`}
				onEscape={handleClose}
				initialFocusRef={closeButtonRef}
				role="dialog"
				aria-modal="true"
				aria-label="设置"
			>
				<SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

				<main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
					<button
						ref={closeButtonRef}
						onClick={handleClose}
						className="absolute top-3 right-3 z-10 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full cursor-pointer hover:bg-surface text-text-muted hover:text-text-primary btn-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
						title="关闭"
						aria-label="关闭设置"
					>
						<X className="w-5 h-5" />
					</button>

					{renderContent()}
				</main>
			</FocusTrap>
		</div>
	);
}
