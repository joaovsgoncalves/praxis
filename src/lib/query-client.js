import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			staleTime: 10000,
			// Sessão, permissão e "não existe" não mudam tentando de novo.
			retry: (failureCount, error) => failureCount < 1 && !(error?.status >= 400 && error?.status < 500),
		},
		mutations: {
			// O padrão pausa a escrita sem rede depois de pintar o otimista: a tela dizia "feito"
			// e nada tinha saído. Com 'always' a escrita falha na hora e o erro aparece.
			networkMode: 'always',
		},
	},
});