// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：system（共 15 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { AppCloseBehavior } from "./common";

export interface SystemIpcSchema {
	// ==================
	// 系统命令
	// ==================
	app_get_version: {
		input: Record<string, never>;
		output: {
			appVersion: string;
			electron: string;
			chrome: string;
			node: string;
		};
	};
	health_ping: {
		input: { ts: number };
		output: { ts: number };
	};
	/**
	 * 查询主窗口当前是否处于前台（focused + visible）。
	 * 主要给桌宠窗口用：主窗口前台时桌宠抑制 TTS 播报，避免与主窗口的对话朗读重复。
	 * 实时变化会通过 `main-window-focus-changed` 事件主动推送，此命令用于初次同步。
	 */
	main_window_is_focused: {
		input: Record<string, never>;
		output: { focused: boolean };
	};
	/**
	 * Windows 主窗口关闭按钮行为。
	 * - ask：每次点 X 弹出原生选择框
	 * - hide_to_tray：隐藏主窗口，后台服务与桌宠继续运行
	 * - quit：彻底退出应用，before-quit 会同步销毁桌宠
	 */
	app_get_close_behavior: {
		input: Record<string, never>;
		output: { windows: AppCloseBehavior; platform: NodeJS.Platform };
	};
	app_set_close_behavior: {
		input: { windows: AppCloseBehavior };
		output: { success: boolean; windows: AppCloseBehavior };
	};
	system_get_user_info: {
		input: Record<string, never>;
		output: {
			username: string;
			platform: NodeJS.Platform;
		};
	};
	/**
	 * 渲染端应用主题后把当前窗口背景色持久化到 userData/window-background.json，
	 * 主进程下次启动创建 BrowserWindow 时读取，消除启动白屏闪烁。
	 * color 必须是 #RRGGBB 格式。
	 */
	app_set_window_background: {
		input: { color: string };
		output: { success: boolean };
	};
	/**
	 * 渲染端切换亮暗模式时同步 nativeTheme.themeSource，
	 * 让原生菜单 / 对话框 / 滚动条等系统 UI 跟随应用主题。
	 */
	app_set_native_theme: {
		input: { mode: "light" | "dark" | "system" };
		output: { success: boolean };
	};
	/**
	 * 渲染端把全局未捕获错误 / unhandled promise rejection / 警告
	 * 推送给主进程的 winston，弥补生产构建剥离 console 后的盲区。
	 * 渲染端在 src/main.tsx 注册 window error/unhandledrejection 监听并调用此命令。
	 */
	log_renderer_event: {
		input: {
			level: "warn" | "error";
			message: string;
			source?: string;
			stack?: string;
			location?: { url?: string; line?: number; column?: number };
		};
		output: { success: boolean };
	};
	http_get_status: {
		input: Record<string, never>;
		output: {
			/**
			 * 剪藏服务。`token` 需要展示在设置面板供浏览器扩展/书签脚本配置；
			 * 调用 `POST /api/clip` 时通过 `x-api-key` 或 `Authorization: Bearer` 携带。
			 */
			clip: { port: number; baseUrl: string; token: string };
			/** Anthropic 兼容代理；`token` 由主进程下发给 Agent SDK，渲染端一般不需要。 */
			anthropicProxy: { port: number; baseUrl: string; token: string };
		};
	};
	/** 轮换某个本地 HTTP 服务的访问 token（用户怀疑泄漏时）。 */
	http_rotate_service_token: {
		input: { service: "clip" | "anthropic_proxy" };
		output: { success: boolean; token?: string; error?: string };
	};

	// ==================
	// System / Shell
	// ==================
	open_external_url: {
		input: { url: string };
		output: { success: boolean; error?: string };
	};

	set_log_file_level: {
		input: { level: "error" | "warn" | "info" | "debug" | "default" };
		output: { success: boolean; effective_level: string };
	};
	system_pick_directory: {
		input: { title?: string };
		output: { path: string | null };
	};
	clear_cache: {
		input: Record<string, never>;
		output: number;
	};
}
