import type { Theme } from "../../types";
import { safeInvoke } from "../tauriBridge";

export async function listThemes(): Promise<Theme[]> {
	return await safeInvoke("theme_list");
}

export async function createTheme(name: string): Promise<Theme> {
	return await safeInvoke("theme_create", { name });
}

export async function renameTheme(id: string, name: string): Promise<Theme> {
	return await safeInvoke("theme_rename", { id, name });
}

export async function deleteTheme(id: string): Promise<{ success: boolean }> {
	return await safeInvoke("theme_delete", { id });
}
