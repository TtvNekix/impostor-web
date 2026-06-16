import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';

/**
 * Returns the remaining seconds for the current phase, ticking locally so
 * the UI doesn't depend on a server broadcast every second. Reads the
 * authoritative `phaseEndsAt` from the store and recomputes on each tick.
 *
 * Returns 0 when the phase has no active timer (e.g. LOBBY, GAME_OVER).
 */
export function usePhaseTimer(): number {
  const phaseEndsAt = useGameStore((s) => s.phaseEndsAt);
  const phase = useGameStore((s) => s.phase);
  const setTimer = useGameStore((s) => s.setTimer);

  const [remaining, setRemaining] = useState<number>(() => {
    if (!phaseEndsAt) return 0;
    return Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!phaseEndsAt) {
      setRemaining(0);
      setTimer(0);
      return;
    }
    // Reset on phase change
    const initial = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
    setRemaining(initial);
    setTimer(initial);

    const id = setInterval(() => {
      const secs = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      setRemaining(secs);
      setTimer(secs);
    }, 250);

    return () => clearInterval(id);
  }, [phaseEndsAt, phase, setTimer]);

  return remaining;
}
