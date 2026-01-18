import { useState } from "react";
import { ThreePanelLayout } from "@/components/layout/three-panel-layout";
import { CopilotSidebar } from "@/features/chat/copilot-sidebar";
import { EditorPanel } from "@/features/editor/editor-panel";
import { ResourcesSidebar } from "@/features/resources/resources-sidebar";
import { SettingsModal } from "@/features/settings/settings-modal";
import { WorkspaceProvider } from "@/features/workspace/workspace-context";
import { MouseDragProvider } from "@/hooks/mouse-drag";

export function AppShell() {
	const [settingsOpen, setSettingsOpen] = useState(false);

	return (
		<WorkspaceProvider>
			<MouseDragProvider>
				<ThreePanelLayout
					left={
						<ResourcesSidebar onOpenSettings={() => setSettingsOpen(true)} />
					}
					center={<EditorPanel onOpenSettings={() => setSettingsOpen(true)} />}
					right={
						<CopilotSidebar onOpenSettings={() => setSettingsOpen(true)} />
					}
				/>
				<SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
			</MouseDragProvider>
		</WorkspaceProvider>
	);
}
