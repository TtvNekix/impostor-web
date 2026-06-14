import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { TimerBar } from '../components/TimerBar';
import { PlayerList } from '../components/PlayerList';
import { RoleReveal } from '../components/RoleReveal';
import es from '../i18n/es';

interface DiscussionScreenProps {
  /** Total discussion duration in seconds */
  totalTime: number;
}

/**
 * Discussion screen shows:
 * - The secret word (or "Eres el impostor") via RoleReveal
 * - Category
 * - Timer bar counting down
 * - Player list with status indicators
 * - Spectator info if applicable
 */
export function DiscussionScreen({ totalTime }: DiscussionScreenProps) {
  const players = useRoomStore((s) => s.players);
  const roomCode = useRoomStore((s) => s.roomCode);

  const phase = useGameStore((s) => s.phase);
  const word = useGameStore((s) => s.word);
  const category = useGameStore((s) => s.category);
  const myRole = useGameStore((s) => s.myRole);
  const timer = useGameStore((s) => s.timer);

  // Determine if current player is a spectator
  const isSpectator = myRole === null;

  const isWordReveal = phase === 'WORD_REVEAL';

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header__title">
          {isWordReveal ? 'Palabra asignada' : es.discussion.title}
        </div>
        {roomCode && (
          <div className="page-header__subtitle">Sala: {roomCode}</div>
        )}
      </div>

      {/* Role / Word reveal */}
      {myRole && (
        <RoleReveal role={myRole} word={word} animate={isWordReveal} />
      )}

      {/* Category */}
      {category && (
        <div className="card" style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
          <span style={{ color: 'var(--accent-warning)', fontWeight: 600 }}>
            {es.discussion.category}:
          </span>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>{category}</span>
        </div>
      )}

      {/* Timer bar */}
      {!isWordReveal && totalTime > 0 && (
        <TimerBar total={totalTime} remaining={timer} />
      )}

      {/* Spectator info */}
      {isSpectator && (
        <div className="spectator-info">
          <p className="spectator-info__title">{es.discussion.youAreSpectator}</p>
          <p className="spectator-info__desc">{es.discussion.waitingForVoting}</p>
        </div>
      )}

      {/* Player list */}
      <div>
        <h3 className="section-header">
          Jugadores ({players.length})
        </h3>
        <PlayerList players={players} />
      </div>
    </div>
  );
}
