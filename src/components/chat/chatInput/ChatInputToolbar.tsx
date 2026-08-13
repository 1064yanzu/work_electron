// 输入框底栏 —— 参考 Codex：控件全裸态、左右分栏，只有发送键是实心。
//
//   [+]  ⚡执行 ˅                          ◈ sonnet-4-5 高 ˅   [↑]
//   └── 左：加内容 / 改行为 ──┘            └── 右：用哪个模型 · 发送 ──┘
//
// 三轮返工的教训，写在这里免得再跑偏：
//
//   1. 别给控件套胶囊底。Codex 底栏控件全是裸的，统一感来自
//      同高度 / 同字号 / 同色阶 / 同间距，套壳只会让一行像一排药片。
//   2. 别为了多塞一个控件而缩尺寸。上一版 28px 高 / 14px 图标 / 11.5px 文字 /
//      4px 间距，全挤在左边 —— 小且挤本身就是丑。现在 32 / 17 / 12.5 / 8，
//      宁可把低频的风格包挪进 `+` 菜单，也不缩控件。
//   3. 左右要平衡。全部左对齐 + 右边孤零零一个发送键，看着就是没设计过。
//      左边管「加什么 / 怎么跑」，右边管「用哪个模型 / 发出去」。
//
// 另外：思考程度不是独立控件，而是模型项的次要值（`sonnet-4-5 高`），
// 与 Codex 的 `5.6 Luna 高 ˅` 同构 —— 强相关的两个设置合成一格。

import { ArrowUp, Box, Square } from "lucide-react";
import { THINKING_LEVEL_LABELS } from "../../../lib/models/agentModelConfig";
import { cn } from "../../../lib/utils";
import { PlanModeToggle } from "../../agent/PlanModeToggle";
import { getModelIcon } from "../../Settings/modelIcons";
import { Tooltip } from "../../ui/Tooltip";
import type { Model } from "../ModelSelector";
import { ChatInputAddMenu } from "./ChatInputAddMenu";
import {
	type InputDensity,
	MODEL_VALUE_MAX_WIDTH,
	showsPillValue,
} from "./density";
import { useThinkingLevel } from "./ThinkingLevelRow";
import { formatModelLabel, ToolbarItem } from "./ToolbarPrimitives";

interface ChatInputToolbarProps {
	density: InputDensity;
	disabled: boolean;
	hasContent: boolean;
	model?: string;
	models: Model[];
	isModelSelectorOpen: boolean;
	onToggleModelSelector: () => void;
	onTriggerFilePicker: () => void;
	onTriggerSlashMenu: () => void;
	onSubmit: () => void;
	/** 未传 onTogglePlanMode 时不渲染运行模式项（非 Agent 场景） */
	planMode?: boolean;
	onTogglePlanMode?: (enabled: boolean) => void;
	/**
	 * AI 正在响应（流式 / Agent 执行中）。为 true 且传了 onStop 时，
	 * 发送键原位变成停止键 —— 与 Claude / Codex 同构，不再在输入框上方
	 * 悬浮一颗会造成布局跳动的「停止响应」胶囊。
	 */
	isResponding?: boolean;
	onStop?: () => void;
}

export function ChatInputToolbar({
	density,
	disabled,
	hasContent,
	model,
	models,
	isModelSelectorOpen,
	onToggleModelSelector,
	onTriggerFilePicker,
	onTriggerSlashMenu,
	onSubmit,
	planMode,
	onTogglePlanMode,
	isResponding = false,
	onStop,
}: ChatInputToolbarProps) {
	const showValue = showsPillValue(density);
	const showStop = isResponding && Boolean(onStop);
	const submitDisabled = disabled || !hasContent;
	const thinkingLevel = useThinkingLevel();
	const modelIcon = model ? getModelIcon(model) : undefined;

	return (
		<div className="flex items-center gap-1.5 px-2.5 pb-2 pt-0">
			{/* 左：加内容 / 改行为 */}
			<ChatInputAddMenu
				disabled={disabled}
				onTriggerFilePicker={onTriggerFilePicker}
				onTriggerSlashMenu={onTriggerSlashMenu}
			/>

			{onTogglePlanMode && (
				<PlanModeToggle
					planMode={planMode ?? false}
					onToggle={onTogglePlanMode}
					disabled={disabled}
					showValue={showValue}
				/>
			)}

			{/* 弹性留白 —— 左右两组之间的呼吸；min-w-0 保证极窄时能压到 0 */}
			<div className="flex-1 min-w-0" />

			{/* 右：用哪个模型 · 发送 */}
			{models.length > 0 && (
				<ToolbarItem
					onClick={onToggleModelSelector}
					open={isModelSelectorOpen}
					showValue={showValue}
					value={formatModelLabel(model)}
					secondary={THINKING_LEVEL_LABELS[thinkingLevel]}
					valueMaxWidth={MODEL_VALUE_MAX_WIDTH[density]}
					title={`模型：${model ?? "未选择"} · 思考程度：${THINKING_LEVEL_LABELS[thinkingLevel]}`}
					icon={
						modelIcon ? (
							<img src={modelIcon} alt="" className="w-4 h-4 object-contain" />
						) : (
							<Box className="w-4 h-4" strokeWidth={1.5} />
						)
					}
				/>
			)}

			<div className="shrink-0">
				{showStop ? (
					<Tooltip content="停止响应 ⌘." placement="top">
						<button
							type="button"
							onClick={onStop}
							aria-label="停止响应"
							className={cn(
								"w-8 h-8 flex items-center justify-center rounded-full",
								"bg-primary text-primary-foreground hover:opacity-90",
								"transition-[background-color,color,opacity,transform] duration-150",
								"cursor-pointer active:scale-95",
							)}
						>
							<Square
								className="w-[11px] h-[11px]"
								fill="currentColor"
								strokeWidth={0}
							/>
						</button>
					</Tooltip>
				) : (
					<Tooltip content="发送 ↵ · 换行 ⇧↵" placement="top">
						<button
							type="button"
							onClick={onSubmit}
							disabled={submitDisabled}
							aria-label="发送消息"
							className={cn(
								"w-8 h-8 flex items-center justify-center rounded-full",
								"bg-primary text-primary-foreground",
								"transition-[background-color,color,opacity,transform] duration-150",
								"cursor-pointer active:scale-95 disabled:cursor-not-allowed",
								// 空态保持品牌色、只降不透明度（Claude 同款），
								// 而不是一颗与底色几乎同色的米色圆盘
								submitDisabled ? "opacity-35" : "hover:opacity-90",
							)}
						>
							<ArrowUp className="w-[17px] h-[17px]" strokeWidth={2.2} />
						</button>
					</Tooltip>
				)}
			</div>
		</div>
	);
}
