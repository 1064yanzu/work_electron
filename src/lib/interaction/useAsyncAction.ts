import { useCallback, useRef, useState } from "react";

export interface AsyncActionState {
	isPending: boolean;
	error: string | null;
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
	action: (...args: TArgs) => Promise<TResult>,
) {
	const actionRef = useRef(action);
	actionRef.current = action;

	const [state, setState] = useState<AsyncActionState>({
		isPending: false,
		error: null,
	});

	const run = useCallback(async (...args: TArgs): Promise<TResult> => {
		setState({ isPending: true, error: null });
		try {
			const result = await actionRef.current(...args);
			setState({ isPending: false, error: null });
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setState({ isPending: false, error: message });
			throw error;
		}
	}, []);

	const reset = useCallback(() => {
		setState({ isPending: false, error: null });
	}, []);

	return {
		run,
		reset,
		isPending: state.isPending,
		error: state.error,
	};
}

