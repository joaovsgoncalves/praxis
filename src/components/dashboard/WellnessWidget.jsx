import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Moon, Smile, Zap, Check, Star } from 'lucide-react';

const moodEmojis = ['😞', '😕', '😐', '🙂', '😁'];
const moodLabels = ['Péssimo', 'Ruim', 'Neutro', 'Bom', 'Ótimo'];
const sleepQualityEmojis = ['😫', '😪', '😑', '😊', '🌟'];
const sleepQualityLabels = ['Horrível', 'Ruim', 'Ok', 'Boa', 'Excelente'];
const productivityLabels = ['Nenhuma', 'Baixa', 'Média', 'Alta', 'Máxima'];

function ScoreButton({ value, current, onClick, emoji }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex-1 py-2 rounded-lg text-lg transition-all ${
        current === value
          ? 'bg-primary/20 ring-2 ring-primary scale-105'
          : 'bg-secondary/60 hover:bg-secondary'
      }`}
    >
      {emoji}
    </button>
  );
}

export default function WellnessWidget({ todayCheck, onSave }) {
  const [showForm, setShowForm] = useState(!todayCheck);
  const [data, setData] = useState({
    sleep_hours: todayCheck?.sleep_hours ?? 7,
    sleep_quality: todayCheck?.sleep_quality ?? 3,
    mood: todayCheck?.mood ?? 3,
    productivity: todayCheck?.productivity ?? 3,
    note: todayCheck?.note || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(data);
    setSaving(false);
    setShowForm(false);
  };

  if (!showForm && todayCheck) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Bem-estar Hoje</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setShowForm(true)}>
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl mb-1">{moodEmojis[(todayCheck.mood || 3) - 1]}</div>
              <p className="text-[10px] text-muted-foreground">Humor</p>
              <p className="text-xs font-medium">{moodLabels[(todayCheck.mood || 3) - 1]}</p>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-chart-3 mb-1">{todayCheck.sleep_hours || 7}h</div>
              <p className="text-[10px] text-muted-foreground">Sono</p>
              <p className="text-xs font-medium">{sleepQualityLabels[(todayCheck.sleep_quality || 3) - 1]}</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">{sleepQualityEmojis[(todayCheck.sleep_quality || 3) - 1]}</div>
              <p className="text-[10px] text-muted-foreground">Qualidade</p>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-primary mb-1">{todayCheck.productivity || 3}/5</div>
              <p className="text-[10px] text-muted-foreground">Produtiv.</p>
              <p className="text-xs font-medium">{productivityLabels[(todayCheck.productivity || 3) - 1]}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {todayCheck ? 'Editar Check-in' : 'Como está seu dia?'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

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
                onClick={() => setData(d => ({ ...d, productivity: v }))}
                className={`flex-1 h-2 rounded-full transition-all ${
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

        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? 'Salvando...' : <><Check className="w-4 h-4 mr-2" />Salvar Check-in</>}
        </Button>
      </CardContent>
    </Card>
  );
}