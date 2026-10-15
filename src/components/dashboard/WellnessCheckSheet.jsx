import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Moon, Smile, Zap, Check, Star } from 'lucide-react';

const moodEmojis = ['😞', '😕', '😐', '🙂', '😁'];
export const moodLabels = ['Péssimo', 'Ruim', 'Neutro', 'Bom', 'Ótimo'];
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

/** Sheet do check-in do dia (humor, sono, produtividade). Abre a partir do card do Hoje. */
export default function WellnessCheckSheet({ open, onOpenChange, todayCheck, onSave, onSaved }) {
  const [data, setData] = useState({
    sleep_hours: todayCheck?.sleep_hours ?? 7,
    sleep_quality: todayCheck?.sleep_quality ?? 3,
    mood: todayCheck?.mood ?? 3,
    productivity: todayCheck?.productivity ?? 3,
    note: todayCheck?.note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!todayCheck) return;
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
      onSaved?.(saved || data);
      onOpenChange(false);
    } catch (err) {
      setError('Não consegui salvar agora. Tenta de novo em instantes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-white/10 bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{todayCheck ? 'Editar check-in' : 'Como foi o dia?'}</SheetTitle>
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
}
