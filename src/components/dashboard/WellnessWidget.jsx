import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Moon, Smile, Zap, Check, Star, Heart, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fortalezaNowTimeHHMM } from '@/lib/dates';

/** Depois desta hora (Fortaleza) a linha do check-in fica dourada. */
const EVENING_HOUR = 18;

const moodEmojis = ['😞', '😕', '😐', '🙂', '😁'];
const moodLabels = ['Péssimo', 'Ruim', 'Neutro', 'Bom', 'Ótimo'];
const sleepQualityEmojis = ['😫', '😪', '😑', '😊', '🌟'];
const sleepQualityLabels = ['Horrível', 'Ruim', 'Ok', 'Boa', 'Excelente'];
const productivityLabels = ['Nenhuma', 'Baixa', 'Média', 'Alta', 'Máxima'];

function ScoreButton({ value, current, onClick, emoji }) {
  return (
    <button
      onClick={() => onClick(value)}
      type="button"
      className={`flex-1 py-2 rounded-lg text-lg transition-[background-color,transform] duration-100 ease-out motion-reduce:transition-none ${
        current === value
          ? 'bg-primary/20 ring-2 ring-primary scale-105'
          : 'bg-secondary/60 hover:bg-secondary'
      }`}
    >
      {emoji}
    </button>
  );
}

export default function WellnessWidget({ todayCheck, onSave, now }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [data, setData] = useState({
    sleep_hours: todayCheck?.sleep_hours ?? 7,
    sleep_quality: todayCheck?.sleep_quality ?? 3,
    mood: todayCheck?.mood ?? 3,
    productivity: todayCheck?.productivity ?? 3,
    note: todayCheck?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCheck, setSavedCheck] = useState(todayCheck || null);
  const activeCheck = savedCheck || todayCheck;
  const hour = Number(fortalezaNowTimeHHMM(now instanceof Date ? now : new Date()).slice(0, 2)) % 24;
  const isEvening = hour >= EVENING_HOUR;

  useEffect(() => {
    if (!todayCheck) return;
    setSavedCheck(todayCheck);
    setData({
      sleep_hours: todayCheck.sleep_hours ?? 7,
      sleep_quality: todayCheck.sleep_quality ?? 3,
      mood: todayCheck.mood ?? 3,
      productivity: todayCheck.productivity ?? 3,
      note: todayCheck.note || '',
    });
  }, [todayCheck?.id]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await onSave(data);
      setSavedCheck(saved || data);
      setSheetOpen(false);
    } catch (err) {
      setError('Não consegui salvar agora. Tenta de novo em instantes.');
    } finally {
      setSaving(false);
    }
  };

  const sheet = (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-white/10 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{activeCheck ? 'Editar check-in' : 'Como foi o dia?'}</SheetTitle>
          <SheetDescription>Humor, sono e produtividade de hoje.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
        {/* Humor */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Smile className="w-4 h-4 text-chart-4" />
            <span className="text-sm font-medium">Humor</span>
            <span className="ml-auto text-xs text-muted-foreground">{moodLabels[data.mood - 1]}</span>
          </div>
          <div className="flex gap-2">
            {moodEmojis.map((emoji, i) => (
              <ScoreButton key={i} value={i + 1} current={data.mood} onClick={v => setData(d => ({ ...d, mood: v }))} emoji={emoji} />
            ))}
          </div>
        </div>

        {/* Sono — horas */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Moon className="w-4 h-4 text-chart-3" />
            <span className="text-sm font-medium">Horas de sono</span>
            <span className="ml-auto text-sm font-bold text-chart-3">{data.sleep_hours}h</span>
          </div>
          <Slider
            value={[data.sleep_hours]}
            min={3}
            max={12}
            step={0.5}
            onValueChange={([v]) => setData(d => ({ ...d, sleep_hours: v }))}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>3h</span>
            <span>7.5h</span>
            <span>12h</span>
          </div>
        </div>

        {/* Qualidade do sono */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-chart-4" />
            <span className="text-sm font-medium">Qualidade do sono</span>
            <span className="ml-auto text-xs text-muted-foreground">{sleepQualityLabels[data.sleep_quality - 1]}</span>
          </div>
          <div className="flex gap-2">
            {sleepQualityEmojis.map((emoji, i) => (
              <ScoreButton key={i} value={i + 1} current={data.sleep_quality} onClick={v => setData(d => ({ ...d, sleep_quality: v }))} emoji={emoji} />
            ))}
          </div>
        </div>

        {/* Produtividade */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Produtividade</span>
            <span className="ml-auto text-xs font-bold text-primary">{data.productivity}/5 — {productivityLabels[data.productivity - 1]}</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(v => (
              <button
                key={v}
                type="button"
                aria-label={`Produtividade ${v} de 5`}
                onClick={() => setData(d => ({ ...d, productivity: v }))}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  v <= data.productivity ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
        </div>

        <Textarea
          placeholder="Nota do dia (opcional)..."
          value={data.note}
          onChange={e => setData(d => ({ ...d, note: e.target.value }))}
          className="bg-secondary/50 border-border resize-none h-16 text-sm"
        />

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? 'Salvando...' : <><Check className="w-4 h-4 mr-2" />Salvar Check-in</>}
        </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  if (!activeCheck) {
    return (
      <>
        <Card
          className={cn(
            'praxis-dashboard-card praxis-context-card',
            isEvening && 'border-domain-gold/30 bg-domain-gold/[0.06]'
          )}
          data-testid="wellness-collapsed"
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-h-[64px] w-full items-center gap-3 rounded-[inherit] px-4 py-3 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                isEvening ? 'border-domain-gold/25 bg-domain-gold/[0.1]' : 'border-domain-wellness/15 bg-domain-wellness/[0.07]'
              )}
            >
              <Heart className={cn('h-4 w-4', isEvening ? 'text-domain-gold' : 'text-domain-wellness')} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm font-semibold', isEvening && 'text-domain-gold')}>Como foi o dia?</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">Humor, sono e produtividade</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </Card>
        {sheet}
      </>
    );
  }

  const wellnessStats = [
    { label: 'Humor', value: moodEmojis[(activeCheck.mood || 3) - 1], detail: moodLabels[(activeCheck.mood || 3) - 1] },
    { label: 'Sono', value: `${activeCheck.sleep_hours || 7}h`, detail: sleepQualityLabels[(activeCheck.sleep_quality || 3) - 1] },
    { label: 'Qualidade', value: sleepQualityEmojis[(activeCheck.sleep_quality || 3) - 1], detail: sleepQualityLabels[(activeCheck.sleep_quality || 3) - 1] },
    { label: 'Produtividade', value: `${activeCheck.productivity || 3}/5`, detail: productivityLabels[(activeCheck.productivity || 3) - 1] },
  ];

  return (
    <>
      <Card className="praxis-dashboard-card praxis-context-card">
        <CardContent className="p-5 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-domain-wellness/15 bg-domain-wellness/[0.07]">
                <Heart className="h-4 w-4 text-domain-wellness" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Corpo</p>
                <h3 className="praxis-title mt-0.5 text-base font-semibold tracking-[-0.025em]">Bem-estar hoje</h3>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground" onClick={() => setSheetOpen(true)}>
              Editar
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {wellnessStats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/[0.05] bg-white/[0.022] px-3 py-3">
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <p className="text-lg font-semibold tabular-nums leading-none">{stat.value}</p>
                  <p className="truncate text-[10px] text-muted-foreground/75">{stat.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {sheet}
    </>
  );
}
