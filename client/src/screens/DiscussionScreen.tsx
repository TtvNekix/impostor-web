import { useRoomStore } from '../stores/roomStore';
import { useGameStore } from '../stores/gameStore';
import { useConnectionStore } from '../stores/connectionStore';
import { TimerBar } from '../components/TimerBar';
import { PlayerList } from '../components/PlayerList';
import { RoleReveal } from '../components/RoleReveal';
import { usePhaseTimer } from '../hooks/usePhaseTimer';
import { useCategoryStore } from '../stores/categoryStore';
import { useT } from '../i18n/I18nContext';

interface DiscussionScreenProps {
  /** Total discussion duration in seconds */
  totalTime: number;
  /** Host-driven transition to VOTING */
  startVoting: () => void;
}

/**
 * Discussion screen shows:
 * - The secret word (or "You are the impostor") via RoleReveal
 * - Category (humanized)
 * - Timer bar counting down
 * - Player list with status indicators
 * - "Start voting" button (host only) to skip ahead to voting
 * - Spectator info if applicable
 */
export function DiscussionScreen({ totalTime, startVoting }: DiscussionScreenProps) {
  const t = useT();
  const players = useRoomStore((s) => s.players);
  const roomCode = useRoomStore((s) => s.roomCode);
  const isHost = useRoomStore((s) => s.isHost);

  const phase = useGameStore((s) => s.phase);
  const word = useGameStore((s) => s.word);
  const category = useGameStore((s) => s.category);
  const myRole = useGameStore((s) => s.myRole);

  const getDisplayName = useCategoryStore((s) => s.getDisplayName);
  const settings = useRoomStore((s) => s.settings);
  const lastError = useConnectionStore((s) => s.error);

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
          {isWordReveal ? t.discussion.wordReveal : t.discussion.title}
        </div>
        {roomCode && (
          <div className="page-header__subtitle">
            {t.lobby.roomCode}: {roomCode}
          </div>
        )}
      </div>

      {/* Role / Word reveal */}
      {myRole && (
        <RoleReveal role={myRole} word={word} animate={isWordReveal} />
      )}

      {/* Category — hidden in hardcore mode (no hint) */}
      {category && !settings?.hardcore && (
        <div className="card" style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
          <span style={{ color: 'var(--accent-warning)', fontWeight: 600 }}>
            {t.discussion.category}:
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

      {/* Host: start the voting phase. Now the only way to advance.
          Available in both WORD_REVEAL and DISCUSSION so the host can
          start voting as soon as the word has been seen. */}
      {(isDiscussion || phase === 'WORD_REVEAL') && isHost && !isSpectator && (
        <button
          onClick={startVoting}
          className="btn btn--primary btn--block btn--lg"
          aria-label={t.discussion.startVoting}
        >
          ▶ {t.discussion.startVoting} (30s)
        </button>
      )}

      {lastError && (
        <p className="connection-screen__error">{lastError}</p>
      )}

      {/* Non-host: tell them to wait for the host */}
      {isDiscussion && !isHost && !isSpectator && (
        <p className="auto-transition-info">
          {t.discussion.waitingForHost}
        </p>
      )}

      {/* Spectator info */}
      {isSpectator && (
        <div className="spectator-info">
          <p className="spectator-info__title">{t.discussion.youAreSpectator}</p>
          <p className="spectator-info__desc">{t.discussion.waitingForVoting}</p>
        </div>
      )}

      {/* Player list */}
      <div>
        <h3 className="section-header">
          {t.lobby.players} ({players.length})
        </h3>
        <PlayerList players={players} />
      </div>
    </div>
  );
}
