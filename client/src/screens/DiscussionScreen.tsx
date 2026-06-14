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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
        gap: '1.5rem',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontWeight: 700 }}>
          {isWordReveal ? 'Palabra asignada' : es.discussion.title}
        </h2>
        {roomCode && (
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Sala: {roomCode}
          </p>
        )}
      </div>

      {/* Role / Word reveal */}
      {myRole && (
        <RoleReveal role={myRole} word={word} animate={isWordReveal} />
      )}

      {/* Category */}
      {category && (
        <div
          style={{
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ color: '#facc15', fontWeight: 600 }}>
            {es.discussion.category}:
          </span>{' '}
          {category}
        </div>
      )}

      {/* Timer bar */}
      {!isWordReveal && totalTime > 0 && (
        <TimerBar total={totalTime} remaining={timer} />
      )}

      {/* Spectator info */}
      {isSpectator && (
        <div
          style={{
            background: '#2a2a4a',
            borderRadius: '0.5rem',
            padding: '1rem',
            textAlign: 'center',
            border: '1px solid #555',
          }}
        >
          <p style={{ color: '#facc15', fontWeight: 600 }}>
            {es.discussion.youAreSpectator}
          </p>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {es.discussion.waitingForVoting}
          </p>
        </div>
      )}

      {/* Player list */}
      <div>
        <h3
          style={{
            color: '#9ca3af',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          Jugadores ({players.length})
        </h3>
        <PlayerList players={players} />
      </div>
    </div>
  );
}
