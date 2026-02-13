import { QueryClient } from "@tanstack/react-query";

export const QUERY_STALE_TIME_MS = 15_000;
export const QUERY_GC_TIME_MS = 5 * 60 * 1000;

export const appQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: QUERY_STALE_TIME_MS,
			gcTime: QUERY_GC_TIME_MS,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
});
