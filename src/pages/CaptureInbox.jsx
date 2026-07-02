import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { forjaApi } from '@/api/forjaClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Mic, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABELS = {
  failed: { label: 'Falhou', variant: 'destructive' },
  transcribed: { label: 'Transcrito', variant: 'secondary' },
  parsed: { label: 'Revisar itens', variant: 'default' },
  processing: { label: 'Processando', variant: 'outline' },
  pending: { label: 'Na fila', variant: 'outline' },
};

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return format(new Date(iso), "dd/MM HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

export default function CaptureInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: captures = [], isLoading } = useQuery({
    queryKey: ['captures', 'inbox'],
    queryFn: () => forjaApi.captures.list({ status: 'failed,transcribed,parsed', limit: 40 }),
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id) => forjaApi.captures.retry(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['captures'] });
      if (data?.text) {
        navigate(`/captura?capture=${id}`);
      }
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/captura" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Revisar capturas</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/captura">
            <Mic className="w-4 h-4 mr-1" />
            Nova gravação
          </Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Áudios salvos no servidor. Se o STT falhar, você pode tentar de novo sem gravar outra vez.
      </p>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && captures.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Nenhuma captura pendente. Tudo em dia.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {captures.map((cap) => {
          const meta = STATUS_LABELS[cap.status] || STATUS_LABELS.pending;
          const preview = cap.transcript
            ? `${cap.transcript.slice(0, 120)}${cap.transcript.length > 120 ? '…' : ''}`
            : cap.error_message || 'Sem transcrição';

          return (
            <Card key={cap.id} className="border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={meta.variant === 'destructive' ? 'destructive' : 'outline'}>
                    {meta.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatWhen(cap.updated_date || cap.created_date)}</span>
                </div>
                <p className="text-sm italic text-muted-foreground">&quot;{preview}&quot;</p>
                {cap.status === 'failed' && cap.error_message && (
                  <p className="text-xs text-destructive">{cap.error_message}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {cap.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={retryMutation.isPending}
                      onClick={() => retryMutation.mutate(cap.id)}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Tentar STT de novo
                    </Button>
                  )}
                  {(cap.status === 'transcribed' || cap.status === 'parsed') && cap.transcript && (
                    <Button size="sm" onClick={() => navigate(`/captura?capture=${cap.id}`)}>
                      Continuar revisão
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}