/**
 * Streaming session 接口 —— Agent 边生成边更新 IM 消息
 *
 * 实现策略因渠道而异：
 * - feishu: CardKit Streaming（`streaming_mode: true`，真实流式显示）—— 移植自 openclaw
 * - telegram: editMessageText（需 throttle 到 ~200ms/次，避免 100/min 限制）
 * - slack: chat.update（thread 内编辑）
 * - discord: message.edit（2000 字符上限）
 * - qqbot: edit（C2C/Group 支持有限）
 * - wechat (个人微信): 降级为分段发送
 */

import { mergeStreamingText } from "./streaming-merge";

/**
 * 远程终端快捷按钮规格（pty 桥专用扩展）。
 *
 * 通过 `ChannelStreamingStartOptions.terminalShortcuts` 传入；当前仅飞书
 * CardKit streaming card 会渲染成可点击按钮，其它渠道无视该字段并退化到
 * 文本短指令（参见 ptyCommandParser.tryParseTerminalShortcut）。
 */
export type TerminalShortcutAction =
	| {
			kind: "key";
			/** 显示文本（按钮 label） */
			label: string;
			/** 对应 ptyCommandParser.CliKeyName */
			key: string;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "stop";
			label: string;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "text";
			label: string;
			/** 注入 pty 的纯文本（不会自动追加换行；由调用方决定是否带 \n） */
			text: string;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "scroll";
			label: string;
			/** 对应 ptyCommandParser.CliScrollDir */
			dir: "up" | "down" | "top" | "bottom" | "page-up" | "page-down";
			amount?: number;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "more";
			label: string;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "confirm";
			label: string;
			style?: "primary" | "secondary" | "danger";
	  }
	| {
			kind: "cancel";
			label: string;
			style?: "primary" | "secondary" | "danger";
	  };

export type ChannelStreamingStartOptions = {
	/** 可选标题（feishu 卡片的标题，其他渠道可忽略） */
	title?: string;
	/** 颜色/模板（feishu: blue/green/...；其他渠道可忽略） */
	template?: string;
	/** 末尾的 note 信息（例如「模型 gpt-4o · 耗时 12s」） */
	note?: string;
	/** 回复特定 message id */
	replyToMessageId?: string;
	/** 子线程 id */
	threadId?: string;
	/**
	 * 远程终端快捷按钮组。
	 *
	 * 按顺序渲染为一组（飞书 CardKit 内会自动换行），最多建议 12 个，超出可能
	 * 被截断。每行最多 4 个按钮。
	 */
	terminalShortcuts?: TerminalShortcutAction[];
	/**
	 * 内容渲染格式提示。channel 根据自己能力决定如何呈现：
	 *   - "plain"     纯文本（兜底）
	 *   - "ansi"      含 ANSI 转义（Discord ```​ansi codeblock 原生渲染；其他渠道
	 *                 应自行 strip 或降级）
	 *   - "markdown"  渠道 markdown 友好（飞书：用 **bold** + 区块；slack: mrkdwn）
	 *
	 * 仅作提示，channel 可忽略并按自己默认行为渲染。
	 */
	format?: "plain" | "ansi" | "markdown";
};

/**
 * Streaming 会话接口。每个 Agent run 对应一个 session。
 */
export interface ChannelStreamingSession {
	/** 启动 session，发送初始消息（例如「⏳ Thinking...」） */
	start(options?: ChannelStreamingStartOptions): Promise<void>;
	/** 增量更新内容（传入**完整**累计文本，内部会 merge 处理断点） */
	update(text: string): Promise<void>;
	/** 结束 session，把最终文本 flush，追加 note */
	close(finalText?: string, options?: { note?: string }): Promise<void>;
	/** 当前是否仍在运行 */
	isActive(): boolean;
	/** 流式输出的 message_id（供外层做 react/edit/pin 等） */
	getMessageId(): string | undefined;
	/**
	 * 动态替换按钮组（用于上下文感知按钮）。channel 可选实现：
	 *   - 飞书：通过 CardKit patch 替换 actions 区
	 *   - telegram：editMessageReplyMarkup
	 *   - slack/discord：chat.update / message.edit 重写 blocks/components
	 * 未实现时调用方应静默忽略。
	 */
	updateShortcuts?(shortcuts: TerminalShortcutAction[]): Promise<void>;
}

/**
 * Streaming 工厂接口 —— channel plugin 提供给 SDK 的对象。
 */
export type ChannelStreamingFactory = {
	/** 当前渠道是否启用 streaming（由配置决定） */
	isEnabled(): boolean;
	/** 开启一个 streaming session，绑定到特定会话 */
	openSession(params: {
		targetId: string;
		threadId?: string;
		replyToMessageId?: string;
	}): ChannelStreamingSession;
};

export { mergeStreamingText };
