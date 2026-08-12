export type MotionPreference = "system" | "standard" | "reduced" | "expressive";

/** 解析后的实际档位（system 已被解开）。 */
export type EffectiveMotionLevel = "reduced" | "standard" | "expressive";

export const MOTION_PREFERENCE_CONFIG_KEY = "ui.motion.preference";
export const MOTION_PREFERENCE_EVENT = "ui:motion-preference-change";

export function normalizeMotionPreference(value: unknown): MotionPreference {
	if (
		value === "standard" ||
		value === "reduced" ||
		value === "expressive" ||
		value === "system"
	) {
		return value;
	}
	return "system";
}

export function getSystemReducedMotion(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return false;
	}
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function resolveEffectiveMotionPreference(
	preference: MotionPreference,
	systemReduced = getSystemReducedMotion(),
): EffectiveMotionLevel {
	if (preference === "reduced") return "reduced";
	if (preference === "standard") return "standard";
	if (preference === "expressive") return "expressive";
	// system：尊重系统偏好，否则走「丰富动效」默认档
	return systemReduced ? "reduced" : "expressive";
}

export function applyMotionPreferenceToDocument(
	preference: MotionPreference,
): void {
	if (typeof document === "undefined") return;
	const effective = resolveEffectiveMotionPreference(preference);
	const root = document.documentElement;
	root.dataset.motionPreference = effective;
	// 注意：`.motion-reduced` 只在 reduced 档挂，index.css 的全局消杀规则
	// 与 Modal / Collapsible / SettingsDisclosure 的 `=== "reduced"` 判断
	// 都只认这一个值，新增 expressive 档不命中任何既有分支。
	root.classList.toggle("motion-reduced", effective === "reduced");
	// GSAP 的 JS tween 不受 index.css 的 !important 消杀影响，需要单独兜底。
	// 这里用事件解耦，避免 interaction 层反向依赖 lib/motion。
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(MOTION_LEVEL_APPLIED_EVENT, { detail: effective }),
		);
	}
}

/** 档位「已落到 DOM」的通知（携带解析后的 EffectiveMotionLevel）。 */
export const MOTION_LEVEL_APPLIED_EVENT = "ui:motion-level-applied";

/** 从 `<html data-motion-preference>` 同步读当前生效档位。 */
export function readEffectiveMotionLevel(): EffectiveMotionLevel {
	if (typeof document === "undefined") return "standard";
	const value = document.documentElement.dataset.motionPreference;
	if (value === "reduced" || value === "standard" || value === "expressive") {
		return value;
	}
	// 属性还没写上（首帧）时按系统偏好推断，避免闪一帧全量动效
	return getSystemReducedMotion() ? "reduced" : "expressive";
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
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return () => {};
	}
	const media = window.matchMedia("(prefers-reduced-motion: reduce)");
	const handler = () => callback();
	media.addEventListener("change", handler);
	return () => media.removeEventListener("change", handler);
}
