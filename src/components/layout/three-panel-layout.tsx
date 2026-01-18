import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PanelGroup, PanelResizeHandle, ResizablePanel } from "./resizable";

export function ThreePanelLayout({
	left,
	center,
	right,
}: {
	left: React.ReactNode;
	center: React.ReactNode;
	right: React.ReactNode;
}) {
	const storageKey = "workbench.layout.main_three_panel_layout_v1";
	const defaultLayout = useMemo(() => {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) return undefined;
			return JSON.parse(raw) as Record<string, number>;
		} catch {
			return undefined;
		}
	}, []);

	return (
		<div className="h-screen w-screen overflow-hidden bg-background p-1.5 text-foreground antialiased">
			<PanelGroup
				orientation="horizontal"
				id="main_three_panel_layout_v1"
				defaultLayout={defaultLayout}
				onLayoutChanged={(layout) => {
					try {
						localStorage.setItem(storageKey, JSON.stringify(layout));
					} catch {
						return;
					}
				}}
				className="gap-1.5"
			>
				<ResizablePanel
					id="left"
					defaultSize="22%"
					minSize="15%"
					maxSize="40%"
					className={cn(
						"flex flex-col overflow-hidden rounded-[16px] border border-border/50 bg-secondary/50 shadow-sm backdrop-blur-sm",
						"hover:bg-secondary/80",
					)}
				>
					{left}
				</ResizablePanel>

				<PanelResizeHandle />

				<ResizablePanel
					id="center"
					defaultSize="53%"
					minSize="30%"
					className="flex flex-col overflow-hidden rounded-[16px] bg-secondary shadow-sm ring-1 ring-border/50"
				>
					{center}
				</ResizablePanel>

				<PanelResizeHandle />

				<ResizablePanel
					id="right"
					defaultSize="25%"
					minSize="20%"
					maxSize="50%"
					className="flex flex-col overflow-hidden rounded-[16px] border border-border/50 bg-secondary/50 shadow-sm backdrop-blur-sm"
				>
					{right}
				</ResizablePanel>
			</PanelGroup>
		</div>
	);
}
