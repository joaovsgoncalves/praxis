import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import WaterTracker from '@/components/dashboard/WaterTracker';
import { praxisApi } from '@/api/praxisClient';
import { migrateLocalWater } from '@/lib/nutritionWater';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NutritionWaterPanel({ date }) {
  const queryClient = useQueryClient();
  const queryKey = ['nutrition', 'water', date];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const remote = await praxisApi.nutrition.water.get(date);
      const result = await migrateLocalWater({
        storage: window.localStorage,
        date,
        remote,
        save: (payload) => praxisApi.nutrition.water.set(payload),
      });
      return result.record;
    },
    refetchOnWindowFocus: true,
  });

  const saveMutation = useMutation({
    mutationFn: (amountMl) => praxisApi.nutrition.water.set({
      date,
      amount_ml: amountMl,
      expected_revision: data?.revision ?? 0,
    }),
    onSuccess: (record) => queryClient.setQueryData(queryKey, record),
    onError: (error) => {
      if (error?.status === 409 && error?.body?.current) {
        queryClient.setQueryData(queryKey, error.body.current);
        toast.info('A água foi atualizada em outro dispositivo. Mostrei o valor mais recente.');
        return;
      }
      toast.error('Não foi possível salvar a água. O valor anterior foi mantido.');
    },
  });

  if (isLoading) {
    return (
      <Card className="border-border/80 bg-card/40 shadow-none">
        <CardContent className="space-y-4 px-5 py-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="mx-auto h-11 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-border/80 bg-card/40 shadow-none">
        <CardContent className="space-y-3 px-5 py-5">
          <p className="text-sm font-semibold">Não foi possível carregar a água</p>
          <p className="text-xs text-muted-foreground">Seu registro local continua preservado.</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      <WaterTracker
        amountMl={data?.amount_ml ?? 0}
        onUpdate={(value) => {
          if (!saveMutation.isPending) saveMutation.mutate(value);
        }}
        disabled={saveMutation.isPending}
      />
      <p className="px-1 text-xs text-muted-foreground">
        Água de {date.split('-').reverse().join('/')} · sincronizada na sua conta.
      </p>
    </div>
  );
}
