import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

export const PanelGroup = Group;
export const ResizablePanel = Panel;
export const PanelResizeHandle = ({
	className,
	...props
}: React.ComponentProps<typeof Separator>) => (
	<Separator
		className={cn(
			"group relative flex w-2 -mx-1 items-stretch justify-center bg-transparent outline-none",
			"cursor-col-resize aria-[orientation=horizontal]:cursor-row-resize",
			"touch-none select-none",
			className,
		)}
		{...props}
	>
		<div className="w-px flex-1 bg-transparent transition-colors group-hover:bg-primary/20" />
		<div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-primary/20" />
	</Separator>
);
