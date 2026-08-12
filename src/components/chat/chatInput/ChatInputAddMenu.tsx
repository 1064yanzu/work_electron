// `+` 菜单 —— 底栏左侧唯一的动作入口。
//
// 参考 Codex：`+` 不是「直接弹文件选择器」，而是一个小菜单，把
// 「往这轮对话里加点什么 / 改点什么」的低频入口都收进来。这样底栏只剩
// 两个高频配置项（运行模式、模型），控件才有空间做大做松。
//
// 里面装：
//   - 添加：上传文件、命令菜单（等价于键入 `/`，把之前删掉的 `@` 入口还回来）
//   - 语言风格：低频设置，不值得在 336px 的底栏常驻一格；
//     选中后由 `+` 图标右上角的色点提示「这里面有非默认设置」。

import { Command, Paperclip } from "lucide-react";
import { Blend, Pen, Plus } from "lucide-react";
import {
	ToolbarMenu,
	ToolbarMenuDivider,
	ToolbarMenuOption,
	ToolbarMenuSection,
	useToolbarMenu,
} from "./ToolbarMenu";
import { ToolbarAction } from "./ToolbarPrimitives";
import { useStyleProfiles } from "./useStyleProfiles";

const MENU_WIDTH = 232;

interface ChatInputAddMenuProps {
	disabled: boolean;
	onTriggerFilePicker: () => void;
	onTriggerSlashMenu: () => void;
}

export function ChatInputAddMenu({
	disabled,
	onTriggerFilePicker,
	onTriggerSlashMenu,
}: ChatInputAddMenuProps) {
	const { isOpen, close, toggle, buttonRef, menuRef, position } =
		useToolbarMenu(MENU_WIDTH);
	const style = useStyleProfiles(isOpen);

	const styleAccent = style.isRecipe
		? "text-amber-500 dark:text-amber-300"
		: "text-peach-500 dark:text-peach-200";

	const run = (action: () => void) => {
		close();
		action();
	};

	return (
		<>
			<ToolbarAction
				ref={buttonRef}
				icon={Plus}
				label={
					style.activeName ? `添加 · 语言风格：${style.activeName}` : "添加"
				}
				onClick={toggle}
				disabled={disabled}
				open={isOpen}
				useNativeTitle
				dotTone={
					style.hasActive ? (style.isRecipe ? "amber" : "peach") : undefined
				}
			/>

			{isOpen && (
				<ToolbarMenu
					menuRef={menuRef}
					position={position}
					width={MENU_WIDTH}
					title="添加"
					hint="+"
				>
					<ToolbarMenuOption
						label="上传文件"
						description="图片 / 文档，也可直接拖入或粘贴"
						active={false}
						onClick={() => run(onTriggerFilePicker)}
						leading={
							<Paperclip
								className="w-3.5 h-3.5 text-text-muted"
								strokeWidth={1.6}
							/>
						}
					/>
					<ToolbarMenuOption
						label="命令菜单"
						description="资料库 / 分享卡 / 技能 / 提示词，等同键入 /"
						active={false}
						onClick={() => run(onTriggerSlashMenu)}
						leading={
							<Command
								className="w-3.5 h-3.5 text-text-muted"
								strokeWidth={1.6}
							/>
						}
					/>

					<ToolbarMenuDivider />
					<ToolbarMenuSection label="语言风格" />

					<ToolbarMenuOption
						label="不使用"
						active={style.activeId === null && style.activeRecipeId === null}
						onClick={() => void style.selectProfile(null).then(close)}
						accentClassName={styleAccent}
					/>

					{style.profiles.length === 0 && style.recipes.length === 0 ? (
						<div className="px-2.5 pb-2 pt-1 text-xs text-text-muted/70 leading-relaxed">
							暂无风格包，可在
							<br />
							设置 → 语言风格包 创建
						</div>
					) : (
						<>
							{style.profiles.map((p) => (
								<ToolbarMenuOption
									key={p.id}
									label={p.name}
									description={p.description ?? undefined}
									active={style.activeId === p.id}
									onClick={() => void style.selectProfile(p.id).then(close)}
									accentClassName="text-peach-500 dark:text-peach-200"
									leading={
										<Pen
											className="w-3.5 h-3.5 text-text-muted"
											strokeWidth={1.6}
										/>
									}
								/>
							))}
							{style.recipes.map((r) => (
								<ToolbarMenuOption
									key={r.id}
									label={r.name}
									description={r.description ?? "混搭配方"}
									active={style.activeRecipeId === r.id}
									onClick={() => void style.selectRecipe(r.id).then(close)}
									accentClassName="text-amber-500 dark:text-amber-300"
									leading={
										<Blend
											className="w-3.5 h-3.5 text-amber-500/70 dark:text-amber-400/60"
											strokeWidth={1.6}
										/>
									}
								/>
							))}
						</>
					)}
				</ToolbarMenu>
			)}
		</>
	);
}
