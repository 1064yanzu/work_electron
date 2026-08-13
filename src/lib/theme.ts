import {
	ALL_THEMES,
	DEFAULT_THEME_ID,
	GLASS_PERF_OVERRIDES,
	THEME_MAP,
	type ThemeDefinition,
} from "./themes/themeDefinitions";

export type ThemeMode = "light" | "dark" | "system";

/**
 * ThemeManager — 管理亮暗模式 + 色彩主题
 * - themeMode: light / dark / system（亮暗切换）
 * - colorThemeId: 色彩主题标识（如 claude / ocean / forest 等）
 */
class ThemeManager {
	private currentMode: ThemeMode = "light";
	private currentColorThemeId: string = DEFAULT_THEME_ID;
	/** 玻璃主题性能模式：关停 backdrop-filter，改用高不透明度纯色背景 */
	private glassPerfMode = false;
	private listeners = new Set<() => void>();
	private themeTransitionTimer: number | null = null;

	constructor() {
		this.loadTheme();
		this.applyTheme();
		// 启动时也同步一次 nativeTheme（桥接未就绪时静默失败，setTheme 时会再同步）
		this.syncNativeTheme(this.currentMode);

		// 监听系统主题变化
		if (typeof window !== "undefined") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			mediaQuery.addEventListener("change", () => {
				if (this.currentMode === "system") {
					this.withThemeTransition(() => this.applyTheme());
					this.notifyListeners();
				}
			});
		}
	}

	/**
	 * 主题切换全局过渡：给 <html> 挂 .theme-transitioning（index.css 里
	 * 对应规则让全局颜色属性做 250ms 过渡），下一帧应用主题，280ms 后摘除。
	 * 仅切换瞬间生效，避免常驻全局 transition 的性能开销；
	 * reduce-motion 用户由 CSS :not() 豁免。
	 */
	private withThemeTransition(apply: () => void) {
		if (typeof document === "undefined") {
			apply();
			return;
		}
		const root = document.documentElement;
		if (this.themeTransitionTimer !== null) {
			window.clearTimeout(this.themeTransitionTimer);
		}
		root.classList.add("theme-transitioning");
		// 下一帧再改变量，保证过渡规则先于颜色变化生效
		requestAnimationFrame(() => apply());
		this.themeTransitionTimer = window.setTimeout(() => {
			root.classList.remove("theme-transitioning");
			this.themeTransitionTimer = null;
		}, 280);
	}

	private loadTheme() {
		const savedMode = localStorage.getItem("theme");
		if (savedMode && ["light", "dark", "system"].includes(savedMode)) {
			this.currentMode = savedMode as ThemeMode;
		}
		const savedColorTheme = localStorage.getItem("colorTheme");
		if (savedColorTheme && THEME_MAP.has(savedColorTheme)) {
			this.currentColorThemeId = savedColorTheme;
		} else if (savedColorTheme === "claude") {
			// 兼容旧版: claude -> classic
			this.currentColorThemeId = "classic";
			localStorage.setItem("colorTheme", "classic");
		}
		this.glassPerfMode = localStorage.getItem("glassPerformanceMode") === "1";
	}

	private applyTheme() {
		const root = document.documentElement;
		let isDark = false;

		if (this.currentMode === "dark") {
			isDark = true;
		} else if (this.currentMode === "system") {
			isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		}

		if (isDark) {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}

		// 注入色彩主题 CSS 变量
		const themeDef =
			THEME_MAP.get(this.currentColorThemeId) ??
			THEME_MAP.get(DEFAULT_THEME_ID)!;
		const colors = isDark ? themeDef.dark : themeDef.light;

		for (const [key, value] of Object.entries(colors)) {
			root.style.setProperty(key, value);
		}

		// 玻璃主题性能模式：背景变量覆盖为高不透明度纯色 + 挂 .glass-perf
		// 供 glassTheme.css 关停 backdrop-filter（CSS 变量走 inline style，
		// 样式表覆盖不了，只能在这里合并注入）
		const glassPerfActive =
			this.currentColorThemeId === "glass" && this.glassPerfMode;
		if (glassPerfActive) {
			const overrides = isDark
				? GLASS_PERF_OVERRIDES.dark
				: GLASS_PERF_OVERRIDES.light;
			for (const [key, value] of Object.entries(overrides)) {
				root.style.setProperty(key, value);
			}
		}
		root.classList.toggle("glass-perf", glassPerfActive);

		// 设置 data-theme 属性方便 CSS 选择器
		root.setAttribute("data-color-theme", this.currentColorThemeId);

		// 把当前背景色持久化，供下次启动消除白屏闪烁：
		// 1) localStorage → index.html 内联脚本在 React 挂载前给 <html> 上底色
		// 2) IPC → 主进程写 userData/window-background.json，BrowserWindow 创建时读取
		// 玻璃主题的 --t-bg 是近透明 rgba（校验不过），持久化会沿用上一主题残值，
		// 冷启动闪出旧底色 —— 特判为玻璃渐变的起点色兜底。
		const persistBg =
			this.currentColorThemeId === "glass"
				? isDark
					? "#0b0713"
					: "#eef2f7"
				: colors["--t-bg"];
		this.persistBackgroundColor(persistBg);
	}

	private persistBackgroundColor(bg: string) {
		const hex = /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : null;
		if (!hex) return;
		try {
			localStorage.setItem("window-bg", hex);
		} catch {
			// 忽略（隐私模式等）
		}
		// 主进程双写为 best-effort；动态 import 避免 theme.ts 在桥接就绪前初始化时报错
		void import("./tauriCompat")
			.then(({ invoke }) => invoke("app_set_window_background", { color: hex }))
			.catch(() => {});
	}

	// ━━━ 亮暗模式 ━━━
	getTheme(): ThemeMode {
		return this.currentMode;
	}

	setTheme(mode: ThemeMode) {
		this.currentMode = mode;
		localStorage.setItem("theme", mode);
		this.withThemeTransition(() => this.applyTheme());
		this.syncNativeTheme(mode);
		this.notifyListeners();
	}

	/** 同步 Electron nativeTheme.themeSource，让原生菜单/对话框/滚动条跟随应用主题 */
	private syncNativeTheme(mode: ThemeMode) {
		void import("./tauriCompat")
			.then(({ invoke }) => invoke("app_set_native_theme", { mode }))
			.catch(() => {});
	}

	// ━━━ 色彩主题 ━━━
	getColorThemeId(): string {
		return this.currentColorThemeId;
	}

	getColorTheme(): ThemeDefinition {
		return (
			THEME_MAP.get(this.currentColorThemeId) ??
			THEME_MAP.get(DEFAULT_THEME_ID)!
		);
	}

	setColorTheme(id: string) {
		if (!THEME_MAP.has(id)) return;
		this.currentColorThemeId = id;
		localStorage.setItem("colorTheme", id);
		this.withThemeTransition(() => this.applyTheme());
		this.notifyListeners();
	}

	getAllThemes(): ThemeDefinition[] {
		return ALL_THEMES;
	}

	// ━━━ 玻璃主题性能模式 ━━━
	getGlassPerformanceMode(): boolean {
		return this.glassPerfMode;
	}

	setGlassPerformanceMode(enabled: boolean) {
		if (this.glassPerfMode === enabled) return;
		this.glassPerfMode = enabled;
		localStorage.setItem("glassPerformanceMode", enabled ? "1" : "0");
		this.withThemeTransition(() => this.applyTheme());
		this.notifyListeners();
	}

	/** 当前实际是否为暗色（考虑 system） */
	isDark(): boolean {
		if (this.currentMode === "dark") return true;
		if (this.currentMode === "system") {
			return window.matchMedia("(prefers-color-scheme: dark)").matches;
		}
		return false;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notifyListeners() {
		this.listeners.forEach((listener) => listener());
	}
}

export const themeManager = new ThemeManager();
