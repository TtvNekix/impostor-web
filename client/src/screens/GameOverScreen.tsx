import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import { useT } from '../i18n/I18nContext';

interface GameOverScreenProps {
  newMatch: () => void;
}

/**
 * Game Over screen shows:
 * - Winner announcement banner with neon glow
 * - Stats (rounds played, who the impostor was, the user's per-match stats)
 * - "Jugar de nuevo" button for host
 * - Back to lobby info
 */
export function GameOverScreen({ newMatch }: GameOverScreenProps) {
  const t = useT();
  const phase = useGameStore((s) => s.phase);
  const winner = useGameStore((s) => s.winner);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const impostorIds = useGameStore((s) => s.impostorIds);
  const myStats = useGameStore((s) => s.myStats);
  const isHost = useRoomStore((s) => s.isHost);
  const players = useRoomStore((s) => s.players);

  // Only render during GAME_OVER phase
  if (phase !== 'GAME_OVER') return null;

  const nonImpostorsWin = winner === 'NON_IMPOSTORS';

  // Resolve impostor usernames from the room's player list. We map IDs
  // → username so the label says "El impostor era Alice" (or "Alice, Bob"
  // when there are two) instead of the old vague "Tú" / "Otro jugador".
  const impostorNames = impostorIds
    .map((id) => players.find((p) => p.id === id)?.username)
    .filter((name): name is string => Boolean(name));
  const impostorLabel =
    impostorNames.length === 0
      ? '—'
      : impostorNames.join(', ');

  return (
    <div className="page page--centered">
      {/* Winner banner */}
      <div
        className={`winner-banner ${
          nonImpostorsWin
            ? 'winner-banner--non-impostors'
            : 'winner-banner--impostors'
        }`}
      >
        <h1 className="winner-banner__title">{t.gameOver.title}</h1>
        <p
          className={`winner-banner__winner ${
            nonImpostorsWin
              ? 'winner-banner__winner--non-impostors'
              : 'winner-banner__winner--impostors'
          }`}
        >
          {nonImpostorsWin
            ? t.gameOver.nonImpostorsWin
            : t.gameOver.impostorsWin}
        </p>
      </div>

      {/* Stats */}
      <div className="stats-card">
        <div className="stats-card__row">
          <span className="stats-card__label">{t.gameOver.roundsPlayed}</span>
          <span className="stats-card__value">{roundNumber}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{t.gameOver.impostorWas}</span>
          <span className="stats-card__value">{impostorLabel}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{t.stats.impostorsFound}</span>
          <span className="stats-card__value">{myStats.impostorsFound}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{t.stats.timesAsImpostor}</span>
          <span className="stats-card__value">{myStats.timesAsImpostor}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{t.stats.timesCaught}</span>
          <span className="stats-card__value">{myStats.timesCaught}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{t.stats.timesSurvived}</span>
          <span className="stats-card__value">{myStats.timesSurvivedAsImpostor}</span>
        </div>
      </div>

      {/* Play again button (host only) */}
      {isHost ? (
        <button
          onClick={newMatch}
          className="btn btn--primary btn--lg btn--block"
        >
          {t.gameOver.playAgain}
        </button>
      ) : (
        <p className="auto-transition-info">{t.gameOver.hostOnly}</p>
      )}
    </div>
  );
}
