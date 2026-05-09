import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// We piggy-back on the health endpoint. If it fails, the offline cache in
// forjaClient is already serving stale data — we just surface that to the user.
export default function OfflineBanner() {
  const [navigatorOnline, setNavigatorOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onChange = () => setNavigatorOnline(navigator.onLine);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  const { isError, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: () => forjaApi.health(),
    refetchInterval: 60_000,
    retry: 0,
    staleTime: 30_000,
  });

  const isDown = !navigatorOnline || isError;
  if (!isDown) return null;

  const lastSync = dataUpdatedAt
    ? formatDistanceToNow(dataUpdatedAt, { locale: ptBR, addSuffix: true })
    : null;

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {navigatorOnline
          ? 'API indisponível — mostrando dados em cache.'
          : 'Você está offline — mostrando última cópia local.'}
      </span>
      {lastSync && <span className="opacity-70 shrink-0">sync {lastSync}</span>}
    </div>
  );
}
