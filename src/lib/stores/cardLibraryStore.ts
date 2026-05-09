import { createStore, createUseStoreSelector } from "./createStore";

export type CardLibraryState = {
	open: boolean;
};

const initialState: CardLibraryState = {
	open: false,
};

const _store = createStore<CardLibraryState>(initialState);

export const cardLibraryStoreApi = {
	getState: _store.getState,
	subscribe: _store.subscribe,
	open() {
		_store.setState((s) => ({ ...s, open: true }));
	},
	close() {
		_store.setState((s) => ({ ...s, open: false }));
	},
	toggle() {
		_store.setState((s) => ({ ...s, open: !s.open }));
	},
};

export const useCardLibraryStoreSelector = createUseStoreSelector(_store);
