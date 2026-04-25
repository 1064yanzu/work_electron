import {
	ALL_THEMES,
	DEFAULT_THEME_ID,
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
	private listeners = new Set<() => void>();

	constructor() {
		this.loadTheme();
		this.applyTheme();

		// 监听系统主题变化
		if (typeof window !== "undefined") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			mediaQuery.addEventListener("change", () => {
				if (this.currentMode === "system") {
					this.applyTheme();
					this.notifyListeners();
				}
			});
		}
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

		// 设置 data-theme 属性方便 CSS 选择器
		root.setAttribute("data-color-theme", this.currentColorThemeId);
	}

	// ━━━ 亮暗模式 ━━━
	getTheme(): ThemeMode {
		return this.currentMode;
	}

	setTheme(mode: ThemeMode) {
		this.currentMode = mode;
		localStorage.setItem("theme", mode);
		this.applyTheme();
		this.notifyListeners();
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
		this.applyTheme();
		this.notifyListeners();
	}

	getAllThemes(): ThemeDefinition[] {
		return ALL_THEMES;
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
