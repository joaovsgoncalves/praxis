import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { forjaApi } from '@/api/forjaClient';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const levelEmojis = {
  1: '🌱',
  2: '📖',
  3: '💪',
  4: '🎯',
  5: '🔥',
  6: '🧠',
  7: '👑',
};

function AchievementCard({ achievement, index }) {
  const { emoji, name, description, xp_reward, unlocked, unlocked_at } = achievement;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
    >
      <Card
        className={cn(
          'h-full transition-all duration-200',
          unlocked
            ? 'bg-card border-gold/30 hover:border-gold/50 hover:shadow-lg hover:shadow-gold/10'
            : 'bg-card/50 border-border/50 opacity-60 grayscale hover:opacity-75'
        )}
      >
        <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
          {/* Emoji */}
          <span className={cn('text-4xl', !unlocked && 'filter grayscale')}>
            {unlocked ? (emoji || '🏆') : '🔒'}
          </span>

          {/* Name */}
          <h3 className={cn(
            'text-sm font-semibold',
            unlocked ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {name}
          </h3>

          {/* Description */}
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {description}
            </p>
          )}

          {/* XP Reward */}
          <Badge
            variant="outline"
            className={cn(
              'text-[10px]',
              unlocked
                ? 'bg-gold/10 text-gold border-gold/20'
                : 'bg-secondary/40 text-muted-foreground border-border/50'
            )}
          >
            +{xp_reward} XP
          </Badge>

          {/* Unlock date or locked status */}
          {unlocked && unlocked_at ? (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(new Date(unlocked_at), 'dd/MM/yyyy')}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">
              🔒 Bloqueado
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Achievements() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => forjaApi.gamification.get(),
  });

  const achievements = data?.achievements || [];

  // Sort: unlocked first, then locked
  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return 0;
  });

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Trophy className="w-7 h-7 text-gold" />
          Conquistas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading
            ? 'Carregando conquistas...'
            : unlockedCount > 0
              ? `${unlockedCount} desbloqueada${unlockedCount !== 1 ? 's' : ''}`
              : 'Complete tarefas e hábitos para desbloquear — o menu Conquistas aparece com a primeira.'}
        </p>
      </div>

      {/* Level summary */}
      {data && (
        <Card className="bg-card border-gold/20">
          <CardContent className="p-4 flex items-center gap-4">
            <span className="text-4xl">{levelEmojis[data.level] || '⭐'}</span>
            <div>
              <p className="text-lg font-bold text-gold">
                Nível {data.level} — {data.level_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.xp_total} XP total · Próximo nível em {data.next_level_xp - data.xp_total} XP
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-destructive">Erro ao carregar conquistas</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && achievements.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma conquista disponível ainda</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Continue completando tarefas e hábitos para desbloquear conquistas!
          </p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && !isError && achievements.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sorted.map((achievement, index) => (
            <AchievementCard
              key={achievement.id || achievement.slug || index}
              achievement={achievement}
              index={index}
            />
          ))}
        </div>
      )}
    </div>
  );
}
