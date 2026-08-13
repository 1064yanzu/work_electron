// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：pet（共 27 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type { CustomMascotMeta } from "./common";

export interface PetIpcSchema {
	// ==================
	// 桌面宠物窗口
	// ==================
	pet_window_get_state: {
		input: Record<string, never>;
		output: {
			enabled: boolean;
			x: number;
			y: number;
			throughClicks: boolean;
			mascotId: string;
			sizePreset: "sm" | "md" | "lg" | "xl";
			dwellPreset: "short" | "normal" | "long";
			dndStart: string | null;
			dndEnd: string | null;
			globalShortcutEnabled: boolean;
		};
	};
	pet_window_set_enabled: {
		input: { enabled: boolean };
		output: { success: boolean };
	};
	pet_window_set_position: {
		input: { x: number; y: number };
		output: { success: boolean };
	};
	pet_window_set_through_clicks: {
		input: { enabled: boolean };
		output: { success: boolean };
	};
	pet_window_focus_main: {
		input: Record<string, never>;
		output: { success: boolean };
	};
	pet_window_send_chat: {
		input: { text: string };
		output: { success: boolean };
	};
	pet_window_drag_move: {
		input: { mouseX: number; mouseY: number };
		output: { success: boolean };
	};
	pet_window_drag_start: {
		input: { mouseX: number; mouseY: number };
		output: { success: boolean };
	};
	pet_window_drag_end: {
		input: { vx?: number; vy?: number } | Record<string, never>;
		output: { success: boolean; moved: boolean; x: number; y: number };
	};
	/** 拖动结束后吸附到最近的屏幕边缘（仅水平贴墙） */
	pet_window_snap_to_edge: {
		input: { threshold?: number };
		output: { success: boolean; snapped: boolean; x: number; y: number };
	};
	/** 取宠物窗口当前位置 + 所在显示器工作区几何（用于气泡 placement 计算） */
	pet_window_get_position: {
		input: Record<string, never>;
		output: {
			x: number;
			y: number;
			width: number;
			height: number;
			displayX: number;
			displayY: number;
			displayWidth: number;
			displayHeight: number;
		};
	};
	/** 设置宠物角色尺寸档（持久化 + 通过广播让宠物窗口立即重渲染） */
	pet_window_set_size_preset: {
		input: { preset: "sm" | "md" | "lg" | "xl" };
		output: { success: boolean };
	};
	/** 设置通知停留时长档 */
	pet_window_set_dwell_preset: {
		input: { preset: "short" | "normal" | "long" };
		output: { success: boolean };
	};
	/** 设置勿扰时段（null 关闭勿扰） */
	pet_window_set_dnd: {
		input: { start: string | null; end: string | null };
		output: { success: boolean };
	};
	/** 启用 / 关闭"桌宠全局热键"（默认 Control+Alt+Space） */
	pet_window_set_global_shortcut_enabled: {
		input: { enabled: boolean };
		output: { success: boolean; active: boolean };
	};
	/**
	 * 动态设置鼠标事件忽略模式（精确命中检测用）。
	 * ignore=true  → setIgnoreMouseEvents(true, { forward: true })：透明区域穿透，mousemove 仍转发
	 * ignore=false → setIgnoreMouseEvents(false)：窗口正常捕获全部鼠标事件
	 */
	pet_window_set_mouse_ignore: {
		input: { ignore: boolean };
		output: { success: boolean };
	};
	/**
	 * 让桌宠"说一句话"——主动朗读 + 弹气泡。
	 * 任何地方都可以调用：远程控制 / 番茄钟 / 工作流 / 设置面板试听 等。
	 * 朗读会走 TTSScope: pet（受 scene_pet_enabled / dnd 控制；force=true 可强制）。
	 */
	pet_speak: {
		input: {
			/** 必填：要朗读 + 显示的内容（已是面向用户的最终文案） */
			text: string;
			/** 触发的动作；不传则保持当前 motion */
			motion?:
				| "idle"
				| "greet"
				| "thinking"
				| "done"
				| "sad"
				| "sleepy"
				| "surprise";
			/** 气泡类型：notification（默认）= 自动消失；reminder = 持续直到用户处理 */
			bubble?: "notification" | "reminder";
			/** 气泡前缀（可视为 "小庆祝 / 安抚" 之类的语气提示） */
			prefix?: string;
			/** 气泡 type / reminder kind，用于上色与图标；可省略走默认 */
			notificationType?: "done" | "error" | "approval";
			reminderKind?: "schedule" | "pomodoro" | "approval-waiting";
			/** 强制朗读（忽略 scene_pet_enabled / dnd） */
			force?: boolean;
		};
		output: { success: boolean };
	};
	/**
	 * 桌宠台词生成（LLM 个性化朗读的入口；本期返回话术池兜底，留待后续接 LLM）。
	 * 当 scene_pet_persona_enabled = true 且配置了 provider/model 时，主进程会调 LLM
	 * 生成一句符合人设的台词；否则直接从 personality.ts 的话术池里选一句返回。
	 */
	pet_generate_line: {
		input: {
			/** 事件类型：决定话术池 key */
			event:
				| "thinkingShort"
				| "thinkingMedium"
				| "thinkingLong"
				| "done"
				| "error"
				| "approval"
				| "encouragement"
				| "consolation"
				| "greetFirstTimeToday"
				| "quickSuggestions"
				| "contextSwitchSkin";
			/** 当前 mascot id；用于选话术池 */
			mascotId?: string;
			/** 自定义上下文（如任务标题、错误内容），传给 LLM 当 user prompt */
			context?: string;
		};
		output: {
			text: string;
			source: "llm" | "pool";
		};
	};

	// ==================
	// 桌面宠物 IP（跨窗口同步）
	// ==================
	/** 设置当前宠物 IP，并广播给所有窗口（pet + main）。id 可以是内置 id、"off" 或自定义桌宠 id */
	mascot_set_id: {
		input: {
			id: string;
			source?: "main" | "pet" | "system";
		};
		output: { success: boolean };
	};
	/** 取当前持久化的 IP（启动时初始化用） */
	mascot_get_id: {
		input: Record<string, never>;
		output: { id: string };
	};
	/** 列出所有自定义桌宠（不含内置） */
	mascot_list_custom: {
		input: Record<string, never>;
		output: { mascots: CustomMascotMeta[] };
	};
	/** 导入自定义桌宠 zip 包；zipPath 为空时主进程弹原生文件选择 */
	mascot_import_custom: {
		input: { zipPath?: string };
		output: {
			success: boolean;
			mascot?: CustomMascotMeta;
			/** id 冲突时实际使用的 id（自动加 -2/-3 后缀） */
			finalId?: string;
			/** id 是否被改写（true 时 UI 应提示用户） */
			renamed?: boolean;
			error?: string;
		};
	};
	/**
	 * 从目录导入自定义桌宠（兼容 codex hatch-pet runs/<id> 与 ~/.codex/pets/<id>）
	 * - dirPath 为空时主进程弹原生目录选择
	 * - 与 zip 导入共享同一套校验 / 派生 / 写盘逻辑
	 */
	mascot_import_custom_dir: {
		input: { dirPath?: string };
		output: {
			success: boolean;
			mascot?: CustomMascotMeta;
			finalId?: string;
			renamed?: boolean;
			error?: string;
		};
	};
	/** 删除自定义桌宠；若它是当前选中，自动改回 "efficiency" 并广播 mascot-id-changed */
	mascot_delete_custom: {
		input: { id: string };
		output: { success: boolean; error?: string };
	};
	/** 编辑自定义桌宠的 meta（label / tagline / personality / accentColor） */
	mascot_update_custom_meta: {
		input: {
			id: string;
			label?: string;
			tagline?: string;
			personality?: string;
			accentColor?: string;
		};
		output: { success: boolean; mascot?: CustomMascotMeta; error?: string };
	};
	/** 备用——查询自定义桌宠某个 slot 的资源 URL（一般渲染层直接走 mascot:// 不需要这个） */
	mascot_get_custom_asset_url: {
		input: { id: string; slot: string };
		output: { url: string | null };
	};
	/**
	 * 主动触发宠物 reminder 气泡（番茄钟 / 外部 cron / 通知服务的接入点）。
	 * 本次只暴露通道，不绑定具体触发器。
	 */
	"pet-trigger-reminder": {
		input: {
			kind: "schedule" | "pomodoro" | "approval-waiting";
			title: string;
			detail?: string;
			id?: string;
		};
		output: { success: boolean };
	};
}
