/**
 * SettingsSearch — 设置面板顶部的全局搜索（MVP）
 *
 * 对应 design.md 第 5 节 / Requirement R7.1, R7.5, R7.6, R7.7。
 *
 * 功能：
 *   - 输入框 + 命中下拉（最多 8 条）+ 空态外链
 *   - `Cmd+F` / `Ctrl+F` 在 `SettingsModal` 范围内捕获并 focus 本输入框，
 *     阻止浏览器默认查找行为
 *   - 点击命中结果 → 调用 `onResultClick(tabId, anchorId)`；具体的「切 Tab +
 *     滚动高亮」由父组件 `SettingsModal.navigateTo` 承接
 *   - 失焦 / Esc → 收起下拉；点击外部 → 收起
 *   - 下拉命中行支持 ArrowUp / ArrowDown / Enter 键盘导航
 *
 * 本组件本身**不**消费 FocusTrap；键盘捕获通过 `window` 级 `keydown` 实现，
 * 仅在 `SettingsModal` 挂载期间生效（因 SearchModal 卸载时清理监听）。
 */
import { ExternalLink, Search, X } from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { shortcut } from "../../../lib/platform";
import { cn } from "../../../lib/utils";
import { type FieldDescriptor, searchSettingsFields } from "../fieldRegistry";
import {
	SETTINGS_CATEGORIES,
	getSubtab,
	type SettingsTabId,
} from "../settingsCatalog";

// 去哪里反馈（R7.7 空态外链）
const FEEDBACK_URL = "https://github.com/";

export interface SettingsSearchProps {
	/** 命中结果被点击时触发；tabId 为目标 Tab，anchorId 为字段锚点。 */
	onResultClick: (tabId: SettingsTabId, anchorId: string) => void;
	className?: string;
	/** 搜索结果条数上限，默认 8。 */
	limit?: number;
}

export function SettingsSearch({
	onResultClick,
	className,
	limit = 8,
}: SettingsSearchProps) {
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);

	const inputRef = useRef<HTMLInputElement | null>(null);
	const wrapperRef = useRef<HTMLDivElement | null>(null);
	const listboxId = useId();

	// --- 命中计算（输入 + limit 变化时重算） ---
	const results = useMemo<FieldDescriptor[]>(() => {
		if (!query.trim()) return [];
		return searchSettingsFields(query, limit);
	}, [query, limit]);

	const showEmptyState =
		open && query.trim().length > 0 && results.length === 0;
	const showResults = open && results.length > 0;

	// --- Cmd+F / Ctrl+F：focus 到输入框，阻止浏览器默认查找 ---
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const isFindShortcut =
				(e.metaKey || e.ctrlKey) &&
				!e.shiftKey &&
				!e.altKey &&
				(e.key === "f" || e.key === "F");
			if (!isFindShortcut) return;
			// 只有 SettingsModal 打开（本组件挂载）时这个监听才存在
			e.preventDefault();
			e.stopPropagation();
			const el = inputRef.current;
			if (el) {
				el.focus();
				el.select();
				setOpen(true);
			}
		};
		window.addEventListener("keydown", handler, true); // 用 capture 保证优先
		return () => window.removeEventListener("keydown", handler, true);
	}, []);

	// --- 点击外部收起 ---
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const wrap = wrapperRef.current;
			if (!wrap) return;
			if (!wrap.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	// --- 下拉键盘导航 ---
	useEffect(() => {
		setActiveIndex(0);
	}, [query]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Escape") {
				if (query) {
					e.preventDefault();
					setQuery("");
					setOpen(false);
					return;
				}
				setOpen(false);
				return;
			}
			if (!showResults) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveIndex((i) => Math.min(i + 1, results.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const picked = results[activeIndex];
				if (picked) {
					handlePick(picked);
				}
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[showResults, results, activeIndex, query],
	);

	const handlePick = useCallback(
		(field: FieldDescriptor) => {
			onResultClick(field.tabId, field.anchorId);
			setOpen(false);
			// 清空查询以便下次使用；保留输入内容也可以，这里选清空以降噪
			setQuery("");
		},
		[onResultClick],
	);

	const clear = useCallback(() => {
		setQuery("");
		setOpen(true);
		inputRef.current?.focus();
	}, []);

	return (
		<div
			ref={wrapperRef}
			className={cn("relative w-full", className)}
			role="combobox"
			aria-haspopup="listbox"
			aria-owns={listboxId}
			aria-expanded={showResults || showEmptyState}
		>
			<div
				className={cn(
					// 胶囊形而不是小圆角矩形：它是侧栏里唯一的输入控件，
					// 形状上跟下面一整列方角导航项区分开，一眼就知道这里能打字。
					"flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2",
					"transition-[border-color,box-shadow,background-color] duration-150",
					"hover:border-warm-500",
					"focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10",
				)}
			>
				<Search
					className="h-4 w-4 shrink-0 text-text-muted"
					strokeWidth={1.5}
				/>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={handleKeyDown}
					placeholder="搜索设置…"
					aria-label="搜索设置项"
					aria-controls={listboxId}
					aria-activedescendant={
						showResults ? `${listboxId}-opt-${activeIndex}` : undefined
					}
					autoComplete="off"
					spellCheck={false}
					className={cn(
						"flex-1 bg-transparent text-sm text-text-primary outline-none",
						"placeholder:text-text-light",
					)}
				/>
				{query ? (
					<button
						type="button"
						onClick={clear}
						aria-label="清空搜索"
						className={cn(
							"inline-flex h-6 w-6 items-center justify-center rounded-full text-text-muted",
							"hover:bg-warm-200 hover:text-text-primary",
							"transition-[background-color,color] duration-150",
						)}
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				) : (
					<span
						className={cn(
							"hidden sm:inline-flex select-none items-center gap-0.5 rounded-lg border border-border/70 bg-background px-1.5 py-0.5",
							"text-2xs font-sans tabular-nums text-text-muted",
						)}
					>
						{shortcut("F")}
					</span>
				)}
			</div>

			{/* 下拉 */}
			{(showResults || showEmptyState) && (
				<div
					id={listboxId}
					role="listbox"
					className={cn(
						// 搜索框位于 252px 宽的侧栏里，下拉若跟随宽度会挤到读不了；
						// 这里让它向右溢出盖在内容区上方（外层 aside 不裁剪，模态边缘兜底）
						"absolute left-0 top-[calc(100%+6px)] z-30 w-[344px] max-w-[calc(100vw-2rem)]",
						"rounded-2xl border border-border bg-surface shadow-bai-pop",
						"overflow-hidden",
					)}
				>
					{showResults && (
						<ul className="max-h-[360px] overflow-y-auto py-1">
							{results.map((field, idx) => (
								<SearchResultRow
									key={`${field.tabId}:${field.anchorId}`}
									id={`${listboxId}-opt-${idx}`}
									field={field}
									active={idx === activeIndex}
									onMouseEnter={() => setActiveIndex(idx)}
									onSelect={() => handlePick(field)}
								/>
							))}
						</ul>
					)}
					{showEmptyState && <EmptyState query={query} />}
				</div>
			)}
		</div>
	);
}

// =====================================================================
// 内部组件
// =====================================================================

interface SearchResultRowProps {
	id: string;
	field: FieldDescriptor;
	active: boolean;
	onSelect: () => void;
	onMouseEnter: () => void;
}

function SearchResultRow({
	id,
	field,
	active,
	onSelect,
	onMouseEnter,
}: SearchResultRowProps) {
	const subtab = getSubtab(field.tabId);
	const category = SETTINGS_CATEGORIES.find((c) => c.id === subtab?.category);
	const breadcrumb =
		category && subtab ? `${category.label} › ${subtab.label}` : field.tabId;

	return (
		<li id={id} role="option" aria-selected={active}>
			<button
				type="button"
				onMouseEnter={onMouseEnter}
				onClick={onSelect}
				className={cn(
					"flex w-full items-start gap-2.5 px-3 py-2 text-left",
					"transition-[background-color,color] duration-150",
					active
						? "bg-warm-200 text-text-primary"
						: "text-text-secondary hover:bg-background",
				)}
			>
				{subtab?.icon ? (
					<subtab.icon
						className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted"
						strokeWidth={1.5}
						aria-hidden
					/>
				) : (
					<span
						className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
						style={{ backgroundColor: "var(--t-primary, #1A1A19)" }}
						aria-hidden
					/>
				)}
				<span className="min-w-0 flex-1">
					<span className="block text-sm font-medium leading-snug text-text-primary">
						{field.label}
					</span>
					<span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
						<span className="truncate">{breadcrumb}</span>
					</span>
					{field.description && (
						<span className="mt-0.5 block truncate text-xs leading-relaxed text-text-light">
							{field.description}
						</span>
					)}
				</span>
			</button>
		</li>
	);
}

function EmptyState({ query }: { query: string }) {
	return (
		<div className="px-4 py-4">
			<p className="text-xs leading-relaxed text-text-secondary">
				没有找到与
				<span className="font-medium text-text-primary">「{query}」</span>
				相关的设置项。
			</p>
			<p className="mt-1 text-xs leading-relaxed text-text-muted">
				如果你觉得这是缺失，可以去 GitHub 反馈一下。
			</p>
			<a
				href={FEEDBACK_URL}
				target="_blank"
				rel="noreferrer"
				className={cn(
					"mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1",
					"text-xs font-medium text-text-secondary",
					"hover:border-warm-500 hover:bg-warm-50 hover:text-text-primary",
					"transition-[background-color,border-color,color] duration-150",
				)}
			>
				去 GitHub 反馈
				<ExternalLink className="h-3 w-3" strokeWidth={1.8} />
			</a>
		</div>
	);
}
