import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			refetchInterval: 30000, // 30s polling for Telegram ↔ App sync
			staleTime: 10000,
			retry: 1,
		},
	},
});