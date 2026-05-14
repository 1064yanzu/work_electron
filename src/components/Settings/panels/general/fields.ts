/**
 * FIELDS — 通用 · 外观与主题 / 关于与更新 的可搜索字段清单
 *
 * 与 `AppearancePanel.tsx` / `AboutPanel.tsx` 内渲染的 `data-settings-anchor` 一一对应。
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "general.appearance",
		anchorId: "general.appearance.theme",
		label: "色彩主题",
		description: "切换亮/暗模式与色彩主题（Claude 温暖、日落、深林等）。",
		keywords: ["theme", "color", "light", "dark", "暗色", "亮色", "皮肤"],
	},
	{
		tabId: "general.appearance",
		anchorId: "general.appearance.motion",
		label: "动效偏好",
		description: "控制过渡与动画的时长；减少动效模式下 ≤ 80ms。",
		keywords: ["motion", "animation", "reduced", "减少动效", "动画"],
	},
	{
		tabId: "general.appearance",
		anchorId: "general.appearance.language",
		label: "语言",
		description: "界面语言切换（简体中文 / English）。",
		keywords: ["language", "locale", "i18n", "界面语言"],
	},
	{
		tabId: "general.appearance",
		anchorId: "general.appearance.windows-close",
		label: "Windows 关闭按钮",
		description: "控制点击窗口 X 时隐藏到后台、彻底退出或每次询问。",
		keywords: ["windows", "close", "exit", "quit", "tray", "后台", "退出", "关闭"],
	},
	{
		tabId: "general.about",
		anchorId: "general.about.version",
		label: "当前版本",
		description: "查看当前应用版本，并检查是否有新版本发布。",
		keywords: ["version", "about", "update", "关于", "检查更新"],
	},
];
