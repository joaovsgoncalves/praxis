import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { praxisApi } from '@/api/praxisClient';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const TASK_LIST_KEYS = [['tasks'], ['allTasks'], ['dashboardTasks']];

/** Ajusta checklist_total/done da tarefa nas listas em cache, pra o card do quadro acompanhar. */
function patchTaskCounts(queryClient, taskId, items) {
  const total = items.length;
  const done = items.filter((item) => item.done).length;
  const update = (old) =>
    Array.isArray(old)
      ? old.map((t) => (t.id === taskId ? { ...t, checklist_total: total, checklist_done: done } : t))
      : old;
  TASK_LIST_KEYS.forEach((queryKey) => queryClient.setQueriesData({ queryKey }, update));
}

function ChecklistRow({ item, index, count, onToggle, onRename, onDelete, onMove }) {
  const [draft, setDraft] = useState(item.title);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (!title) {
      setDraft(item.title);
      return;
    }
    if (title !== item.title) onRename(item, title);
  };

  return (
    <li className="group/item flex min-h-11 items-center gap-2 rounded-lg px-1.5 transition-colors duration-150 hover:bg-white/[0.03]">
      <Checkbox
        checked={item.done}
        onCheckedChange={(checked) => onToggle(item, checked === true)}
        aria-label={(item.done ? 'Desmarcar ' : 'Marcar ') + item.title}
        className="h-4 w-4 shrink-0 rounded-[5px] border-white/25 data-[state=checked]:border-domain-wellness data-[state=checked]:bg-domain-wellness data-[state=checked]:text-black"
      />
      <input
        value={editing ? draft : item.title}
        onFocus={() => {
          setDraft(item.title);
          setEditing(true);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(item.title);
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
        aria-label={'Renomear item ' + item.title}
        maxLength={240}
        className={cn(
          'h-9 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm outline-none transition-colors duration-150 focus-visible:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring',
          item.done && !editing ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground'
        )}
      />
      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={'Subir ' + item.title}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1}
          aria-label={'Descer ' + item.title}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(item)}
          aria-label={'Remover ' + item.title}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

/** Checklist dentro da tarefa — cada mudança salva na hora (não depende do "Salvar" do formulário). */
export default function TaskChecklist({ taskId }) {
  const queryClient = useQueryClient();
  const queryKey = ['taskChecklist', taskId];
  const [newTitle, setNewTitle] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => praxisApi.tasks.checklist.list(taskId),
    enabled: Boolean(taskId),
  });

  const runOptimistic = async (nextItems) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData(queryKey) || [];
    queryClient.setQueryData(queryKey, nextItems);
    patchTaskCounts(queryClient, taskId, nextItems);
    return { previous };
  };

  const rollback = (context) => {
    if (!context) return;
    queryClient.setQueryData(queryKey, context.previous);
    patchTaskCounts(queryClient, taskId, context.previous);
    toast.error('Não deu pra salvar o checklist');
  };

  const settle = () => {
    queryClient.invalidateQueries({ queryKey });
    TASK_LIST_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  const createItem = useMutation({
    mutationFn: (title) => praxisApi.tasks.checklist.create(taskId, title),
    onMutate: (title) =>
      runOptimistic([...items, { id: 'temp-' + Date.now(), task_id: taskId, title, done: false, sort_order: items.length }]),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  });

  const updateItem = useMutation({
    mutationFn: ({ item, data }) => praxisApi.tasks.checklist.update(taskId, item.id, data),
    onMutate: ({ item, data }) => runOptimistic(items.map((i) => (i.id === item.id ? { ...i, ...data } : i))),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  });

  const deleteItem = useMutation({
    mutationFn: (item) => praxisApi.tasks.checklist.delete(taskId, item.id),
    onMutate: (item) => runOptimistic(items.filter((i) => i.id !== item.id)),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  });

  const reorderItems = useMutation({
    mutationFn: (nextItems) => praxisApi.tasks.checklist.reorder(taskId, nextItems.map((i) => i.id)),
    onMutate: (nextItems) => runOptimistic(nextItems),
    onError: (_err, _vars, context) => rollback(context),
    onSettled: settle,
  });

  const isTemp = (item) => String(item.id).startsWith('temp-');

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    createItem.mutate(title);
    setNewTitle('');
  };

  const handleMove = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    if (items.some(isTemp)) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorderItems.mutate(next);
  };

  const doneCount = items.filter((i) => i.done).length;

  return (
    <section aria-labelledby={'checklist-' + taskId} className="space-y-2 rounded-xl bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={'checklist-' + taskId} className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
          Checklist
        </h3>
        {items.length > 0 ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground" aria-label={doneCount + ' de ' + items.length + ' feitos'}>
            {doneCount}/{items.length}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-4/5 rounded-lg" />
        </div>
      ) : items.length > 0 ? (
        <ul className="space-y-0.5">
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              item={item}
              index={index}
              count={items.length}
              onToggle={(it, done) => !isTemp(it) && updateItem.mutate({ item: it, data: { done } })}
              onRename={(it, title) => !isTemp(it) && updateItem.mutate({ item: it, data: { title } })}
              onDelete={(it) => !isTemp(it) && deleteItem.mutate(it)}
              onMove={handleMove}
            />
          ))}
        </ul>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">Quebre a tarefa em passos menores.</p>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Não deixar o Enter enviar o formulário da tarefa.
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Novo item"
          aria-label="Novo item do checklist"
          maxLength={240}
          className="h-9 bg-secondary/50 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={handleAdd}
          disabled={!newTitle.trim()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Adicionar
        </Button>
      </div>
    </section>
  );
}
