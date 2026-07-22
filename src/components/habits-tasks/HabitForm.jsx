import React, { useState } from 'react';
import { CATEGORIES } from '@/lib/categories';
import { parseRecurrenceDays, normalizePreferredTime } from '@/lib/habits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const WEEK_DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export default function HabitForm({ onSubmit, onCancel, goals = [], initial = {} }) {
  const isEditing = Boolean(initial.id);

  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    frequency: initial.frequency || 'daily',
    category: initial.category || 'pessoal',
    streak_target: initial.streak_target || 30,
    goal_id: initial.goal_id || '',
    source: initial.source || 'manual',
    recurrence_days: parseRecurrenceDays(initial),
    target_value: initial.target_value ?? '',
    unit: initial.unit || '',
    preferred_time: normalizePreferredTime(initial.preferred_time) || '',
  });

  const toggleWeekDay = (day) => {
    setForm((f) => {
      const set = new Set(f.recurrence_days);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...f, recurrence_days: [...set].sort((a, b) => a - b) };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const payload = {
      ...form,
      streak_target: Number(form.streak_target),
      goal_id: form.goal_id || null,
      recurrence_days: form.frequency === 'weekly' ? form.recurrence_days : [],
      target_value: form.target_value === '' || form.target_value == null
        ? null
        : Number(form.target_value),
      unit: form.unit?.trim() || '',
      preferred_time: normalizePreferredTime(form.preferred_time) || '',
    };
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        placeholder="Nome do hábito"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="bg-secondary/50"
      />
      <Textarea
        placeholder="Descrição (opcional)"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        className="bg-secondary/50 h-20 resize-none"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Diário</SelectItem>
            <SelectItem value="weekdays">Dias úteis</SelectItem>
            <SelectItem value="weekends">Fins de semana</SelectItem>
            <SelectItem value="weekly">Semanal (escolher dias)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([key, cat]) => (
              <SelectItem key={key} value={key}>{cat.emoji} {cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.frequency === 'weekly' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Dias da semana</p>
          <div className="flex flex-wrap gap-2">
            {WEEK_DAYS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleWeekDay(value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  form.recurrence_days.includes(value)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="habit-preferred-time" className="text-xs font-medium text-muted-foreground">
          Horário preferido (opcional)
        </label>
        <Input
          id="habit-preferred-time"
          type="time"
          value={form.preferred_time}
          onChange={(e) => setForm((f) => ({ ...f, preferred_time: e.target.value }))}
          className="bg-secondary/50"
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Se o hábito roda em um horário fixo (ex.: 22h), marca aqui. Ele aparece com o relógio e sobe na ordem do ritual.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          type="number"
          placeholder="Meta de streak (dias)"
          value={form.streak_target}
          onChange={(e) => setForm((f) => ({ ...f, streak_target: e.target.value }))}
          className="bg-secondary/50"
        />
        <Input
          type="number"
          min="0"
          step="any"
          placeholder="Meta diária (opcional, ex: 8)"
          value={form.target_value}
          onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))}
          className="bg-secondary/50"
        />
      </div>
      {form.target_value !== '' && form.target_value != null && (
        <Input
          placeholder="Unidade (ex: copos, min, km)"
          value={form.unit}
          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          className="bg-secondary/50"
        />
      )}

      {goals.length > 0 && (
        <Select
          value={form.goal_id || 'none'}
          onValueChange={(v) => setForm((f) => ({ ...f, goal_id: v === 'none' ? '' : v }))}
        >
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Vincular a meta (opcional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            {goals.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" className="bg-primary hover:bg-primary/90">
          {isEditing ? 'Salvar alterações' : 'Criar Hábito'}
        </Button>
      </div>
    </form>
  );
}
