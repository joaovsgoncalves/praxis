import { useEffect } from 'react';
import { usePraxisLevelUpListener } from '@/lib/praxisLevelUp';

/** Escuta forja-level-up globalmente (toast diz Praxis). */
export default function PraxisLevelUpListener() {
  usePraxisLevelUpListener();
  return null;
}