import type { SettingsExperienceMode } from "../components/Settings/types";

const EXPERIENCE_MODE_KEY = "settings.ui.experience_mode";
const TECHNICAL_GROUP_EXPANDED_KEY = "settings.ui.technical_group_expanded";

export const DEFAULT_SETTINGS_EXPERIENCE_MODE: SettingsExperienceMode =
	"simple";
export const DEFAULT_TECHNICAL_GROUP_EXPANDED = false;

function isBrowser() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getSettingsExperienceMode(): SettingsExperienceMode {
	if (!isBrowser()) return DEFAULT_SETTINGS_EXPERIENCE_MODE;
	try {
		const stored = localStorage.getItem(EXPERIENCE_MODE_KEY);
		return stored === "geek" ? "geek" : DEFAULT_SETTINGS_EXPERIENCE_MODE;
	} catch {
		return DEFAULT_SETTINGS_EXPERIENCE_MODE;
	}
}

export function setSettingsExperienceMode(mode: SettingsExperienceMode) {
	if (!isBrowser()) return;
	try {
		localStorage.setItem(EXPERIENCE_MODE_KEY, mode);
	} catch {
		// ignore
	}
}

export function getTechnicalGroupExpandedPreference() {
	if (!isBrowser()) return DEFAULT_TECHNICAL_GROUP_EXPANDED;
	try {
		return localStorage.getItem(TECHNICAL_GROUP_EXPANDED_KEY) === "true";
	} catch {
		return DEFAULT_TECHNICAL_GROUP_EXPANDED;
	}
}

export function setTechnicalGroupExpandedPreference(expanded: boolean) {
	if (!isBrowser()) return;
	try {
		localStorage.setItem(TECHNICAL_GROUP_EXPANDED_KEY, String(expanded));
	} catch {
		// ignore
	}
}
