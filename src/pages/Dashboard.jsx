import React from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DayWins from '@/components/dashboard/DayWins';
import HeroDay from '@/components/dashboard/HeroDay';
import TodayTasks from '@/components/dashboard/TodayTasks';
import TodayHabits from '@/components/dashboard/TodayHabits';
import WellnessWidget from '@/components/dashboard/WellnessWidget';
import WeeklyProgress from '@/components/dashboard/WeeklyProgress';
import VoiceCaptureButton from '@/components/shared/VoiceCaptureButton';
import WaterTracker from '@/components/dashboard/WaterTracker';
import TodayCalendar from '@/components/dashboard/TodayCalendar';
import RitualWidget from '@/components/dashboard/RitualWidget';
import UpcomingPosts from '@/components/dashboard/UpcomingPosts';
import GamificationWidget from '@/components/dashboard/GamificationWidget';
import CorrelationWidget from '@/components/dashboard/CorrelationWidget';
import WeeklyReviewPrompt from '@/components/dashboard/WeeklyReviewPrompt';
import HabitsHeatmap from '@/components/dashboard/HabitsHeatmap';
import OfflineBanner from '@/components/shared/OfflineBanner';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { fortalezaDateKey } from '@/lib/dates';
import { isTaskCompletedForToday, isTaskDone, sortTodayRelevantTasks } from '@/lib/tasks';

// Widgets are wrapped in domain-aware sections so each block has a hover-glow
// in its semantic color (defined via .card-domain in index.css).
const Slot = ({ domain = 'focus', children }) => (
  <div className={`rounded-2xl card-domain domain-${domain}`}>{children}</div>
);

export default function Dashboard() {
  const queryClient = useQueryClient();
  const today = fortalezaDateKey();
  const { tod } = useTimeOfDay();

  const [waterMl, setWaterMl] = React.useState(() => {
    const dateKey = fortalezaDateKey();
    const savedMl = localStorage.getItem(`water_ml_${dateKey}`);
    if (savedMl) return Number(savedMl);
    const savedGlasses = localStorage.getItem(`water_${dateKey}`);
    return savedGlasses ? Number(savedGlasses) * 250 : 0;
  });

  const handleWaterUpdate = (val) => {
    setWaterMl(val);
    localStorage.setItem(`water_ml_${today}`, String(val));
  };

  const { data: allTasks = [] } = useQuery({
    queryKey: ['dashboardTasks', today],
    queryFn: () => forjaApi.tasks.list({ limit: 200 }),
  });

  const tasks = React.useMemo(() => {
    return allTasks
      .filter(task => {
        const isToday = task.date === today;
        const isOverduePending = !isTaskDone(task) && task.date && task.date < today;
        return isToday || isOverduePending || isTaskCompletedForToday(task, today);
      })
      .sort(sortTodayRelevantTasks);
  }, [allTasks, today]);
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
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: () => forjaApi.user.getSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const todayCheck = wellnessChecks[0] || null;

  const toggleTaskMutation = useMutation({
    mutationFn: (task) => {
      const newStatus = isTaskDone(task) ? 'pending' : 'completed';
      return forjaApi.tasks.update(task.id, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardTasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['allTasks'] });
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
    },
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
    mutationFn: async (data) => forjaApi.wellness.create({ ...data, date: today }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wellness'] }),
  });

  const completedTasks = tasks.filter(t => isTaskDone(t)).length;
  const todayLogs = habitLogs.filter(l => l.date === today);
  const completedHabits = habits.filter(h =>
    todayLogs.some(l => l.habit_id === h.id && l.completed)
  ).length;

  // Time-aware widget composition.
  // The same widgets exist in every mode — but the column they live in and
  // their order changes based on what's most relevant at this hour.
  const blocks = {
    dayWins:     <Slot domain="gold"><DayWins tasks={tasks} today={today} onToggleComplete={(t) => toggleTaskMutation.mutate(t)} /></Slot>,
    tasks:       <Slot domain="ember"><TodayTasks tasks={tasks} today={today} onToggleComplete={(t) => toggleTaskMutation.mutate(t)} /></Slot>,
    habits:      <Slot domain="wellness"><TodayHabits habits={habits} habitLogs={habitLogs} onToggleHabit={(habitId, isDone) => toggleHabitMutation.mutate({ habitId, isDone })} /></Slot>,
    rituals:     <Slot domain="ember"><RitualWidget /></Slot>,
    calendar:    <Slot domain="sky"><TodayCalendar /></Slot>,
    posts:       <Slot domain="pink"><UpcomingPosts /></Slot>,
    gamification:<Slot domain="gold"><GamificationWidget /></Slot>,
    wellness:    <Slot domain="wellness"><WellnessWidget todayCheck={todayCheck} onSave={(d) => saveWellnessMutation.mutateAsync(d)} /></Slot>,
    water:       <Slot domain="sky"><WaterTracker amountMl={waterMl} onUpdate={handleWaterUpdate} /></Slot>,
    weeklyProgress: <div className="hidden md:block"><Slot domain="focus"><WeeklyProgress habits={habits} habitLogs={habitLogs} /></Slot></div>,
    heatmap:     <HabitsHeatmap />,
    correlation: <Slot domain="wellness"><CorrelationWidget /></Slot>,
  };

  let mainCol, sideCol;
  // Cockpit Praxis: vitórias + execução + agenda primeiro; analytics secundário.
  mainCol = ['dayWins', 'tasks', 'calendar', 'habits'];
  sideCol = ['rituals', 'water', 'wellness', 'weeklyProgress'];
  if (tod === 'evening' || tod === 'late_night') {
    sideCol = ['wellness', 'rituals', 'water', 'weeklyProgress'];
  }

  return (
    <div className="space-y-5 sm:space-y-8 lg:space-y-10">
      <OfflineBanner />

      <HeroDay
        habitsDone={completedHabits}
        habitsTotal={habits.length}
        tasksDone={completedTasks}
        tasksTotal={tasks.length}
        userName={settings?.full_name}
      />

      <WeeklyReviewPrompt />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.9fr)] gap-7 lg:gap-8 items-start">
        <div className="space-y-7 lg:space-y-8">
          {mainCol.map(key => <React.Fragment key={key}>{blocks[key]}</React.Fragment>)}
        </div>
        <div className="space-y-7 lg:space-y-8">
          {sideCol.map(key => <React.Fragment key={key}>{blocks[key]}</React.Fragment>)}
        </div>
      </div>

      <VoiceCaptureButton />
    </div>
  );
}
