import { useState } from "react";
import { AgentSettings } from "./panels/AgentSettings";
import { DashboardSettings } from "./panels/DashboardSettings";
import { DataSettings } from "./panels/DataSettings";
import { GeneralSettings } from "./panels/GeneralSettings";
import { MCPSettings } from "./panels/MCPSettings";
import { ModelSettings } from "./panels/ModelSettings";
import { PromptSettings } from "./panels/PromptSettings";
import { SkillsSettings } from "./panels/SkillsSettings";
import { SettingsSidebar } from "./SettingsSidebar";

interface SettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
	const [activeTab, setActiveTab] = useState("models");

	if (!isOpen) return null;

	const renderContent = () => {
		switch (activeTab) {
			case "dashboard":
				return <DashboardSettings />;
			case "models":
				return <ModelSettings />;
			case "prompts":
				return <PromptSettings />;
			case "agent":
				return <AgentSettings />;
			case "skills":
				return <SkillsSettings />;
			case "mcp":
				return <MCPSettings />;
			case "general":
				return <GeneralSettings />;
			case "data":
				return <DataSettings />;
			default:
				return (
					<div className="flex-1 flex items-center justify-center text-text-muted">
						功能开发中...
					</div>
				);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm font-sans animate-in fade-in duration-200">
			{/* Click outside to close could be added here, but explicit close button is safer for settings */}
			<div className="relative w-[85vw] h-[80vh] max-w-6xl rounded-xl bg-white shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200 flex">
				{/* Sidebar */}
				<SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

				{/* Main Content Area */}
				<main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
					{/* Close Button - Absolute positioned at top right of the content area */}
					<button
						onClick={onClose}
						className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-surface text-text-muted hover:text-text-primary transition-colors"
						title="关闭"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 6 6 18" />
							<path d="m6 6 12 12" />
						</svg>
					</button>

					{renderContent()}
				</main>
			</div>
		</div>
	);
}
