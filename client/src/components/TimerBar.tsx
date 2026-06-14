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

  const barColor =
    pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444';

  const formatTime = (s: number): string => {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.floor(Math.max(0, s) % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        width: '100%',
        height: '2.5rem',
        background: '#1e1e3a',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: barColor,
          transition: 'width 1s linear, background 0.3s ease',
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1rem',
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}
        >
          {formatTime(displayTime)}
        </span>
      </div>
    </div>
  );
}
