import { ArrowUp, AtSign, ChevronUp, Mic, Plus } from "lucide-react";
import { prefetchChatContext } from "../../../lib/query";
import type { Model } from "../ModelSelector";
import { StyleProfilePill } from "../StyleProfilePill";
import { ThinkingLevelPill } from "../ThinkingLevelPill";
import { Tooltip } from "../../ui/Tooltip";

interface ChatInputToolbarProps {
	expanded: boolean;
	disabled: boolean;
	hasContent: boolean;
	model?: string;
	models: Model[];
	isModelSelectorOpen: boolean;
	onToggleModelSelector: () => void;
	onTriggerFilePicker: () => void;
	onTriggerSlashMenu: () => void;
	onSubmit: () => void;
}

/**
 * 输入框底部工具栏。
 *
 * 同时渲染两套：
 * - 展开态（max-h 60，显示完整工具栏）
 * - 折叠态（只显示发送按钮）
 *
 * 通过 `expanded` 控制 max-height + opacity 动效，避免 React 切换组件时丢动画。
 */
export function ChatInputToolbar({
	expanded,
	disabled,
	hasContent,
	model,
	models,
	isModelSelectorOpen,
	onToggleModelSelector,
	onTriggerFilePicker,
	onTriggerSlashMenu,
	onSubmit,
}: ChatInputToolbarProps) {
	const submitDisabled = disabled || !hasContent;
	const sendButtonClass = `
		flex items-center justify-center w-8 h-8 rounded-full
		transition-[background-color,opacity,transform] duration-200 cursor-pointer active:scale-90
		${
			hasContent
				? "bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900 hover:opacity-90"
				: "bg-warm-200 dark:bg-cream-700/50 text-text-muted disabled:cursor-not-allowed"
		}
	`;

	return (
		<>
			{/* 展开态完整工具栏 */}
			<div
				className={`
					overflow-hidden transition-all duration-300 ease-out
					${expanded ? "max-h-[60px] opacity-100" : "max-h-0 opacity-0"}
				`}
			>
				<div className="mx-4 border-t border-warm-200/40 dark:border-warm-700/30" />
				<div className="flex items-center justify-between px-3 py-2">
					{/* 左侧：圆形按钮组 */}
					<div className="flex items-center gap-1">
						<Tooltip content="添加附件" placement="top">
							<button
								onClick={onTriggerFilePicker}
								aria-label="添加附件"
								className="w-8 h-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-warm-200/80 dark:hover:bg-cream-700/50 transition-all duration-150 cursor-pointer active:scale-95"
							>
								<Plus className="w-4 h-4" strokeWidth={1.5} />
							</button>
						</Tooltip>

						<Tooltip content="命令菜单 (/)" placement="top">
							<button
								onClick={onTriggerSlashMenu}
								onMouseEnter={prefetchChatContext}
								aria-label="命令菜单"
								className="w-8 h-8 flex items-center justify-center rounded-full bai-icon-mint hover:bg-mint-100/70 dark:hover:bg-cream-700/50 transition-all duration-150 cursor-pointer active:scale-95"
							>
								<AtSign className="w-3.5 h-3.5" strokeWidth={1.5} />
							</button>
						</Tooltip>

						{/* 模型选择器 — pill tag（弹出面板在容器外渲染） */}
						{models.length > 0 && (
							<div className="relative ml-0.5">
								<button
									onClick={onToggleModelSelector}
									className={`
										flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full
										transition-[background-color,color] duration-150 cursor-pointer
										${
											isModelSelectorOpen
												? "bg-warm-200 dark:bg-cream-700 text-text-primary"
												: "text-text-muted hover:text-text-primary hover:bg-warm-200/60 dark:hover:bg-cream-700/40"
										}
									`}
								>
									<ChevronUp
										className={`w-3 h-3 transition-transform duration-200 ${isModelSelectorOpen ? "" : "rotate-180"}`}
										strokeWidth={1.5}
									/>
									<span className="font-medium truncate max-w-[100px]">
										{model ? model.split("/").pop()?.slice(0, 16) : "Auto"}
									</span>
								</button>
							</div>
						)}

						{/* 思考程度 pill — 紧邻模型选择，直接透传 SDK effort */}
						<ThinkingLevelPill />

						{/* 语言风格包 pill */}
						<StyleProfilePill />
					</div>

					{/* 右侧：语音 + 发送按钮 */}
					<div className="flex items-center gap-1.5">
						<Tooltip content="语音输入" placement="top">
							<button
								aria-label="语音输入"
								className="w-8 h-8 flex items-center justify-center rounded-full bai-icon-violet hover:bg-violetx-100/70 dark:hover:bg-cream-700/40 transition-all duration-150 cursor-pointer active:scale-95"
							>
								<Mic className="w-3.5 h-3.5" strokeWidth={1.5} />
							</button>
						</Tooltip>
						<button
							onClick={onSubmit}
							disabled={submitDisabled}
							aria-label="发送消息"
							className={sendButtonClass}
						>
							<ArrowUp className="w-4 h-4" strokeWidth={2} />
						</button>
					</div>
				</div>
			</div>

			{/* 折叠态迷你工具栏 — 只显示发送按钮 */}
			<div
				className={`
					overflow-hidden transition-all duration-300 ease-out
					${!expanded ? "max-h-[48px] opacity-100" : "max-h-0 opacity-0"}
				`}
			>
				<div className="flex items-center justify-end px-3 py-2">
					<button
						onClick={onSubmit}
						disabled={submitDisabled}
						aria-label="发送消息"
						className={`
							flex items-center justify-center w-8 h-8 rounded-full
							transition-[background-color,opacity,transform] duration-200 cursor-pointer active:scale-90
							${
								hasContent
									? "bg-cream-900 dark:bg-cream-100 text-cream-100 dark:text-cream-900 hover:opacity-90"
									: "bg-warm-200 dark:bg-cream-700/40 text-text-muted/30 disabled:cursor-not-allowed"
							}
						`}
					>
						<ArrowUp className="w-4 h-4" strokeWidth={2} />
					</button>
				</div>
			</div>
		</>
	);
}
