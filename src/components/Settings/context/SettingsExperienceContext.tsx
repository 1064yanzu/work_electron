import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import {
	getSettingsExperienceMode,
	getTechnicalGroupExpandedPreference,
	setSettingsExperienceMode,
	setTechnicalGroupExpandedPreference,
} from "../../../lib/settingsUiPreferences";
import type { SettingsExperienceMode } from "../types";

interface SettingsExperienceContextValue {
	mode: SettingsExperienceMode;
	setMode: (mode: SettingsExperienceMode) => void;
	technicalGroupExpanded: boolean;
	setTechnicalGroupExpanded: (expanded: boolean) => void;
	showTechnicalSummaries: boolean;
}

const SettingsExperienceContext =
	createContext<SettingsExperienceContextValue | null>(null);

export function SettingsExperienceProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [mode, setModeState] = useState<SettingsExperienceMode>(() =>
		getSettingsExperienceMode(),
	);
	const [technicalGroupExpanded, setTechnicalGroupExpandedState] = useState(
		() => getTechnicalGroupExpandedPreference(),
	);

	const setMode = useCallback((nextMode: SettingsExperienceMode) => {
		setModeState(nextMode);
		setSettingsExperienceMode(nextMode);
	}, []);

	const setTechnicalGroupExpanded = useCallback((expanded: boolean) => {
		setTechnicalGroupExpandedState(expanded);
		setTechnicalGroupExpandedPreference(expanded);
	}, []);

	const value = useMemo<SettingsExperienceContextValue>(
		() => ({
			mode,
			setMode,
			technicalGroupExpanded,
			setTechnicalGroupExpanded,
			showTechnicalSummaries: mode === "simple",
		}),
		[mode, setMode, technicalGroupExpanded, setTechnicalGroupExpanded],
	);

	return (
		<SettingsExperienceContext.Provider value={value}>
			{children}
		</SettingsExperienceContext.Provider>
	);
}

export function useSettingsExperience() {
	const context = useContext(SettingsExperienceContext);
	if (!context) {
		throw new Error(
			"useSettingsExperience 必须在 SettingsExperienceProvider 内使用",
		);
	}
	return context;
}
