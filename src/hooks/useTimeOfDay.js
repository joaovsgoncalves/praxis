import { useEffect, useState } from 'react';

// Phases used by the dashboard to rearrange and re-emphasize widgets.
// Re-evaluates every 5 minutes so the layout shifts with the day.
export function getTimeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h < 5)  return 'late_night';
  if (h < 11) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'late_night';
}

const COPY = {
  morning:    { greeting: 'Bom dia',  emoji: '🌅', tagline: 'Hora de abrir a Praxis.' },
  afternoon:  { greeting: 'Boa tarde', emoji: '☀️', tagline: 'Mantenha o calor.' },
  evening:    { greeting: 'Boa noite', emoji: '🌙', tagline: 'Hora de fechar o dia.' },
  late_night: { greeting: 'Tá tarde', emoji: '💤', tagline: 'Descansar também é Praxis.' },
};

export function useTimeOfDay() {
  const [tod, setTod] = useState(() => getTimeOfDay());
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return { tod, ...COPY[tod] };
}
