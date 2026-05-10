/**
 * SettingsDisclosure — 设置面板的「显示高级选项」折叠器
 *
 * Phase 3 · 基础组件之一。后续 Phase 7 会把各面板的专家向字段统一收到这里。
 *
 * 设计要点（对齐 design.md 7 节）：
 *   - 展开态持久化到 `localStorage.settings.ui.disclosure.<id>`
 *   - 过渡**只**定向到 `grid-template-rows + opacity`，禁止 `transition-all`
 *   - `ui.motion.preference === "reduced"` 时 duration 压到 75ms（≤ 80ms）
 *   - 右侧 `ChevronRight` 按展开状态 rotate-90；同样定向过渡
 *   - 无障碍：按钮带 `aria-expanded` / `aria-controls`
 */
import { ChevronRight } from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useState,
	type ReactNode,
} from "react";
import { cn } from "../../../lib/utils";

// ---------- localStorage 持久化 ----------

const DISCLOSURE_KEY_PREFIX = "settings.ui.disclosure.";

function readDisclosureState(id: string, fallback: boolean): boolean {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(`${DISCLOSURE_KEY_PREFIX}${id}`);
		if (raw == null) return fallback;
		return raw === "1" || raw === "true";
	} catch {
		return fallback;
	}
}

function writeDisclosureState(id: string, expanded: boolean): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			`${DISCLOSURE_KEY_PREFIX}${id}`,
			expanded ? "1" : "0",
		);
	} catch {
		/* 存储配额满 / 隐私模式 → 静默失败 */
	}
}

// ---------- 动效偏好（reduced 时压时长） ----------

function isReducedMotion(): boolean {
	if (typeof document === "undefined") return false;
	return document.documentElement.dataset.motionPreference === "reduced";
}

// ---------- 组件 ----------

export interface SettingsDisclosureProps {
	/**
	 * 稳定 id，用于 localStorage key；推荐格式 `"<category>.<subtab>.<section>"`，
	 * 例如 `"ai.agent.context.advanced"`。
	 */
	id: string;
	/** 按钮文案，默认 "显示高级选项"。 */
	title?: string;
	/** 首次访问时的默认展开态（本地未持久化值时生效）。 */
	defaultExpanded?: boolean;
	/** 折叠时是否仍然渲染子树（SEO/表单场景可传 true）。默认 false。 */
	keepMounted?: boolean;
	className?: string;
	children: ReactNode;
}

export function SettingsDisclosure({
	id,
	title = "显示高级选项",
	defaultExpanded = false,
	keepMounted = false,
	className,
	children,
}: SettingsDisclosureProps) {
	const [expanded, setExpanded] = useState<boolean>(() =>
		readDisclosureState(id, defaultExpanded),
	);

	// id 动态变化时重新从存储取一次（一般不会，但避免悄无声息的不一致）
	useEffect(() => {
		setExpanded(readDisclosureState(id, defaultExpanded));
	}, [id, defaultExpanded]);

	const toggle = useCallback(() => {
		setExpanded((prev) => {
			const next = !prev;
			writeDisclosureState(id, next);
			return next;
		});
	}, [id]);

	const panelId = useId();
	const reduced = isReducedMotion();
	const durationCls = reduced ? "duration-75" : "duration-200";

	return (
		<div className={cn("space-y-2", className)}>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={expanded}
				aria-controls={panelId}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md px-1.5 py-1",
					"text-[12px] font-medium text-text-muted",
					"hover:text-text-primary",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
					"transition-[color,background-color] ease-out",
					durationCls,
				)}
			>
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						"transition-transform ease-out",
						durationCls,
						expanded && "rotate-90",
					)}
					strokeWidth={2}
				/>
				<span className="leading-none">{title}</span>
			</button>

			<div
				id={panelId}
				aria-hidden={!expanded}
				className={cn(
					"grid transition-[grid-template-rows,opacity] ease-out",
					durationCls,
					expanded
						? "grid-rows-[1fr] opacity-100"
						: "grid-rows-[0fr] opacity-0",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					{expanded || keepMounted ? children : null}
				</div>
			</div>
		</div>
	);
}
