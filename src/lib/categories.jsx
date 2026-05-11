export const CATEGORIES = {
  farmacia: { emoji: '💼', label: 'Trabalho', color: 'bg-green-500/20 text-green-400' },
  treino: { emoji: '💪', label: 'Treino', color: 'bg-red-500/20 text-red-400' },
  estudo: { emoji: '📚', label: 'Estudo', color: 'bg-purple-500/20 text-purple-400' },
  jotav_fit: { emoji: '📸', label: '@jotav.fit', color: 'bg-pink-500/20 text-pink-400' },
  pessoal: { emoji: '🏠', label: 'Pessoal', color: 'bg-yellow-500/20 text-yellow-400' },
  rotina: { emoji: '🔥', label: 'Rotina', color: 'bg-orange-500/20 text-orange-400' }
};

export const CategoryBadge = ({ category, className = '' }) => {
  const cat = CATEGORIES[category];
  if (!cat) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cat.color} ${className}`}>
      {cat.emoji} {cat.label}
    </span>
  );
};
