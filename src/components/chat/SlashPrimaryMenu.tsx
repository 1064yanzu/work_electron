import {
	ChevronRight,
	FileText,
	Folder,
	MessageSquare,
	Sparkles,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// 命令类别定义
export interface SlashCategory {
	id: string;
	name: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	shortcut?: string;
	gradient?: string; // 渐变色
	iconColor?: string; // 图标颜色
}

export const slashCategories: SlashCategory[] = [
	{
		id: "file",
		name: "文件",
		description: "选择文件添加到上下文",
		icon: FileText,
		shortcut: "f",
		gradient: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
		iconColor: "text-blue-500",
	},
	{
		id: "folder",
		name: "文件夹",
		description: "选择整个文件夹",
		icon: Folder,
		shortcut: "d",
		gradient:
			"bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
		iconColor: "text-amber-500",
	},
	{
		id: "prompt",
		name: "提示词",
		description: "插入自定义提示词",
		icon: MessageSquare,
		shortcut: "p",
		gradient:
			"bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
		iconColor: "text-orange-500",
	},
	{
		id: "agent_skill",
		name: "Agent 技能",
		description: "调用 Agent 技能",
		icon: Sparkles,
		shortcut: "s",
		gradient:
			"bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
		iconColor: "text-violet-500",
	},
	{
		id: "action",
		name: "操作",
		description: "执行快捷操作",
		icon: Zap,
		shortcut: "a",
		gradient: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
		iconColor: "text-rose-500",
	},
];

interface SlashPrimaryMenuProps {
	isOpen: boolean;
	onClose: () => void;
	onSelectCategory: (categoryId: string) => void;
	filter?: string;
}

export function SlashPrimaryMenu({
	isOpen,
	onClose,
	onSelectCategory,
	filter = "",
}: SlashPrimaryMenuProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const menuRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

	// 根据 filter 过滤或快捷匹配
	const filteredCategories = slashCategories.filter((cat) => {
		if (!filter) return true;
		const lowerFilter = filter.toLowerCase();
		if (cat.shortcut === lowerFilter) return true;
		return (
			cat.name.toLowerCase().includes(lowerFilter) ||
			cat.description.toLowerCase().includes(lowerFilter)
		);
	});

	// 如果过滤后只有一个结果，自动选中
	useEffect(() => {
		if (filteredCategories.length === 1 && filter) {
			const timer = setTimeout(() => {
				onSelectCategory(filteredCategories[0].id);
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [filteredCategories, filter, onSelectCategory]);

	// 重置选中项
	useEffect(() => {
		setSelectedIndex(0);
	}, [filter]);

	// 自动滚动到选中项
	useEffect(() => {
		if (itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	}, [selectedIndex]);

	// 键盘导航
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return;

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev > 0 ? prev - 1 : filteredCategories.length - 1,
					);
					break;
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						prev < filteredCategories.length - 1 ? prev + 1 : 0,
					);
					break;
				case "Enter":
					e.preventDefault();
					if (filteredCategories[selectedIndex]) {
						onSelectCategory(filteredCategories[selectedIndex].id);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, filteredCategories, selectedIndex, onSelectCategory, onClose]);

	// 点击外部关闭
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	if (filteredCategories.length === 0) {
		return (
			<div
				ref={menuRef}
				className="absolute left-0 bottom-full mb-2 w-[300px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden z-50"
			>
				<div className="px-4 py-10 text-center">
					<div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
						<Sparkles className="w-6 h-6 text-zinc-400" />
					</div>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						未找到匹配的命令类型
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={menuRef}
			className="absolute left-0 bottom-full mb-2 w-[320px] bg-white/98 dark:bg-zinc-900/98 backdrop-blur-2xl rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.03),0_12px_32px_-8px_rgba(0,0,0,0.12),0_24px_60px_-12px_rgba(0,0,0,0.15)] border border-zinc-200/40 dark:border-zinc-700/40 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-3 duration-200"
		>
			{/* 头部 */}
			<div className="px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80">
				<div className="flex items-center gap-2.5">
					<div className="w-6 h-6 rounded-lg bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-600 flex items-center justify-center shadow-sm">
						<span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
							/
						</span>
					</div>
					<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
						选择类型
					</span>
				</div>
			</div>

			{/* 类别列表 */}
			<div className="p-2">
				{filteredCategories.map((category, index) => {
					const isSelected = index === selectedIndex;
					return (
						<button
							key={category.id}
							ref={(el) => {
								itemRefs.current[index] = el;
							}}
							onClick={() => onSelectCategory(category.id)}
							className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all duration-200
                ${isSelected
									? "bg-zinc-100 dark:bg-zinc-800 shadow-sm ring-1 ring-inset ring-black/[0.02] dark:ring-white/[0.04]"
									: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:scale-[0.98]"
								}`}
						>
							{/* 图标容器 */}
							<div
								className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200
                  ${isSelected
										? "bg-white dark:bg-zinc-700 shadow-md ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
										: "bg-zinc-100 dark:bg-zinc-800 shadow-sm"
									}`}
							>
								<category.icon
									className={`w-5 h-5 transition-colors ${isSelected ? category.iconColor : "text-zinc-500 dark:text-zinc-400"}`}
								/>
							</div>

							{/* 文字内容 */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2.5">
									<span
										className={`text-sm font-medium ${isSelected
											? "text-zinc-900 dark:text-zinc-100"
											: "text-zinc-700 dark:text-zinc-300"
											}`}
									>
										{category.name}
									</span>
									{category.shortcut && (
										<kbd
											className={`px-1.5 py-0.5 text-[9px] font-medium rounded-md transition-colors
                        ${isSelected
													? "bg-white/80 dark:bg-zinc-700/80 text-zinc-500 dark:text-zinc-400 shadow-sm"
													: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
												}`}
										>
											/{category.shortcut}
										</kbd>
									)}
								</div>
								<p
									className={`text-xs truncate mt-0.5 ${isSelected
										? "text-zinc-600 dark:text-zinc-400"
										: "text-zinc-400 dark:text-zinc-500"
										}`}
								>
									{category.description}
								</p>
							</div>

							{/* 箭头 */}
							<ChevronRight
								className={`w-4 h-4 transition-all duration-150 ${isSelected
									? "text-zinc-500 dark:text-zinc-400 translate-x-0.5"
									: "text-zinc-300 dark:text-zinc-600"
									}`}
							/>
						</button>
					);
				})}
			</div>

			{/* 底部快捷键提示 */}
			<div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
				<div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400">
					<span className="flex items-center gap-1">
						<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium">
							↑↓
						</kbd>
						<span>导航</span>
					</span>
					<span className="flex items-center gap-1">
						<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium">
							↵
						</kbd>
						<span>选择</span>
					</span>
					<span className="flex items-center gap-1">
						<kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 rounded shadow-sm ring-1 ring-black/5 dark:ring-white/10 font-medium">
							Esc
						</kbd>
						<span>取消</span>
					</span>
				</div>
			</div>
		</div>
	);
}
