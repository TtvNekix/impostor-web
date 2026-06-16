import { useEffect, useState } from 'react';

interface TimerBarProps {
  /** Total duration in seconds */
  total: number;
  /** Remaining time in seconds */
  remaining: number;
  /** Called when timer hits 0 */
  onExpire?: () => void;
}

/**
 * Visual countdown bar. The fill is a background that shrinks from 100% to
 * 0% width while the "MM:SS" text is layered ABOVE the fill on top of the
 * full-width bar. This keeps the label readable and centered even when the
 * fill is very narrow (otherwise the text would overflow the fill's box and
 * get clipped by the parent overflow:hidden).
 */
export function TimerBar({ total, remaining, onExpire }: TimerBarProps) {
  const [displayTime, setDisplayTime] = useState(remaining);

  useEffect(() => {
    setDisplayTime(remaining);
  }, [remaining]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
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
      />
      <span className="timer-bar__text">{formatTime(displayTime)}</span>
    </div>
  );
}
