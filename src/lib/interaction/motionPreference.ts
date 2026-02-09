export type MotionPreference = "system" | "standard" | "reduced";

export const MOTION_PREFERENCE_CONFIG_KEY = "ui.motion.preference";
export const MOTION_PREFERENCE_EVENT = "ui:motion-preference-change";

export function normalizeMotionPreference(value: unknown): MotionPreference {
	if (value === "standard" || value === "reduced" || value === "system") {
		return value;
	}
	return "system";
}

export function getSystemReducedMotion(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function resolveEffectiveMotionPreference(
	preference: MotionPreference,
	systemReduced = getSystemReducedMotion(),
): "standard" | "reduced" {
	if (preference === "reduced") return "reduced";
	if (preference === "standard") return "standard";
	return systemReduced ? "reduced" : "standard";
}

export function applyMotionPreferenceToDocument(preference: MotionPreference): void {
	if (typeof document === "undefined") return;
	const effective = resolveEffectiveMotionPreference(preference);
	const root = document.documentElement;
	root.dataset.motionPreference = effective;
	root.classList.toggle("motion-reduced", effective === "reduced");
}

export function dispatchMotionPreferenceChange(
	preference: MotionPreference,
): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent(MOTION_PREFERENCE_EVENT, { detail: preference }),
	);
}

export function subscribeSystemMotionPreference(
	callback: () => void,
): () => void {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return () => {};
	}
	const media = window.matchMedia("(prefers-reduced-motion: reduce)");
	const handler = () => callback();
	media.addEventListener("change", handler);
	return () => media.removeEventListener("change", handler);
}

