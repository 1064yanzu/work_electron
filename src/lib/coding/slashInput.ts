import { getSlashCommandById } from "./codingSlashCommands";

export interface ParsedSlashInput {
	menuQuery: string;
	submenuCommandId: string | null;
	submenuQuery: string;
}

export function parseSlashInput(value: string): ParsedSlashInput {
	const raw = value.startsWith("/") ? value.slice(1) : value;
	const normalized = raw.trim();
	if (!normalized) {
		return {
			menuQuery: "",
			submenuCommandId: null,
			submenuQuery: "",
		};
	}

	const [commandToken, ...rest] = normalized.split(/\s+/);
	const command = getSlashCommandById(commandToken);
	if (command?.type === "submenu") {
		return {
			menuQuery: commandToken,
			submenuCommandId: command.id,
			submenuQuery: rest.join(" ").trim(),
		};
	}

	return {
		menuQuery: normalized,
		submenuCommandId: null,
		submenuQuery: "",
	};
}
