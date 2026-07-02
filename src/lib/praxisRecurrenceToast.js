import { toast } from '@/components/ui/use-toast';
import { formatNextDateBr } from '@/lib/taskRecurrence';

export function notifyPraxisRecurrenceSpawned(response) {
  const next = response?.next_occurrence;
  if (!next?.date || !next.created) return;
  toast({
    title: 'Próxima ocorrência criada',
    description: `Agendada para ${formatNextDateBr(next.date)}`,
  });
}