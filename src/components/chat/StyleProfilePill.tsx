/**
 * StyleProfilePill — 聊天输入工具栏中的语言风格包选择器
 *
 * 设计原则：
 * - inactive：仅图标，与 +/@ 按钮等宽，不占额外空间
 * - active：图标 + 短标签（最多 8 字符）+ peach 点
 * - 弹出菜单用 Portal + fixed，绕开 overflow-hidden 裁切
 */
import { Blend, Check, Pen } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listStyleProfiles, listStyleRecipes } from "../../lib/api/styleProfile";
import { getConfig, setConfig } from "../../lib/config";
import type {
	StyleProfile,
	StyleProfileRecipe,
} from "../../../electron/shared/ipc-schema";

const ACTIVE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_RECIPE_KEY = "active_style_recipe_id";

export function StyleProfilePill() {
	const [isOpen, setIsOpen] = useState(false);
	const [profiles, setProfiles] = useState<StyleProfile[]>([]);
	const [recipes, setRecipes] = useState<StyleProfileRecipe[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
	const [menuPosition, setMenuPosition] = useState<{
		left: number;
		bottom: number;
	} | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// 加载初始数据
	useEffect(() => {
		const load = async () => {
			try {
				const [ps, rcs, id, recipeId] = await Promise.all([
					listStyleProfiles(),
					listStyleRecipes(),
					getConfig(ACTIVE_PROFILE_KEY),
					getConfig(ACTIVE_RECIPE_KEY),
				]);
				setProfiles(ps.filter((p) => p.status === "active"));
				setRecipes(rcs);
				setActiveId(id ?? null);
				setActiveRecipeId(recipeId ?? null);
			} catch {
				// 静默失败
			}
		};
		void load();
	}, []);

	// 打开时刷新列表
	useEffect(() => {
		if (!isOpen) return;
		const refresh = async () => {
			try {
				const [ps, rcs] = await Promise.all([
					listStyleProfiles(),
					listStyleRecipes(),
				]);
				setProfiles(ps.filter((p) => p.status === "active"));
				setRecipes(rcs);
			} catch {
				// 静默失败
			}
		};
		void refresh();
	}, [isOpen]);

	// 计算弹出菜单位置（自动防止右溢出）
	useLayoutEffect(() => {
		if (!isOpen || !buttonRef.current) {
			setMenuPosition(null);
			return;
		}
		const rect = buttonRef.current.getBoundingClientRect();
		const MENU_WIDTH = 220;
		const MARGIN = 8;
		// 优先左对齐，若超出右边界则右对齐到按钮右侧
		const leftAligned = rect.left;
		const rightAligned = rect.right - MENU_WIDTH;
		const left =
			leftAligned + MENU_WIDTH + MARGIN > window.innerWidth
				? Math.max(MARGIN, rightAligned)
				: leftAligned;
		setMenuPosition({
			left,
			bottom: window.innerHeight - rect.top + 8,
		});
	}, [isOpen]);

	// 点击外部 / ESC 关闭
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			) {
				return;
			}
			setIsOpen(false);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isOpen]);

	// 单包选择（清空配方）
	const handleSelect = useCallback(async (id: string | null) => {
		setActiveId(id);
		setActiveRecipeId(null);
		await Promise.all([
			setConfig(ACTIVE_PROFILE_KEY, id),
			setConfig(ACTIVE_RECIPE_KEY, null),
		]);
		setIsOpen(false);
	}, []);

	// 配方选择（清空单包）
	const handleSelectRecipe = useCallback(async (id: string | null) => {
		setActiveRecipeId(id);
		setActiveId(null);
		await Promise.all([
			setConfig(ACTIVE_RECIPE_KEY, id),
			setConfig(ACTIVE_PROFILE_KEY, null),
		]);
		setIsOpen(false);
	}, []);

	const activeProfile = profiles.find((p) => p.id === activeId) ?? null;
	const activeRecipe = recipes.find((r) => r.id === activeRecipeId) ?? null;
	const hasActive = activeProfile !== null || activeRecipe !== null;
	const displayName = activeRecipe?.name ?? activeProfile?.name ?? null;
	const displayDescription = activeRecipe
		? (activeRecipe.description ?? activeRecipe.name)
		: activeProfile
			? (activeProfile.description?.slice(0, 40) ?? activeProfile.name)
			: "不使用风格约束，保持默认输出";

	// inactive：w-8 h-8 圆形图标（与工具栏其他按钮一致）
	// active：图标 + 最多 8 字符名称
	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				title={displayName ? `语言风格：${displayName}` : "选择语言风格包"}
				className={`
					flex items-center justify-center rounded-full
					transition-all duration-150 cursor-pointer active:scale-95
					${hasActive
						? "gap-1 pl-1.5 pr-2 py-1 h-auto"
						: "w-8 h-8"
					}
					${isOpen
						? "bg-warm-200 dark:bg-cream-700 text-text-primary"
						: hasActive
							? activeRecipe
								? "text-amber-600 dark:text-amber-300 hover:text-text-primary hover:bg-warm-200/60 dark:hover:bg-cream-700/40"
								: "text-peach-600 dark:text-peach-300 hover:text-text-primary hover:bg-warm-200/60 dark:hover:bg-cream-700/40"
							: "text-text-muted hover:text-text-primary hover:bg-warm-200/80 dark:hover:bg-cream-700/50"
					}
				`}
			>
				{/* 图标 — 配方用 Blend，单包用 Pen */}
				<span className="relative">
					{activeRecipe ? (
						<Blend className="w-3.5 h-3.5" strokeWidth={1.5} />
					) : (
						<Pen className="w-3.5 h-3.5" strokeWidth={1.5} />
					)}
					{hasActive && (
						<span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${activeRecipe ? "bg-amber-400 dark:bg-amber-300" : "bg-peach-400 dark:bg-peach-300"}`} />
					)}
				</span>

				{/* active 时展示短标签 */}
				{hasActive && displayName && (
					<span className="text-[11px] font-medium leading-none max-w-[60px] truncate">
						{displayName.slice(0, 8)}
					</span>
				)}
			</button>

			{isOpen &&
				menuPosition &&
				createPortal(
				<div
					ref={menuRef}
					className="fixed z-[100] w-[220px] bg-cream-50/95 dark:bg-cream-900/95 backdrop-blur-xl border border-cream-400/70 dark:border-cream-500/60 rounded-2xl shadow-bai-pop overflow-hidden animate-in fade-in slide-in-from-bottom-1 zoom-in-95 duration-150 origin-bottom-left"
					style={{
						left: `${menuPosition.left}px`,
						bottom: `${menuPosition.bottom}px`,
						pointerEvents: "auto",
					}}
					>
						{/* 头部 */}
						<div className="px-3 pt-2.5 pb-2 border-b border-cream-300/70 dark:border-cream-500/40">
							<div className="flex items-center justify-between">
								<div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
									语言风格包
								</div>
								<div className="text-[9.5px] text-text-muted/60 font-mono">
									style
								</div>
							</div>
							<div className="text-[10px] text-text-muted/80 mt-0.5 leading-snug">
								{displayDescription}
							</div>
						</div>

						{/* 选项列表 */}
						<div className="p-1 space-y-[1px]">
							<MenuOption
								label="不使用"
								description="不注入风格约束"
								isActive={activeId === null && activeRecipeId === null}
								onClick={() => void handleSelect(null)}
							/>

							{profiles.length === 0 && recipes.length === 0 ? (
								<div className="px-3 py-3 text-[11px] text-text-muted text-center leading-relaxed">
									暂无风格包
									<br />
									<span className="text-text-muted/60">请前往设置 → 语言风格包 创建</span>
								</div>
							) : (
								<>
									{/* 单一风格包 */}
									{profiles.map((p) => (
										<MenuOption
											key={p.id}
											label={p.name}
											description={p.description ?? undefined}
											isActive={activeId === p.id}
											onClick={() => void handleSelect(p.id)}
										/>
									))}

									{/* 混搭配方 */}
									{recipes.length > 0 && (
										<>
											<div className="mx-2 my-1 border-t border-cream-300/50 dark:border-cream-600/30" />
											<div className="px-2.5 py-1">
												<div className="text-[9px] font-bold uppercase tracking-[0.08em] text-amber-500/70 dark:text-amber-400/60">
													混搭配方
												</div>
											</div>
											{recipes.map((r) => (
												<MenuOption
													key={r.id}
													label={r.name}
													description={r.description ?? undefined}
													isActive={activeRecipeId === r.id}
													onClick={() => void handleSelectRecipe(r.id)}
													isRecipe
												/>
											))}
										</>
									)}
								</>
							)}
					</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

// ── 菜单选项行 ──────────────────────────────────────────────────────────────

interface MenuOptionProps {
	label: string;
	description?: string;
	isActive: boolean;
	onClick: () => void;
	isRecipe?: boolean;
}

function MenuOption({ label, description, isActive, onClick, isRecipe }: MenuOptionProps) {
	const checkColor = isRecipe
		? "text-amber-500 dark:text-amber-300"
		: "text-peach-500 dark:text-peach-300";
	return (
		<button
			type="button"
			onClick={onClick}
			className={`
				w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-lg
				transition-[background-color,color] duration-100
				${
					isActive
						? "bg-cream-200/80 dark:bg-cream-800 text-text-primary"
						: "text-text-secondary hover:bg-cream-100 dark:hover:bg-cream-800/60 hover:text-text-primary"
				}
			`}
		>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5">
					{isRecipe && (
						<Blend className="w-3 h-3 text-amber-500/70 dark:text-amber-400/60 shrink-0" strokeWidth={1.5} />
					)}
					<span className={`text-[12px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>
						{label}
					</span>
				</div>
				{description && (
					<div className="text-[10px] text-text-muted mt-0.5 truncate leading-snug">
						{description}
					</div>
				)}
			</div>
			<Check
				className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${
					isActive ? `opacity-100 ${checkColor}` : "opacity-0"
				}`}
				strokeWidth={2.5}
			/>
		</button>
	);
}
