export type ThemeMode = "light" | "dark" | "system";

class ThemeManager {
	private currentTheme: ThemeMode = "light";
	private listeners = new Set<() => void>();

	constructor() {
		this.loadTheme();
		this.applyTheme();

		// 监听系统主题变化
		if (typeof window !== "undefined") {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			mediaQuery.addEventListener("change", () => {
				if (this.currentTheme === "system") {
					this.applyTheme();
					this.notifyListeners();
				}
			});
		}
	}

	private loadTheme() {
		const saved = localStorage.getItem("theme");
		if (saved && ["light", "dark", "system"].includes(saved)) {
			this.currentTheme = saved as ThemeMode;
		}
	}

	private applyTheme() {
		const root = document.documentElement;
		let isDark = false;

		if (this.currentTheme === "dark") {
			isDark = true;
		} else if (this.currentTheme === "system") {
			isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		}

		if (isDark) {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}
	}

	getTheme(): ThemeMode {
		return this.currentTheme;
	}

	setTheme(theme: ThemeMode) {
		this.currentTheme = theme;
		localStorage.setItem("theme", theme);
		this.applyTheme();
		this.notifyListeners();
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
