import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { praxisApi } from '@/api/praxisClient';
import { Link2, Sparkles, Flame, CheckCircle2, Trash2, Sun, Moon } from 'lucide-react';
import { PageHero, SectionHeading, PraxisListSkeleton, PraxisEmptyState } from '@/components/layout/PraxisPage';
import { RITUAL_TEMPLATES } from '@/lib/ritualTemplates';

const timeOptions = [
  { value: 'morning', label: 'Manhã', emoji: '🌅' },
  { value: 'afternoon', label: 'Tarde', emoji: '☀️' },
  { value: 'evening', label: 'Noite', emoji: '🌙' },
];

const mindsetCards = [
  {
    title: 'Ritual normal',
    description: 'Sequência completa para entrar no modo certo do dia.',
    icon: Sparkles,
    tone: 'text-gold',
  },
  {
    title: 'Ritual parcial',
    description: 'Fez alguns passos? Conta. O objetivo é manter tração, não culpa.',
    icon: CheckCircle2,
    tone: 'text-green-400',
  },
  {
    title: 'Ritual mínimo',
    description: 'Em dia pesado, faça só o primeiro passo e mantenha o fio da disciplina.',
    icon: Flame,
    tone: 'text-orange-400',
  },
];

function getProgress(ritual) {
  const habits = ritual.habits || [];
  const done = habits.filter((h) => h.completed_today).length;
  return {
    done,
    total: habits.length,
    percent: habits.length ? Math.round((done / habits.length) * 100) : 0,
    complete: habits.length > 0 && done === habits.length,
    partial: done > 0 && done < habits.length,
  };
}

export default function Rituais() {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [emoji, setEmoji] = React.useState('⚡');
  const [timeOfDay, setTimeOfDay] = React.useState('morning');
  const [selectedHabits, setSelectedHabits] = React.useState([]);

  const { data: rituals = [], isLoading: loadingRituals } = useQuery({
    queryKey: ['rituals'],
    queryFn: () => praxisApi.rituals.list({ status: 'active' }),
  });

  const { data: habits = [], isLoading: loadingHabits } = useQuery({
    queryKey: ['habits'],
    queryFn: () => praxisApi.habits.list({ status: 'active' }),
  });

  const createMutation = useMutation({
    mutationFn: () => praxisApi.rituals.create({
      name,
      emoji,
      time_of_day: timeOfDay,
      habits_order: selectedHabits,
    }),
    onSuccess: () => {
      setName('');
      setEmoji('⚡');
      setTimeOfDay('morning');
      setSelectedHabits([]);
      queryClient.invalidateQueries({ queryKey: ['rituals'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => praxisApi.rituals.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rituals'] }),
  });

  const templateMutation = useMutation({
    mutationFn: (templateId) => praxisApi.rituals.fromTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rituals'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['rituals', 'nav'] });
    },
  });

  const toggleHabit = (habitId) => {
    setSelectedHabits((current) => (
      current.includes(habitId)
        ? current.filter((id) => id !== habitId)
        : [...current, habitId]
    ));
  };

  const canCreate = name.trim() && selectedHabits.length > 0 && !createMutation.isPending;

  return (
    <div className="praxis-page">
      <PageHero
        kicker="Rituais"
        kickerIcon={Link2}
        title="Rituais"
        description="Sequências por período do dia. Em dia pesado, faça só o primeiro passo."
      />

      <div className="mt-6 space-y-8">
      <SectionHeading kicker="Modelos" title="Instalar sequência" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {RITUAL_TEMPLATES.map((tpl) => (
          <Card key={tpl.id} className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{tpl.emoji}</span>
                <div>
                  <h2 className="text-sm font-semibold">{tpl.title}</h2>
                  <p className="text-[11px] text-muted-foreground">{tpl.period}</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{tpl.description}</p>
              <Button
                className="w-full rounded-full"
                variant="secondary"
                disabled={templateMutation.isPending}
                onClick={() => templateMutation.mutate(tpl.id)}
              >
                {tpl.id === 'day_open' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                Instalar modelo
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <SectionHeading kicker="Mindset" title="Como encarar o dia" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {mindsetCards.map(({ title, description, icon: Icon, tone }) => (
          <Card key={title} className="bg-card border-border">
            <CardContent className="p-4 space-y-2">
              <Icon className={`w-5 h-5 ${tone}`} />
              <h2 className="text-sm font-semibold">{title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              Criar ritual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[64px_1fr] gap-3">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
                className="h-10 rounded-md bg-secondary/60 border border-border px-3 text-center text-lg outline-none focus:border-gold/60"
                aria-label="Emoji do ritual"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Ritual da manhã"
                className="h-10 rounded-md bg-secondary/60 border border-border px-3 text-sm outline-none focus:border-gold/60"
              />
            </div>

            <select
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="w-full h-10 rounded-md bg-secondary/60 border border-border px-3 text-sm outline-none focus:border-gold/60"
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.emoji} {option.label}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Passos / hábitos
              </p>
              {loadingHabits && <PraxisListSkeleton rows={3} className="border-0 bg-transparent shadow-none" />}
              {!loadingHabits && habits.length === 0 && (
                <p className="text-sm text-muted-foreground">Crie hábitos primeiro para montar rituais.</p>
              )}
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {habits.map((habit) => (
                  <label
                    key={habit.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 hover:bg-secondary cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedHabits.includes(habit.id)}
                      onCheckedChange={() => toggleHabit(habit.id)}
                    />
                    <span className="text-sm flex-1 truncate">{habit.title}</span>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                      {habit.frequency || 'daily'}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="w-full bg-gold text-black hover:bg-gold/90"
              disabled={!canCreate}
              onClick={() => createMutation.mutate()}
            >
              Criar sequência
            </Button>
            {createMutation.isError && (
              <p className="text-xs text-destructive">Não consegui criar o ritual agora.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Rituais ativos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingRituals && <PraxisListSkeleton rows={3} />}
            {!loadingRituals && rituals.length === 0 && (
              <PraxisEmptyState
                icon={Sparkles}
                title="Nenhum ritual ativo"
                description="Use os modelos acima ou monte o seu. O item Rituais volta no menu quando houver um ativo."
              />
            )}

            {rituals.map((ritual) => {
              const progress = getProgress(ritual);
              const time = timeOptions.find((option) => option.value === ritual.time_of_day) || timeOptions[0];
              return (
                <div key={ritual.id} className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{ritual.emoji || '⚡'}</span>
                        <h2 className="font-semibold truncate">{ritual.name}</h2>
                        <Badge variant="outline" className="border-border text-xs">
                          {time.emoji} {time.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.complete
                          ? 'Completo hoje. Mantém assim.'
                          : progress.partial
                            ? 'Parcial hoje. Já conta — sem culpa.'
                            : 'Ainda não iniciado hoje. Faça o mínimo primeiro.'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(ritual.id)}
                      aria-label="Excluir ritual"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <Progress
                    value={progress.percent}
                    className={progress.complete ? '[&>div]:bg-green-500' : '[&>div]:bg-gold'}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    {(ritual.habits || []).map((habit, index) => (
                      <div key={habit.id} className="flex items-center gap-2 text-sm rounded-lg bg-background/40 p-2">
                        <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className={habit.completed_today ? 'line-through text-muted-foreground' : ''}>
                          {habit.title || habit.name}
                        </span>
                        {habit.completed_today && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
