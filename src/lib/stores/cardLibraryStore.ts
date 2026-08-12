import { createStore, createUseStoreSelector } from "./createStore";

/** 触发放大的那个元素的视口矩形，用于全屏 overlay 的"从这里长出来"过渡。 */
export type OriginRect = {
	left: number;
	top: number;
	width: number;
	height: number;
};

export type CardLibraryState = {
	open: boolean;
	/**
	 * 打开动画的起点。嵌入式卡片库点「放大」时记下它自己的矩形，
	 * 全屏 overlay 挂载后据此计算 transform-origin，让放大看起来是从
	 * 左栏那块面板里长出来的，而不是凭空浮现。
	 * 不走这条路（快捷键/命令面板直接打开）时为 null，退化成居中弹出。
	 */
	originRect: OriginRect | null;
};

const initialState: CardLibraryState = {
	open: false,
	originRect: null,
};

const _store = createStore<CardLibraryState>(initialState);

export const cardLibraryStoreApi = {
	getState: _store.getState,
	subscribe: _store.subscribe,
	open(originRect: OriginRect | null = null) {
		_store.setState((s) => ({ ...s, open: true, originRect }));
	},
	/** 从某个 DOM 元素打开：自动取它的视口矩形当作放大起点。 */
	openFrom(element: Element | null) {
		const rect = element?.getBoundingClientRect();
		cardLibraryStoreApi.open(
			rect
				? {
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height,
					}
				: null,
		);
	},
	close() {
		_store.setState((s) => ({ ...s, open: false, originRect: null }));
	},
	toggle() {
		_store.setState((s) =>
			s.open
				? { ...s, open: false, originRect: null }
				: { ...s, open: true, originRect: null },
		);
	},
};

export const useCardLibraryStoreSelector = createUseStoreSelector(_store);
