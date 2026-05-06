import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Moon, Smile, Zap, Save, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const moodEmojis = ['😞', '😕', '😐', '🙂', '😁'];
const sleepEmojis = ['😴', '😪', '😑', '😊', '🌟'];

export default function WellnessWidget({ todayCheck, onSave }) {
  const [showForm, setShowForm] = useState(!todayCheck);
  const [data, setData] = useState({
    sleep_hours: todayCheck?.sleep_hours || 7,
    sleep_quality: todayCheck?.sleep_quality || 3,
    mood: todayCheck?.mood || 3,
    productivity: todayCheck?.productivity || 3,
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
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowForm(true)}>
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl mb-1">{moodEmojis[(todayCheck.mood || 3) - 1]}</div>
              <p className="text-xs text-muted-foreground">Humor</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">{sleepEmojis[(todayCheck.sleep_quality || 3) - 1]}</div>
              <p className="text-xs text-muted-foreground">Sono</p>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-primary mb-1">{todayCheck.productivity || 3}/5</div>
              <p className="text-xs text-muted-foreground">Produtividade</p>
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
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Smile className="w-4 h-4 text-chart-4" />
              <span className="text-sm">Humor</span>
            </div>
            <span className="text-lg">{moodEmojis[data.mood - 1]}</span>
          </div>
          <Slider value={[data.mood]} min={1} max={5} step={1} onValueChange={([v]) => setData(d => ({ ...d, mood: v }))} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-chart-3" />
              <span className="text-sm">Sono ({data.sleep_hours}h)</span>
            </div>
            <span className="text-lg">{sleepEmojis[data.sleep_quality - 1]}</span>
          </div>
          <Slider value={[data.sleep_hours]} min={3} max={12} step={0.5} onValueChange={([v]) => setData(d => ({ ...d, sleep_hours: v }))} className="mb-2" />
          <Slider value={[data.sleep_quality]} min={1} max={5} step={1} onValueChange={([v]) => setData(d => ({ ...d, sleep_quality: v }))} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm">Produtividade</span>
            </div>
            <span className="text-sm font-medium text-primary">{data.productivity}/5</span>
          </div>
          <Slider value={[data.productivity]} min={1} max={5} step={1} onValueChange={([v]) => setData(d => ({ ...d, productivity: v }))} />
        </div>

        <Textarea
          placeholder="Nota do dia (opcional)..."
          value={data.note}
          onChange={e => setData(d => ({ ...d, note: e.target.value }))}
          className="bg-secondary/50 border-border resize-none h-16"
        />

        <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
          {saving ? 'Salvando...' : <><Check className="w-4 h-4 mr-2" />Salvar Check-in</>}
        </Button>
      </CardContent>
    </Card>
  );
}