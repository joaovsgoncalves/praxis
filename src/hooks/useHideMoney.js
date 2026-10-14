import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { formatMoney, maskMoneyText } from '@/lib/finance';

const SETTINGS_KEY = ['finance', 'settings'];
// Espelho local só para não piscar o valor antes do servidor responder; a verdade é hide_values.
const LOCAL_KEY = 'praxis:finance:hide-values';

function readLocal() {
  try {
    return window.localStorage.getItem(LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLocal(hidden) {
  try {
    window.localStorage.setItem(LOCAL_KEY, hidden ? '1' : '0');
  } catch {
    // modo privado: segue só com o servidor
  }
}

/** Ocultar valores de Finanças (página, abas e card do Hoje), salvo em finance_settings. */
export function useHideMoney() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const settings = await praxisApi.finance.settings();
      writeLocal(Boolean(settings?.hide_values));
      return settings;
    },
    staleTime: 60_000,
  });

  const hidden = data ? Boolean(data.hide_values) : readLocal();

  const mutation = useMutation({
    mutationFn: (next) => praxisApi.finance.updateSettings({ hide_values: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const previous = queryClient.getQueryData(SETTINGS_KEY);
      queryClient.setQueryData(SETTINGS_KEY, (old) => ({ ...(old || {}), hide_values: next }));
      writeLocal(next);
      return { previous };
    },
    onError: (_err, next, context) => {
      queryClient.setQueryData(SETTINGS_KEY, context?.previous);
      writeLocal(!next);
      toast.error('Não deu para salvar a preferência');
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_KEY, settings);
    },
  });

  const { mutate } = mutation;
  const toggle = useCallback(() => mutate(!hidden), [mutate, hidden]);
  const money = useCallback((value) => formatMoney(value, hidden), [hidden]);
  const text = useCallback((value) => maskMoneyText(value, hidden), [hidden]);

  return { hidden, toggle, money, text, isSaving: mutation.isPending };
}
