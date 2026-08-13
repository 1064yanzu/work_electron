/**
 * PlanModeToggle — 运行模式配置胶囊（执行 / 规划）
 *
 * 与模型、风格包同为「配置胶囊」类：图标 + 当前值 + chevron，点击弹菜单。
 * 改造前是输入框上方独占一行的双段控件 + 一句常驻说明文字，白吃 34px 垂直空间；
 * 现在只占工具栏一个槽位，说明文字进菜单，规划态另由输入框左侧赤陶橙条表达。
 */

import { ListChecks, Zap } from "lucide-react";
import { cn } from "../../lib/utils";
import {
	ToolbarMenu,
	ToolbarMenuOption,
	useToolbarMenu,
} from "../chat/chatInput/ToolbarMenu";
import { ToolbarItem } from "../chat/chatInput/ToolbarPrimitives";

interface PlanModeToggleProps {
	planMode: boolean;
	onToggle: (enabled: boolean) => void;
	disabled?: boolean;
	/** 由密度档统一下发 —— 三个配置胶囊同进同退 */
	showValue?: boolean;
}

const MENU_WIDTH = 212;

const MODES = [
	{
		planMode: false,
		label: "执行",
		description: "Agent 直接动手完成任务",
		Icon: Zap,
	},
	{
		planMode: true,
		label: "规划",
		description: "先输出计划，确认后再执行",
		Icon: ListChecks,
	},
] as const;

export function PlanModeToggle({
	planMode,
	onToggle,
	disabled = false,
	showValue = true,
}: PlanModeToggleProps) {
	const { isOpen, close, toggle, buttonRef, menuRef, position } =
		useToolbarMenu(MENU_WIDTH);

	const current = MODES.find((mode) => mode.planMode === planMode) ?? MODES[0];
	const CurrentIcon = current.Icon;

	const handleSelect = (next: boolean) => {
		if (next !== planMode) onToggle(next);
		close();
	};

	return (
		<>
			<ToolbarItem
				ref={buttonRef}
				onClick={toggle}
				disabled={disabled}
				open={isOpen}
				showValue={showValue}
				value={current.label}
				active={planMode}
				tone="terracotta"
				title={`运行模式：${current.label} —— ${current.description}`}
				icon={<CurrentIcon className="w-4 h-4" strokeWidth={1.5} />}
			/>

			{isOpen && (
				<ToolbarMenu
					menuRef={menuRef}
					position={position}
					width={MENU_WIDTH}
					title="运行模式"
					hint="mode"
				>
					{MODES.map((mode) => (
						<ToolbarMenuOption
							key={mode.label}
							label={mode.label}
							description={mode.description}
							active={mode.planMode === planMode}
							onClick={() => handleSelect(mode.planMode)}
							leading={
								<mode.Icon
									className={cn(
										"w-3.5 h-3.5",
										mode.planMode === planMode
											? "text-terracotta dark:text-terracotta-light"
											: "text-text-muted",
									)}
									strokeWidth={1.5}
								/>
							}
						/>
					))}
				</ToolbarMenu>
			)}
		</>
	);
}
