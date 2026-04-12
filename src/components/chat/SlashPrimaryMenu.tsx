import {
	ChevronRight,
	FileText,
	Folder,
	MessageSquare,
	Command,
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
	gradient?: string;
	iconColor?: string;
}

export const slashCategories: SlashCategory[] = [
	{
		id: "file",
		name: "文件",
		description: "选择文件添加到上下文",
		icon: FileText,
		shortcut: "f",
		gradient: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
		iconColor: "text-blue-600 dark:text-blue-400",
	},
	{
		id: "folder",
		name: "文件夹",
		description: "选择整个文件夹",
		icon: Folder,
		shortcut: "d",
		gradient:
			"bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
		iconColor: "text-amber-600 dark:text-amber-400",
	},
	{
		id: "prompt",
		name: "提示词",
		description: "插入自定义提示词",
		icon: MessageSquare,
		shortcut: "p",
		gradient:
			"bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
		iconColor: "text-orange-600 dark:text-orange-400",
	},
	{
		id: "agent_skill",
		name: "Agent 技能",
		description: "调用 Agent 技能",
		icon: Command,
		shortcut: "s",
		gradient:
			"bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
		iconColor: "text-violet-600 dark:text-violet-400",
	},
	{
		id: "action",
		name: "操作",
		description: "执行快捷操作",
		icon: Zap,
		shortcut: "a",
		gradient: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
		iconColor: "text-rose-600 dark:text-rose-400",
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
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

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
				className="absolute left-0 bottom-full mb-2 w-[280px] bg-white dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50"
			>
				<div className="px-4 py-8 text-center">
					<p className="text-[13px] text-[#999] dark:text-[#666]">
						未找到匹配的命令类型
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={menuRef}
			className="absolute left-0 bottom-full mb-2 w-[280px] bg-white dark:bg-[#2b2b2b] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
		>
			{/* 头部标签 */}
			<div className="px-4 pt-3 pb-1">
				<span className="text-[11px] font-medium text-[#aaa] dark:text-[#666] tracking-wide">
					选择类型
				</span>
			</div>

			{/* 类别列表 — 使用 div[role=option] 替代 button 避免浏览器 focus ring */}
			<div className="px-1.5 pb-1.5" role="listbox">
				{filteredCategories.map((category, index) => {
					const isSelected = index === selectedIndex;
					return (
						<div
							key={category.id}
							ref={(el) => {
								itemRefs.current[index] = el;
							}}
							role="option"
							aria-selected={isSelected}
							tabIndex={-1}
							onClick={() => onSelectCategory(category.id)}
							onMouseEnter={() => setSelectedIndex(index)}
							className={`w-full flex items-center gap-3 px-2.5 py-[9px] rounded-xl text-left cursor-pointer select-none
                transition-all duration-[120ms] ease-out
                ${isSelected ? "bg-[#f3f3f3] dark:bg-[#363636]" : ""}`}
						>
							{/* 图标容器 — 选中时用品牌色底 */}
							<div
								className={`w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0
                  transition-all duration-[120ms] ease-out
                  ${
										isSelected
											? `${category.gradient} shadow-sm`
											: "bg-[#f5f5f5] dark:bg-[#363636]"
									}`}
							>
								<category.icon
									className={`w-[15px] h-[15px] transition-colors duration-[120ms]
                    ${
											isSelected
												? "" // gradient 类里已有颜色
												: "text-[#999] dark:text-[#666]"
										}`}
								/>
							</div>

							{/* 文字区域 */}
							<div className="flex-1 min-w-0">
								<div className="flex items-baseline gap-1.5">
									<span
										className={`text-[13px] font-medium leading-tight transition-colors duration-[120ms]
                      ${
												isSelected
													? "text-[#1a1a1a] dark:text-[#eee]"
													: "text-[#666] dark:text-[#999]"
											}`}
									>
										{category.name}
									</span>
									{category.shortcut && (
										<span className="text-[10px] text-[#ccc] dark:text-[#555] font-mono">
											/{category.shortcut}
										</span>
									)}
								</div>
								<p
									className={`text-[11px] leading-tight mt-0.5 transition-colors duration-[120ms]
                    ${
											isSelected
												? "text-[#999] dark:text-[#777]"
												: "text-[#bbb] dark:text-[#555]"
										}`}
								>
									{category.description}
								</p>
							</div>

							{/* chevron */}
							<ChevronRight
								className={`w-3.5 h-3.5 flex-shrink-0 transition-all duration-[120ms] ease-out
                  ${
										isSelected
											? "text-[#999] dark:text-[#666] translate-x-px opacity-100"
											: "text-transparent opacity-0"
									}`}
							/>
						</div>
					);
				})}
			</div>

			{/* 底部快捷键 */}
			<div className="px-4 py-1.5 border-t border-[#f0f0f0] dark:border-[#333]">
				<div className="flex items-center justify-center gap-4 text-[10px] text-[#ccc] dark:text-[#555]">
					<span className="flex items-center gap-1">
						<span className="font-mono text-[9px]">↑↓</span>
						<span>导航</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-[9px]">↵</span>
						<span>选择</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-[9px]">esc</span>
						<span>关闭</span>
					</span>
				</div>
			</div>
		</div>
	);
}
