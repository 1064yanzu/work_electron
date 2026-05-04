// 键盘快捷键设置面板
//
// 当前阶段：只读展示已注册的快捷键，让用户可见。
// 下一阶段（未实现）：允许重映射 — 需要把硬编码的 keydown listener 改为 keymap store 驱动。

import { Command, Keyboard } from "lucide-react";
import {
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsHeader,
} from "../ui/SettingsPrimitives";

interface ShortcutEntry {
	keys: string[]; // 显示给用户的 kbd 序列
	label: string;
	description: string;
}

interface ShortcutGroup {
	title: string;
	entries: ShortcutEntry[];
}

const isMac =
	typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
const Mod = isMac ? "⌘" : "Ctrl";

const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "全局",
		entries: [
			{
				keys: [Mod, "K"],
				label: "打开命令面板",
				description: "搜索项目、设置、主题、命令",
			},
			{
				keys: [Mod, "L"],
				label: "切换 Copilot 侧边栏",
				description: "显示或隐藏右侧 AI 对话栏",
			},
		],
	},
	{
		title: "命令面板内",
		entries: [
			{
				keys: ["↑", "↓"],
				label: "选择候选",
				description: "在搜索结果间上下移动",
			},
			{ keys: ["Enter"], label: "执行", description: "运行当前选中的命令" },
			{ keys: ["Esc"], label: "关闭", description: "关闭命令面板" },
		],
	},
	{
		title: "对话框 / Modal",
		entries: [
			{ keys: ["Esc"], label: "关闭", description: "关闭当前对话框 / Modal" },
			{ keys: ["Tab"], label: "切换焦点", description: "在表单元素间循环" },
			{
				keys: ["Shift", "Tab"],
				label: "反向切换焦点",
				description: "反向遍历表单元素",
			},
		],
	},
];

export function ShortcutsSettings() {
	return (
		<SettingsPageContainer>
			<div>
				<SettingsSectionTitle>键盘快捷键</SettingsSectionTitle>
				<SettingsSectionCard>
					<SettingsHeader
						title="已注册的快捷键"
						description="目前快捷键固定，未来版本将支持自定义"
					/>
					<div className="px-5 py-4 space-y-6">
						{SHORTCUT_GROUPS.map((group) => (
							<div key={group.title}>
								<h4 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-muted mb-3 flex items-center gap-1.5">
									<Keyboard className="w-3 h-3" strokeWidth={1.5} />
									{group.title}
								</h4>
								<div className="space-y-2">
									{group.entries.map((entry) => (
										<div
											key={entry.label}
											className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0"
										>
											<div className="min-w-0 flex-1">
												<div className="text-[13px] font-medium text-text-primary">
													{entry.label}
												</div>
												<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
													{entry.description}
												</div>
											</div>
											<div className="flex items-center gap-1 shrink-0">
												{entry.keys.map((key, idx) => (
													<span
														key={`${key}-${idx}`}
														className="flex items-center gap-1"
													>
														<kbd className="px-2 py-1 rounded-md text-[11px] font-medium text-text-secondary bg-warm-200 border border-border">
															{key}
														</kbd>
														{idx < entry.keys.length - 1 && (
															<span className="text-text-muted text-[10px]">
																+
															</span>
														)}
													</span>
												))}
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</SettingsSectionCard>
			</div>

			<div>
				<SettingsSectionTitle>提示</SettingsSectionTitle>
				<SettingsSectionCard>
					<div className="px-5 py-4 flex items-start gap-3">
						<div className="w-9 h-9 rounded-xl bg-warm-200 flex items-center justify-center text-text-secondary shrink-0">
							<Command className="w-4 h-4" strokeWidth={1.5} />
						</div>
						<div className="text-[13px] text-text-secondary leading-relaxed">
							<p>
								命令面板（{Mod}+K）是访问绝大多数功能的最快方式 ——
								新建项目、切换主题、跳转到任意设置 tab、唤起终端等都能直接搜索。
							</p>
							<p className="mt-2 text-text-muted text-[12px]">
								键盘自定义功能将在后续版本中开放。如有快捷键冲突或建议，请通过设置
								→ 反馈提交。
							</p>
						</div>
					</div>
				</SettingsSectionCard>
			</div>
		</SettingsPageContainer>
	);
}
