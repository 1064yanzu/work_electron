import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	type ReactNode,
} from "react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { buildDefaultContextMenu } from "../../lib/contextMenu/defaultMenu";

interface ContextMenuState {
	items: ContextMenuItem[];
	x: number;
	y: number;
}

interface GlobalContextMenuAPI {
	/** 在指定位置显示自定义右键菜单 */
	showContextMenu: (items: ContextMenuItem[], x: number, y: number) => void;
	/** 隐藏当前右键菜单 */
	hideContextMenu: () => void;
}

const GlobalContextMenuContext = createContext<GlobalContextMenuAPI | null>(
	null,
);

/**
 * 获取全局右键菜单 API
 * 用于在任意组件中以编程方式触发右键菜单
 */
export function useGlobalContextMenu(): GlobalContextMenuAPI {
	const ctx = useContext(GlobalContextMenuContext);
	if (!ctx) {
		throw new Error(
			"useGlobalContextMenu 必须在 GlobalContextMenuProvider 内部使用",
		);
	}
	return ctx;
}

interface ProviderProps {
	children: ReactNode;
}

/**
 * 全局右键菜单 Provider
 *
 * 职责：
 * 1. 提供 showContextMenu / hideContextMenu API 给子组件
 * 2. 监听 document 级别的 contextmenu 事件
 * 3. 当事件未被子组件拦截时，显示默认菜单（复制、粘贴、全选、刷新）
 * 4. 阻止浏览器默认右键菜单
 */
export function GlobalContextMenuProvider({ children }: ProviderProps) {
	const [menu, setMenu] = useState<ContextMenuState | null>(null);

	const showContextMenu = useCallback(
		(items: ContextMenuItem[], x: number, y: number) => {
			setMenu({ items, x, y });
		},
		[],
	);

	const hideContextMenu = useCallback(() => {
		setMenu(null);
	}, []);

	// 监听 document 级别的 contextmenu 事件
	// 如果事件的 defaultPrevented 为 false，说明没有子组件处理，显示默认菜单
	useEffect(() => {
		const handleGlobalContextMenu = (e: MouseEvent) => {
			// 已被子组件处理的事件，跳过
			if (e.defaultPrevented) return;

			// 排除输入框中的原生右键（保留浏览器拼写检查等功能）
			const target = e.target as HTMLElement;
			const isInputElement =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement;
			const isContentEditable =
				target.isContentEditable ||
				target.closest("[contenteditable]") !== null;

			// 在输入区域中，如果有文字选中则显示自定义菜单，否则也显示（覆盖浏览器默认）
			if (isInputElement || isContentEditable) {
				e.preventDefault();
				showContextMenu(buildDefaultContextMenu(), e.clientX, e.clientY);
				return;
			}

			// 通用区域：阻止默认菜单，显示自定义菜单
			e.preventDefault();
			showContextMenu(buildDefaultContextMenu(), e.clientX, e.clientY);
		};

		document.addEventListener("contextmenu", handleGlobalContextMenu);
		return () => {
			document.removeEventListener("contextmenu", handleGlobalContextMenu);
		};
	}, [showContextMenu]);

	const api: GlobalContextMenuAPI = { showContextMenu, hideContextMenu };

	return (
		<GlobalContextMenuContext.Provider value={api}>
			{children}
			{menu && menu.items.length > 0 && (
				<ContextMenu
					x={menu.x}
					y={menu.y}
					items={menu.items}
					onClose={hideContextMenu}
				/>
			)}
		</GlobalContextMenuContext.Provider>
	);
}
