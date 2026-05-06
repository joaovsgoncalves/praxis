import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';

export default function TaskForm({ onSubmit, onCancel, goals = [], initial = {} }) {
  const [form, setForm] = useState({
    title: initial.title || '',
    description: initial.description || '',
    date: initial.date || '',
    time: initial.time || '',
    duration_minutes: initial.duration_minutes || '',
    priority: initial.priority || 'medium',
    category: initial.category || 'personal',
    goal_id: initial.goal_id || '',
    source: initial.source || 'manual',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit({ ...form, duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input placeholder="Título da tarefa" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="bg-secondary/50" />
      <Textarea placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary/50 h-20 resize-none" />
      <div className="grid grid-cols-2 gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal bg-secondary/50">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {form.date ? format(new Date(form.date + 'T12:00:00'), 'dd/MM/yyyy') : 'Data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={form.date ? new Date(form.date + 'T12:00:00') : undefined} onSelect={(d) => setForm(f => ({ ...f, date: d ? format(d, 'yyyy-MM-dd') : '' }))} /></PopoverContent>
        </Popover>
        <Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className="bg-secondary/50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
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
        <Button type="submit" className="bg-primary hover:bg-primary/90">Criar Tarefa</Button>
      </div>
    </form>
  );
}