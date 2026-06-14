import { useEffect, useState, useRef } from 'react';

interface TimerBarProps {
  /** Total duration in seconds */
  total: number;
  /** Remaining time in seconds */
  remaining: number;
  /** Called when timer hits 0 */
  onExpire?: () => void;
}

/**
 * Visual countdown bar that shrinks from 100% to 0% width.
 * Shows "MM:SS" remaining text centered on the bar.
 * Changes color from green → yellow → red as time runs out.
 * Cyberpunk theme with pulsing glow when low.
 */
export function TimerBar({ total, remaining, onExpire }: TimerBarProps) {
  const [displayTime, setDisplayTime] = useState(remaining);
  const hasExpired = useRef(false);

  useEffect(() => {
    setDisplayTime(remaining);
  }, [remaining]);

  useEffect(() => {
    if (remaining <= 0 && !hasExpired.current) {
      hasExpired.current = true;
      onExpire?.();
    }
    if (remaining > 0) {
      hasExpired.current = false;
    }
  }, [remaining, onExpire]);

  const pct = total > 0 ? Math.max(0, (remaining / total) * 100) : 0;

  const fillClass =
    pct > 50
      ? 'timer-bar__fill--safe'
      : pct > 25
        ? 'timer-bar__fill--warning'
        : 'timer-bar__fill--danger';

  const formatTime = (s: number): string => {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.floor(Math.max(0, s) % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="timer-bar">
      <div
        className={`timer-bar__fill ${fillClass}`}
        style={{ width: `${pct}%` }}
      >
        <span className="timer-bar__text">{formatTime(displayTime)}</span>
      </div>
    </div>
  );
}
