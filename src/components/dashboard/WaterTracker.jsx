import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Droplets, Plus, Minus } from 'lucide-react';

const GOAL = 8; // copos de 250ml

export default function WaterTracker({ glasses, onUpdate }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold">Água</span>
          </div>
          <span className="text-xs text-muted-foreground">{glasses}/{GOAL} copos</span>
        </div>

        {/* Glassas visuais */}
        <div className="grid grid-cols-8 gap-1 mb-3">
          {Array.from({ length: GOAL }).map((_, i) => (
            <button
              key={i}
              onClick={() => onUpdate(i < glasses ? i : i + 1)}
              className="transition-all"
            >
              <div className={`w-full aspect-square rounded-sm border ${
                i < glasses
                  ? 'bg-blue-500/80 border-blue-400'
                  : 'bg-secondary/50 border-border'
              }`} />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => onUpdate(Math.max(0, glasses - 1))}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-muted-foreground">
            {glasses >= GOAL ? '🎉 Meta atingida!' : `Faltam ${GOAL - glasses} copos`}
          </span>
          <button
            onClick={() => onUpdate(Math.min(GOAL, glasses + 1))}
            className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center hover:bg-blue-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}