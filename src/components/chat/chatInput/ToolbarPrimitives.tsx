// 输入框底栏控件原语 —— 全裸态、宽松。
//
// 参考 Codex 输入框：底栏控件一律**没有背景、没有边框**，hover 才浮出一层极淡底，
// 全栏唯一实心元素是发送键。统一感来自「同高度 + 同字号 + 同色阶 + 同间距」。
//
// 尺寸照抄 Codex 量值（32px 高 / 17px 图标 / 13px 文字 / 8px 内距）：
// 上一版按 28/14/11.5/4 排，为了把三个配置项塞进 336px 而处处收紧，
// 结果是一行「小零碎」—— 小且挤本身就是丑。宁可少放一个控件，也不缩尺寸。
//
// 三条硬约束：
//   1. 图标插槽固定 16×16 box —— lucide 图标与厂商 logo <img> 严格对齐；
//   2. chevron 由 ToolbarItem 内部渲染，调用方不能遗漏也不能多加；
//   3. 色阶只有两档 —— 默认值 text-text-secondary（不是发虚的 muted），
//      非默认值用 tone 色。没有第三种写法。

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { Tooltip } from "../../ui/Tooltip";

/** 非默认值时的着色。1% 彩色锚点，只给文字/图标，不做背景。 */
export type ToolbarTone = "terracotta" | "peach" | "amber" | "mint";

const TONE_TEXT: Record<ToolbarTone, string> = {
	terracotta: "text-terracotta dark:text-terracotta-light",
	peach: "text-peach-500 dark:text-peach-200",
	amber: "text-amber-600 dark:text-amber-300",
	mint: "text-mint-600 dark:text-mint-300",
};

const TONE_DOT: Record<ToolbarTone, string> = {
	terracotta: "bg-terracotta",
	peach: "bg-peach-500",
	amber: "bg-amber-400",
	mint: "bg-mint-500",
};

/** 所有底栏控件共享：32px 高、裸态、hover 才浮出淡底。 */
const ITEM_BASE =
	"shrink-0 h-8 inline-flex items-center gap-1.5 rounded-xl " +
	"transition-[background-color,color,opacity] duration-150 " +
	"cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";

const ITEM_HOVER = "hover:bg-warm-200/70 dark:hover:bg-cream-700/40";

/** 图标插槽 —— 固定 16×16，可挂一个右上角状态点。 */
function IconSlot({
	children,
	dotTone,
}: {
	children: ReactNode;
	dotTone?: ToolbarTone;
}) {
	return (
		<span className="relative shrink-0 w-4 h-4 flex items-center justify-center">
			{children}
			{dotTone && (
				<span
					className={cn(
						"absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full ring-2 ring-surface",
						TONE_DOT[dotTone],
					)}
				/>
			)}
		</span>
	);
}

// ── 图标按钮（无文字）───────────────────────────────────────────────────────

interface ToolbarActionProps {
	icon: LucideIcon;
	/** 无障碍名称 + tooltip */
	label: string;
	onClick?: () => void;
	onMouseEnter?: () => void;
	disabled?: boolean;
	/** 弹层打开时高亮 */
	open?: boolean;
	/** 有非默认设置藏在里面时，图标右上角点一个色点 */
	dotTone?: ToolbarTone;
	/** 弹层触发器用原生 title，避免菜单展开时还浮一层 tooltip */
	useNativeTitle?: boolean;
}

export const ToolbarAction = forwardRef<HTMLButtonElement, ToolbarActionProps>(
	function ToolbarAction(
		{
			icon: Icon,
			label,
			onClick,
			onMouseEnter,
			disabled = false,
			open = false,
			dotTone,
			useNativeTitle = false,
		},
		ref,
	) {
		const button = (
			<button
				ref={ref}
				type="button"
				onClick={onClick}
				onMouseEnter={onMouseEnter}
				disabled={disabled}
				aria-label={label}
				title={useNativeTitle ? label : undefined}
				className={cn(
					ITEM_BASE,
					"w-8 justify-center",
					open
						? "bg-warm-200 dark:bg-cream-700/60 text-text-primary"
						: cn("text-text-secondary", ITEM_HOVER, "hover:text-text-primary"),
				)}
			>
				<IconSlot dotTone={dotTone}>
					<Icon className="w-[17px] h-[17px]" strokeWidth={1.7} />
				</IconSlot>
			</button>
		);

		return (
			<div className="shrink-0">
				{useNativeTitle ? (
					button
				) : (
					<Tooltip content={label} placement="top">
						{button}
					</Tooltip>
				)}
			</div>
		);
	},
);

// ── 配置项（图标 + 值 [+ 次要值] + chevron）───────────────────────────────────

interface ToolbarItemProps {
	/** 16×16 插槽：lucide 图标或厂商 logo */
	icon: ReactNode;
	/** 当前值主文案；`showValue=false` 时隐藏，只留图标 */
	value: string;
	/**
	 * 次要值 —— 挂在主值右边、更淡的一段。
	 * 用来把强相关的两个设置合成一个控件（模型 + 思考程度），
	 * 而不是并排两个控件各占一格。
	 */
	secondary?: string;
	showValue: boolean;
	open: boolean;
	/** 当前值非默认 —— 用 tone 着色 */
	active?: boolean;
	tone?: ToolbarTone;
	/** 原生 tooltip；折叠成图标时是唯一的文字线索，必填 */
	title: string;
	onClick: () => void;
	disabled?: boolean;
	valueMaxWidth?: number;
}

export const ToolbarItem = forwardRef<HTMLButtonElement, ToolbarItemProps>(
	function ToolbarItem(
		{
			icon,
			value,
			secondary,
			showValue,
			open,
			active = false,
			tone = "terracotta",
			title,
			onClick,
			disabled = false,
			valueMaxWidth,
		},
		ref,
	) {
		return (
			<div className="shrink-0">
				<button
					ref={ref}
					type="button"
					onClick={onClick}
					disabled={disabled}
					title={title}
					aria-label={title}
					aria-expanded={open}
					className={cn(
						ITEM_BASE,
						showValue ? "px-2" : "w-8 justify-center",
						active ? TONE_TEXT[tone] : "text-text-secondary",
						open
							? "bg-warm-200 dark:bg-cream-700/60 text-text-primary"
							: cn(ITEM_HOVER, "hover:text-text-primary"),
					)}
				>
					<IconSlot dotTone={!showValue && active ? tone : undefined}>
						{icon}
					</IconSlot>

					{showValue && (
						<>
							<span
								className="text-[13px] font-medium leading-none truncate"
								style={
									valueMaxWidth ? { maxWidth: `${valueMaxWidth}px` } : undefined
								}
							>
								{value}
							</span>
							{secondary && (
								<span className="shrink-0 text-[13px] leading-none text-text-muted">
									{secondary}
								</span>
							)}
							<ChevronDown
								className={cn(
									"shrink-0 w-3 h-3 opacity-45 transition-transform duration-150",
									open && "rotate-180",
								)}
								strokeWidth={2}
							/>
						</>
					)}
				</button>
			</div>
		);
	},
);

// ── 模型名格式化 ────────────────────────────────────────────────────────────

/**
 * 已经由厂商 logo 表达、因此在标签里冗余的开头 token。
 * 只列「厂商名 = ID 前缀」且剥掉后剩余部分仍能独立辨认的情况；
 * `gpt-4o` 这类产品名前缀不在其中（剥成 `4o` 反而难读）。
 */
const REDUNDANT_VENDOR_PREFIX =
	/^(claude|gemini|moonshot|mistral|perplexity)-/i;

/**
 * 模型 ID → 底栏短名。
 *
 * 三步无损处理：去 provider 路径前缀 → 去尾部日期戳/latest →
 * 去掉与左侧 logo 重复的厂商前缀（`claude-sonnet-4-5` → `sonnet-4-5`，
 * 同 Codex 显示 `5.6 Luna` 而非全 ID 的做法）。
 *
 * 不做任何 ID → 商品名的臆测映射；完整 ID 始终能在 tooltip 与模型列表里看到。
 * 剥离后为空则退回上一步结果，绝不产生空标签。
 */
export function formatModelLabel(model?: string | null): string {
	if (!model) return "Auto";
	const tail = model.split("/").pop() ?? model;
	const undated = tail.replace(/[-@](\d{8}|latest)$/i, "") || tail;
	return undated.replace(REDUNDANT_VENDOR_PREFIX, "") || undated;
}
