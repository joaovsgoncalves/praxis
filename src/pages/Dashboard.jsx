import React from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Greeting from '@/components/dashboard/Greeting';
import TodayTasks from '@/components/dashboard/TodayTasks';
import TodayHabits from '@/components/dashboard/TodayHabits';
import WellnessWidget from '@/components/dashboard/WellnessWidget';
import WeeklyProgress from '@/components/dashboard/WeeklyProgress';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import DayProgressBar from '@/components/shared/DayProgressBar';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodayCalendar from '@/components/dashboard/TodayCalendar';
import RitualWidget from '@/components/dashboard/RitualWidget';
import UpcomingPosts from '@/components/dashboard/UpcomingPosts';
import GamificationWidget from '@/components/dashboard/GamificationWidget';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const [waterMl, setWaterMl] = React.useState(() => {
    const dateKey = format(new Date(), 'yyyy-MM-dd');
    const savedMl = localStorage.getItem(`water_ml_${dateKey}`);
    if (savedMl) return Number(savedMl);

    // Migra o valor antigo salvo em copos de 250ml sem perder o registro do dia.
    const savedGlasses = localStorage.getItem(`water_${dateKey}`);
    return savedGlasses ? Number(savedGlasses) * 250 : 0;
  });

  const handleWaterUpdate = (val) => {
    setWaterMl(val);
    localStorage.setItem(`water_ml_${today}`, String(val));
  };

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', today],
    queryFn: () => forjaApi.tasks.list({ date: today }),
  });

  const { data: habits = [] } = useQuery({
    queryKey: ['habits'],
    queryFn: () => forjaApi.habits.list({ status: 'active' }),
  });

  const { data: habitLogs = [] } = useQuery({
    queryKey: ['habitLogs'],
    queryFn: () => forjaApi.habitLogs.list({}),
  });

  const { data: wellnessChecks = [] } = useQuery({
    queryKey: ['wellness', today],
    queryFn: () => forjaApi.wellness.list({ date: today }),
  });

  const todayCheck = wellnessChecks[0] || null;

  const toggleTaskMutation = useMutation({
    mutationFn: (task) => {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      return forjaApi.tasks.update(task.id, { status: newStatus });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const toggleHabitMutation = useMutation({
    mutationFn: async ({ habitId, isDone }) => {
      const logs = habitLogs.filter(l => l.habit_id === habitId && l.date === today);
      if (isDone && logs[0]) {
        await forjaApi.habitLogs.delete(logs[0].id);
      } else if (!isDone) {
        await forjaApi.habitLogs.create({ habit_id: habitId, date: today, completed: true });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habitLogs'] }),
  });

  const saveWellnessMutation = useMutation({
    mutationFn: async (data) => {
      return forjaApi.wellness.create({ ...data, date: today });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wellness'] }),
  });

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const todayLogs = habitLogs.filter(l => l.date === today);
  const completedHabits = habits.filter(h => todayLogs.some(l => l.habit_id === h.id && l.completed)).length;
  const progress = tasks.length + habits.length > 0 
    ? Math.round(((completedTasks + completedHabits) / (tasks.length + habits.length)) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      <Greeting />
      
      <DayProgressBar 
        progress={progress}
        habitsDone={completedHabits}
        habitsTotal={habits.length}
        tasksDone={completedTasks}
        tasksTotal={tasks.length}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TodayTasks 
            tasks={tasks} 
            onToggle={(task) => toggleTaskMutation.mutate(task)} 
          />
          <WeeklyProgress />
        </div>
        
        <div className="space-y-6">
          <TodayHabits 
            habits={habits} 
            habitLogs={habitLogs}
            today={today}
            onToggle={(habitId, isDone) => toggleHabitMutation.mutate({ habitId, isDone })} 
          />
          <TodayCalendar />
          <RitualWidget />
          <UpcomingPosts />
          <GamificationWidget />
          <WellnessWidget 
            todayCheck={todayCheck}
            onSave={(data) => saveWellnessMutation.mutateAsync(data)}
          />
          <WaterTracker 
            amountMl={waterMl}
            onUpdate={handleWaterUpdate}
          />
        </div>
      </div>

      <VoiceCaptureButton />
    </div>
  );
}
