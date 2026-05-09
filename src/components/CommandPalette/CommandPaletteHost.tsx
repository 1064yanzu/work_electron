// 命令面板的"接线器" — 把 App 的设置回调连进去
// App.tsx 直接用这个组件，无需关心 useCommands 内部细节

import { useEffect } from "react";
import {
	terminalStore,
	useTerminalStoreSelector,
} from "../../lib/stores/terminalStore";
import {
	commandPaletteStore,
	useCommandPaletteStore,
} from "../../lib/stores/commandPaletteStore";
import { CommandPalette } from "./CommandPalette";
import { useCommands } from "./useCommands";

interface CommandPaletteHostProps {
	onOpenSettings: (tab?: string) => void;
}

export function CommandPaletteHost(props: CommandPaletteHostProps) {
	const { isOpen, initialQuery } = useCommandPaletteStore();
	const terminalVisible = useTerminalStoreSelector((s) => s.isVisible);

	const commands = useCommands({
		onOpenSettings: props.onOpenSettings,
		onOpenTerminal: terminalVisible
			? undefined
			: () => terminalStore.setVisible(true),
	});

	// 关闭面板时确保焦点不悬挂
	useEffect(() => {
		if (!isOpen) return;
		const handlePopstate = () => commandPaletteStore.close();
		window.addEventListener("popstate", handlePopstate);
		return () => window.removeEventListener("popstate", handlePopstate);
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<CommandPalette
			commands={commands}
			isOpen={isOpen}
			initialQuery={initialQuery}
		/>
	);
}
