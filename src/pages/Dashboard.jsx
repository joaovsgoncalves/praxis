import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Greeting from '@/components/dashboard/Greeting';
import TodayTasks from '@/components/dashboard/TodayTasks';
import TodayHabits from '@/components/dashboard/TodayHabits';
import WellnessWidget from '@/components/dashboard/WellnessWidget';
import WeeklyProgress from '@/components/dashboard/WeeklyProgress';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', today],
    queryFn: () => base44.entities.Task.filter({ date: today }),
  });

  const { data: habits = [] } = useQuery({
    queryKey: ['habits'],
    queryFn: () => base44.entities.Habit.filter({ status: 'active' }),
  });

  const { data: habitLogs = [] } = useQuery({
    queryKey: ['habitLogs'],
    queryFn: () => base44.entities.HabitLog.list('-date', 200),
  });

  const { data: wellnessChecks = [] } = useQuery({
    queryKey: ['wellness', today],
    queryFn: () => base44.entities.WellnessCheck.filter({ date: today }),
  });

  const todayCheck = wellnessChecks[0] || null;

  const toggleTaskMutation = useMutation({
    mutationFn: (task) => {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      return base44.entities.Task.update(task.id, { status: newStatus });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      if (isDone) {
        const logs = await base44.entities.HabitLog.filter({ habit_id: habitId, date: today });
        if (logs[0]) await base44.entities.HabitLog.delete(logs[0].id);
      } else {
        await base44.entities.HabitLog.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habitLogs'] }),
  });

  const saveWellnessMutation = useMutation({
    mutationFn: async (data) => {
      if (todayCheck) {
        return base44.entities.WellnessCheck.update(todayCheck.id, data);
      }
      return base44.entities.WellnessCheck.create({ ...data, date: today });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wellness'] }),
  });

  return (
    <div className="space-y-6">
      <Greeting userName={user?.full_name} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TodayTasks tasks={tasks} onToggleComplete={(task) => toggleTaskMutation.mutate(task)} />
          <WeeklyProgress habits={habits} habitLogs={habitLogs} />
        </div>
        <div className="space-y-6">
          <TodayHabits
            habits={habits}
            habitLogs={habitLogs}
            onToggleHabit={(id, isDone) => toggleHabitMutation.mutate({ habitId: id, isDone })}
          />
          <WellnessWidget todayCheck={todayCheck} onSave={(data) => saveWellnessMutation.mutateAsync(data)} />
        </div>
      </div>

      <VoiceCaptureButton />
    </div>
  );
}