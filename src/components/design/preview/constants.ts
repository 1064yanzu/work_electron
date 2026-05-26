/**
 * Design 预览界面共享常量。
 * 视口预设、缩放级别、特殊 tab 标识，全部抽到这里以避免散落在多个组件里。
 */

export const DESIGN_FILES_TAB = "__design_files__";

export type DesignViewport = "desktop" | "tablet" | "mobile";

export const VIEWPORT_PRESETS: Record<
	DesignViewport,
	{ width: number; height: number; label: string }
> = {
	desktop: { width: 1280, height: 800, label: "Desktop" },
	tablet: { width: 820, height: 1180, label: "Tablet" },
	mobile: { width: 390, height: 844, label: "Mobile" },
};

export const ZOOM_MIN = 25;
export const ZOOM_MAX = 400;
export const ZOOM_STEP = 25;

export const ZOOM_STEPS: number[] = (() => {
	const arr: number[] = [];
	for (let z = ZOOM_MIN; z <= ZOOM_MAX; z += ZOOM_STEP) arr.push(z);
	return arr;
})();
