import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link2, Construction } from 'lucide-react';

export default function Rituais() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center">
          <Link2 className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Rituais</h1>
          <p className="text-sm text-muted-foreground">Organize seus hábitos em sequências por período do dia</p>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Construction className="w-4 h-4 text-gold" />
            Em Construção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
              <Construction className="w-8 h-8 text-gold" />
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                A página de gerenciamento de rituais está sendo forjada.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Em breve você poderá criar, editar e organizar seus rituais diários.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
