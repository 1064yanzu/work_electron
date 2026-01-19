type KeyHandler = (event: KeyboardEvent) => void;

interface Shortcut {
	key: string;
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
	meta?: boolean; // Command key on Mac
	handler: KeyHandler;
	description: string;
}

class ShortcutManager {
	private shortcuts: Shortcut[] = [];
	private enabled = true;

	constructor() {
		if (typeof window !== "undefined") {
			window.addEventListener("keydown", this.handleKeyDown.bind(this));
		}
	}

	register(shortcut: Shortcut) {
		this.shortcuts.push(shortcut);
		return () => {
			this.shortcuts = this.shortcuts.filter((s) => s !== shortcut);
		};
	}

	private handleKeyDown = (event: KeyboardEvent) => {
		if (!this.enabled) return;

		// 忽略输入框内的快捷键
		const target = event.target as HTMLElement;
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		) {
			// 只允许 Cmd+S / Ctrl+S
			if (!(event.key === "s" && (event.metaKey || event.ctrlKey))) {
				return;
			}
		}

		for (const shortcut of this.shortcuts) {
			const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase();
			const ctrlMatch =
				shortcut.ctrl === undefined || shortcut.ctrl === event.ctrlKey;
			const shiftMatch =
				shortcut.shift === undefined || shortcut.shift === event.shiftKey;
			const altMatch =
				shortcut.alt === undefined || shortcut.alt === event.altKey;
			const metaMatch =
				shortcut.meta === undefined || shortcut.meta === event.metaKey;

			if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
				event.preventDefault();
				shortcut.handler(event);
				return;
			}
		}
	};

	setEnabled(enabled: boolean) {
		this.enabled = enabled;
	}

	getShortcuts() {
		return [...this.shortcuts];
	}
}

export const shortcutManager = new ShortcutManager();

// 默认快捷键
export const DEFAULT_SHORTCUTS = {
	SAVE: { key: "s", meta: true, ctrl: true, description: "保存" },
	SETTINGS: { key: ",", meta: true, ctrl: true, description: "打开设置" },
	NEW_SOURCE: { key: "n", meta: true, ctrl: true, description: "新建来源" },
	SEARCH: { key: "k", meta: true, ctrl: true, description: "搜索" },
	TOGGLE_SIDEBAR: {
		key: "b",
		meta: true,
		ctrl: true,
		description: "切换侧边栏",
	},
};
