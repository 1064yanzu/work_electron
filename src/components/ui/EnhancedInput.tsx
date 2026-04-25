import { AtSign, Hash, Paperclip, Zap, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { type SlashCommand, SlashCommandMenu } from "./SlashCommandMenu";

export interface ContextItem {
	id: string;
	type: "source" | "note" | "output";
	title: string;
	preview?: string;
}

interface EnhancedInputProps {
	onSubmit: (
		text: string,
		contexts: ContextItem[],
		command?: SlashCommand,
	) => void;
	onCommandSelect?: (command: SlashCommand) => void;
	placeholder?: string;
	className?: string;
	minHeight?: string;
}

export function EnhancedInput({
	onSubmit,
	onCommandSelect,
	placeholder = "输入 / 查看命令，@ 选择上下文...",
	className = "",
	minHeight = "52px",
}: EnhancedInputProps) {
	const [inputValue, setInputValue] = useState("");
	const [selectedContexts, setSelectedContexts] = useState<ContextItem[]>([]);
	const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
	const [commandSearchQuery, setCommandSearchQuery] = useState("");
	const [selectedCommand, setSelectedCommand] = useState<
		SlashCommand | undefined
	>();
	const [menuPosition, setMenuPosition] = useState<
		{ top: number; left: number; width: number } | undefined
	>();

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// 自动调整文本框高度
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
		}
	}, [inputValue]);

	// 检测 / 命令
	useEffect(() => {
		const cursorPosition =
			textareaRef.current?.selectionStart || inputValue.length;
		const textBeforeCursor = inputValue.slice(0, cursorPosition);
		const lastSlash = textBeforeCursor.lastIndexOf("/");

		console.log("Slash detection:", {
			inputValue,
			cursorPosition,
			lastSlash,
			textBeforeCursor,
		});

		if (
			lastSlash !== -1 &&
			(lastSlash === 0 ||
				inputValue[lastSlash - 1] === " " ||
				inputValue[lastSlash - 1] === "\n")
		) {
			const searchAfterSlash = textBeforeCursor.slice(lastSlash + 1);

			console.log("Slash found, searchAfterSlash:", searchAfterSlash);

			if (!searchAfterSlash.includes(" ") && !searchAfterSlash.includes("\n")) {
				// 打开命令菜单
				setCommandSearchQuery(searchAfterSlash);
				setIsCommandMenuOpen(true);

				// 计算菜单位置
				if (containerRef.current) {
					const rect = containerRef.current.getBoundingClientRect();
					console.log("Menu position:", {
						top: rect.bottom,
						left: rect.left,
						width: rect.width,
					});
					setMenuPosition({
						top: rect.bottom,
						left: rect.left,
						width: rect.width,
					});
				}
				return;
			}
		}

		setIsCommandMenuOpen(false);
	}, [inputValue]);

	const handleCommandSelect = (command: SlashCommand) => {
		// 移除 / 和搜索文本
		const cursorPosition = textareaRef.current?.selectionStart || 0;
		const textBeforeCursor = inputValue.slice(0, cursorPosition);
		const lastSlash = textBeforeCursor.lastIndexOf("/");

		const newValue =
			inputValue.slice(0, lastSlash) + inputValue.slice(cursorPosition);
		setInputValue(newValue);
		setSelectedCommand(command);
		setIsCommandMenuOpen(false);

		if (onCommandSelect) {
			onCommandSelect(command);
		}

		// 聚焦回输入框
		textareaRef.current?.focus();
	};

	const handleRemoveContext = (id: string) => {
		setSelectedContexts((prev) => prev.filter((c) => c.id !== id));
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		// Command + Enter 或 Ctrl + Enter 提交
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}

		// ESC 关闭命令菜单
		if (e.key === "Escape" && isCommandMenuOpen) {
			e.preventDefault();
			setIsCommandMenuOpen(false);
		}
	};

	const handleSubmit = () => {
		if (!inputValue.trim() && selectedContexts.length === 0) return;

		onSubmit(inputValue, selectedContexts, selectedCommand);

		// 清空输入
		setInputValue("");
		setSelectedContexts([]);
		setSelectedCommand(undefined);
	};

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			{/* 输入区域 */}
			<div className="bg-surface border-2 border-border rounded-2xl shadow-lg hover:border-primary/30 focus-within:border-primary transition-all">
				{/* 已选择的上下文标签 */}
				{selectedContexts.length > 0 && (
					<div className="p-3 pb-0 flex flex-wrap gap-2">
						{selectedContexts.map((ctx) => (
							<div
								key={ctx.id}
								className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm group"
							>
								<AtSign className="w-3.5 h-3.5" />
								<span className="font-medium">{ctx.title}</span>
								<button
									onClick={() => handleRemoveContext(ctx.id)}
									className="opacity-60 hover:opacity-100 transition-opacity"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							</div>
						))}
					</div>
				)}

				{/* 已选择的命令 */}
				{selectedCommand && (
					<div className="p-3 pb-0">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm">
							<selectedCommand.icon className="w-3.5 h-3.5" />
							<span className="font-medium">{selectedCommand.label}</span>
							<button
								onClick={() => setSelectedCommand(undefined)}
								className="opacity-60 hover:opacity-100 transition-opacity"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				)}

				{/* 文本输入框 */}
				<div className="relative">
					<textarea
						ref={textareaRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						className="w-full px-4 py-3 bg-transparent resize-none outline-none text-text-primary placeholder:text-text-muted text-base leading-relaxed"
						rows={1}
						style={{ minHeight: minHeight, maxHeight: "200px" }}
					/>
				</div>

				{/* 底部工具栏 */}
				<div className="px-3 pb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						{/* 附件按钮 */}
						<button
							type="button"
							className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-all"
							title="添加附件"
						>
							<Paperclip className="w-4 h-4" />
						</button>

						{/* @ 上下文按钮 */}
						<button
							type="button"
							className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-all"
							title="引用上下文 (@)"
						>
							<AtSign className="w-4 h-4" />
						</button>

						{/* # 标签按钮 */}
						<button
							type="button"
							className="p-2 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg transition-all"
							title="添加标签"
						>
							<Hash className="w-4 h-4" />
						</button>
					</div>

					<div className="flex items-center gap-2">
						{/* 提示文本 */}
						<div className="text-xs text-text-muted hidden sm:block">
							<kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs">
								⌘
							</kbd>
							<span className="mx-1">+</span>
							<kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs">
								↵
							</kbd>
							<span className="ml-2">发送</span>
						</div>

						{/* 发送按钮 */}
						<button
							onClick={handleSubmit}
							disabled={!inputValue.trim() && selectedContexts.length === 0}
							className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium text-sm"
						>
							<Zap className="w-4 h-4" />
							<span>发送</span>
						</button>
					</div>
				</div>
			</div>

			{/* 命令菜单 */}
			<SlashCommandMenu
				isOpen={isCommandMenuOpen}
				onClose={() => setIsCommandMenuOpen(false)}
				onSelect={handleCommandSelect}
				searchQuery={commandSearchQuery}
				position={menuPosition}
			/>

			{/* 提示文本 */}
			<div className="mt-2 px-2 text-xs text-text-muted flex items-center gap-4">
				<span>
					💡 输入{" "}
					<kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs">
						/
					</kbd>{" "}
					查看所有命令
				</span>
				<span>
					输入{" "}
					<kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs">
						@
					</kbd>{" "}
					引用上下文
				</span>
			</div>
		</div>
	);
}
