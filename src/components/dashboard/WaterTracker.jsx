import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Plus, Minus } from 'lucide-react';

const DAILY_GOAL_ML = 4000;
const STEP_ML = 250;
const SEGMENT_COUNT = DAILY_GOAL_ML / STEP_ML;

const formatMl = (value) => `${value.toLocaleString('pt-BR')} ml`;

export default function WaterTracker({ amountMl = 0, onUpdate }) {
  const safeAmount = Math.min(DAILY_GOAL_ML, Math.max(0, Number(amountMl) || 0));
  const filledSegments = Math.round(safeAmount / STEP_ML);
  const remainingMl = Math.max(0, DAILY_GOAL_ML - safeAmount);

  const updateAmount = (nextMl) => {
    onUpdate(Math.min(DAILY_GOAL_ML, Math.max(0, nextMl)));
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold">Água</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatMl(safeAmount)} / 4L
          </span>
        </div>

        <div className="grid grid-cols-8 gap-1 mb-3" aria-label="Progresso de água em ml">
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
            <button
              key={i}
              onClick={() => updateAmount(i < filledSegments ? i * STEP_ML : (i + 1) * STEP_ML)}
              className="transition-all"
              title={`${(i + 1) * STEP_ML} ml`}
            >
              <div className={`w-full aspect-square rounded-sm border ${
                i < filledSegments
                  ? 'bg-blue-500/80 border-blue-400'
                  : 'bg-secondary/50 border-border'
              }`} />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => updateAmount(safeAmount - STEP_ML)}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            aria-label="Diminuir 250 ml"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground text-center">
            {safeAmount >= DAILY_GOAL_ML ? '🎉 Meta de 4L atingida!' : `Faltam ${formatMl(remainingMl)}`}
          </span>
          <button
            onClick={() => updateAmount(safeAmount + STEP_ML)}
            className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center hover:bg-blue-500/30 transition-colors"
            aria-label="Adicionar 250 ml"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}