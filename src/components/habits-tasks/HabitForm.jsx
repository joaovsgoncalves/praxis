import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function HabitForm({ onSubmit, onCancel, goals = [], initial = {} }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    frequency: initial.frequency || 'daily',
    category: initial.category || 'personal',
    streak_target: initial.streak_target || 30,
    goal_id: initial.goal_id || '',
    source: initial.source || 'manual',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit({ ...form, streak_target: Number(form.streak_target) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input placeholder="Nome do hábito" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="bg-secondary/50" />
      <Textarea placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary/50 h-20 resize-none" />
      <div className="grid grid-cols-2 gap-3">
        <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Diário</SelectItem>
            <SelectItem value="weekdays">Dias úteis</SelectItem>
            <SelectItem value="weekends">Fins de semana</SelectItem>
            <SelectItem value="weekly">Semanal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="work">Trabalho</SelectItem>
            <SelectItem value="personal">Pessoal</SelectItem>
            <SelectItem value="health">Saúde</SelectItem>
            <SelectItem value="learning">Aprendizado</SelectItem>
            <SelectItem value="finance">Financeiro</SelectItem>
            <SelectItem value="other">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input type="number" placeholder="Meta de streak (dias)" value={form.streak_target} onChange={e => setForm(f => ({ ...f, streak_target: e.target.value }))} className="bg-secondary/50" />
      {goals.length > 0 && (
        <Select value={form.goal_id} onValueChange={v => setForm(f => ({ ...f, goal_id: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue placeholder="Vincular a meta (opcional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Nenhuma</SelectItem>
            {goals.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" className="bg-primary hover:bg-primary/90">Criar Hábito</Button>
      </div>
    </form>
  );
}