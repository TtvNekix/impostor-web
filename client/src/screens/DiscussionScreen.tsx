import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { TimerBar } from '../components/TimerBar';
import { PlayerList } from '../components/PlayerList';
import { RoleReveal } from '../components/RoleReveal';
import { usePhaseTimer } from '../hooks/usePhaseTimer';
import { useCategoryStore } from '../stores/categoryStore';
import es from '../i18n/es';

interface DiscussionScreenProps {
  /** Total discussion duration in seconds */
  totalTime: number;
  /** Host-driven transition to VOTING */
  startVoting: () => void;
}

/**
 * Discussion screen shows:
 * - The secret word (or "Eres el impostor") via RoleReveal
 * - Category (humanized)
 * - Timer bar counting down
 * - Player list with status indicators
 * - "Iniciar votación" button (host only) to skip ahead to voting
 * - Spectator info if applicable
 */
export function DiscussionScreen({ totalTime, startVoting }: DiscussionScreenProps) {
  const players = useRoomStore((s) => s.players);
  const roomCode = useRoomStore((s) => s.roomCode);
  const isHost = useRoomStore((s) => s.isHost);

  const phase = useGameStore((s) => s.phase);
  const word = useGameStore((s) => s.word);
  const category = useGameStore((s) => s.category);
  const myRole = useGameStore((s) => s.myRole);

  const getDisplayName = useCategoryStore((s) => s.getDisplayName);

  // Local timer tick — uses phaseEndsAt to recompute remaining seconds
  const remaining = usePhaseTimer();

  // Determine if current player is a spectator
  const isSpectator = myRole === null;

  const isWordReveal = phase === 'WORD_REVEAL';
  const isDiscussion = phase === 'DISCUSSION';

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
          <span style={{ color: 'var(--text-secondary)' }}>
            {getDisplayName(category)}
          </span>
        </div>
      )}

      {/* Timer bar (only when there's a real countdown; phaseEndsAt=0 means
          no auto-end and the host advances manually) */}
      {!isWordReveal && totalTime > 0 && remaining > 0 && (
        <TimerBar total={totalTime} remaining={remaining} />
      )}

      {/* Host: start the voting phase. Now the only way to advance. */}
      {isDiscussion && isHost && !isSpectator && (
        <button
          onClick={startVoting}
          className="btn btn--primary btn--block btn--lg"
          aria-label="Iniciar votación para expulsar a un jugador"
        >
          ▶ {es.discussion.startVoting} (30s)
        </button>
      )}

      {/* Non-host: tell them to wait for the host */}
      {isDiscussion && !isHost && !isSpectator && (
        <p className="auto-transition-info">
          {es.discussion.waitingForHost}
        </p>
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
