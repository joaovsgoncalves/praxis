import React from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, UtensilsCrossed } from 'lucide-react';
import { PageHero } from '@/components/layout/PraxisPage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Slot futuro — treinos do dia / histórico.
 * Fase 4 do plano Hoje·Corpo·Nav: só placeholder + nav.
 */
export default function Treinos() {
  return (
    <div className="praxis-page max-w-xl space-y-6 pb-24">
      <PageHero
        kicker="Ferramentas"
        kickerIcon={Dumbbell}
        title="Treinos"
        description="Treino do dia e histórico — em breve. Por enquanto o corpo do dia continua em Nutrição e no check-in do Hoje."
      />

      <Card className="border-dashed border-border/60 bg-card/40">
        <CardContent className="space-y-4 px-5 py-8">
          <p className="text-sm font-semibold">Em breve</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta aba é o lugar dos teus treinos. Ainda não tem CRUD — só o slot na navegação pra gente desenvolver com calma.
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Treino do dia (checklist simples)</li>
            <li>Log de sessão (duração / feito)</li>
            <li>Ligação leve com macros e água em Nutrição</li>
          </ul>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/nutricao">
              <UtensilsCrossed className="mr-1.5 h-4 w-4" />
              Ir pra Nutrição
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
