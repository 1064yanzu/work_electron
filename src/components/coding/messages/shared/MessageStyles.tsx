/**
 * 对话消息共享样式常量和工具函数
 * 参考 Claude Code / Codex 的设计语言
 */

/** 用户消息容器样式 */
export const USER_MESSAGE_CLASSES =
	"relative rounded-2xl bg-zinc-100/70 dark:bg-zinc-800/50 px-4 py-3";

/** Assistant 消息容器样式（无背景、扁平） */
export const ASSISTANT_MESSAGE_CLASSES = "relative";

/** Markdown 内容渲染区域样式（覆盖 prose 默认样式） */
export const MARKDOWN_CONTENT_CLASSES =
	"text-[13.5px] leading-[1.7] text-zinc-800 dark:text-zinc-200 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:mb-1";

/** 系统消息分隔线样式 */
export const SYSTEM_DIVIDER_CLASSES =
	"flex items-center gap-3 py-1";

/** 流式输出光标动画 */
export function StreamingCursor() {
	return (
		<span className="inline-flex items-center gap-[3px] ml-1 align-middle">
			<span className="w-[3px] h-[14px] rounded-full bg-[#D96C46] animate-pulse" />
		</span>
	);
}

/** 流式等待指示器（三点脉冲） */
export function StreamingDots() {
	return (
		<div className="flex items-center gap-1 py-1">
			<div className="flex gap-[3px]">
				<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46]/60 animate-[pulse_1.4s_ease-in-out_infinite]" />
				<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46]/60 animate-[pulse_1.4s_ease-in-out_infinite_0.2s]" />
				<div className="w-1.5 h-1.5 rounded-full bg-[#D96C46]/60 animate-[pulse_1.4s_ease-in-out_infinite_0.4s]" />
			</div>
		</div>
	);
}
