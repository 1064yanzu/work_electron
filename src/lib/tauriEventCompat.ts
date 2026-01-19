export type Event<TPayload> = {
	payload: TPayload;
};

export type UnlistenFn = () => void;

export async function listen<TPayload>(
	eventName: string,
	handler: (event: Event<TPayload>) => void,
): Promise<UnlistenFn> {
	if (
		typeof window === "undefined" ||
		typeof window.electronAPI?.on !== "function"
	) {
		throw new Error("TAURI_UNAVAILABLE");
	}

	return window.electronAPI.on<TPayload>(eventName, (payload) =>
		handler({ payload }),
	);
}
