import { useEffect, useState } from "react";

export type EditorDensity = "comfortable" | "compact";

interface EditorUiPrefs {
	focusMode: boolean;
	density: EditorDensity;
}

const STORAGE_KEY = "editor_ui_prefs_v3";

function loadPrefs(): EditorUiPrefs {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { focusMode: false, density: "comfortable" };
		const parsed = JSON.parse(raw) as Partial<EditorUiPrefs>;
		return {
			focusMode: Boolean(parsed.focusMode),
			density: parsed.density === "compact" ? "compact" : "comfortable",
		};
	} catch {
		return { focusMode: false, density: "comfortable" };
	}
}

export function useEditorUiPrefs() {
	const [prefs, setPrefs] = useState<EditorUiPrefs>(() => loadPrefs());

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
	}, [prefs]);

	return {
		focusMode: prefs.focusMode,
		density: prefs.density,
		toggleFocusMode: () =>
			setPrefs((prev) => ({ ...prev, focusMode: !prev.focusMode })),
		toggleDensity: () =>
			setPrefs((prev) => ({
				...prev,
				density: prev.density === "comfortable" ? "compact" : "comfortable",
			})),
	};
}
