import {
	MOTION_PREFERENCE_CONFIG_KEY,
	MOTION_PREFERENCE_EVENT,
	normalizeMotionPreference,
	type MotionPreference,
} from "../interaction/motionPreference";
import { getConfig, setConfig } from "./core";

let cachedMotionPreference: MotionPreference = "system";
let cachedMotionPreferenceLoaded = false;

export async function getMotionPreference(
	forceRefresh = false,
): Promise<MotionPreference> {
	if (cachedMotionPreferenceLoaded && !forceRefresh) {
		return cachedMotionPreference;
	}

	try {
		const value = await getConfig(MOTION_PREFERENCE_CONFIG_KEY);
		cachedMotionPreference = normalizeMotionPreference(value);
	} catch {
		cachedMotionPreference = "system";
	}

	cachedMotionPreferenceLoaded = true;
	return cachedMotionPreference;
}

export async function setMotionPreference(
	preference: MotionPreference,
): Promise<void> {
	const normalized = normalizeMotionPreference(preference);
	cachedMotionPreference = normalized;
	cachedMotionPreferenceLoaded = true;
	await setConfig(MOTION_PREFERENCE_CONFIG_KEY, normalized);
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(MOTION_PREFERENCE_EVENT, { detail: normalized }),
		);
	}
}
