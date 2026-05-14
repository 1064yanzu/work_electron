import { useEffect, useRef } from "react";
import { invoke } from "../lib/tauriCompat";
import { listen, type UnlistenFn } from "../lib/tauriEventCompat";

export function useMainWindowForegroundRef() {
	const foregroundRef = useRef(false);

	useEffect(() => {
		let mounted = true;
		let unlisten: UnlistenFn | null = null;

		void invoke<{ focused: boolean }>("main_window_is_focused")
			.then((state) => {
				if (mounted) foregroundRef.current = state.focused;
			})
			.catch(() => {});

		void (async () => {
			try {
				unlisten = await listen<{ focused: boolean }>(
					"main-window-focus-changed",
					(event) => {
						foregroundRef.current = !!event.payload?.focused;
					},
				);
			} catch {
				// noop
			}
		})();

		return () => {
			mounted = false;
			unlisten?.();
		};
	}, []);

	return foregroundRef;
}
