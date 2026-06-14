import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import es from '../i18n/es';

interface GameOverScreenProps {
  newMatch: () => void;
}

/**
 * Game Over screen shows:
 * - Winner announcement banner with neon glow
 * - Stats (rounds played, who the impostor was)
 * - "Jugar de nuevo" button for host
 * - Back to lobby info
 */
export function GameOverScreen({ newMatch }: GameOverScreenProps) {
  const phase = useGameStore((s) => s.phase);
  const winner = useGameStore((s) => s.winner);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const myRole = useGameStore((s) => s.myRole);
  const isHost = useRoomStore((s) => s.isHost);
  const players = useRoomStore((s) => s.players);

  // Only render during GAME_OVER phase
  if (phase !== 'GAME_OVER') return null;

  const nonImpostorsWin = winner === 'NON_IMPOSTORS';

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
        <h1 className="winner-banner__title">{es.gameOver.title}</h1>
        <p
          className={`winner-banner__winner ${
            nonImpostorsWin
              ? 'winner-banner__winner--non-impostors'
              : 'winner-banner__winner--impostors'
          }`}
        >
          {nonImpostorsWin
            ? es.gameOver.nonImpostorsWin
            : es.gameOver.impostorsWin}
        </p>
      </div>

      {/* Stats */}
      <div className="stats-card">
        <div className="stats-card__row">
          <span className="stats-card__label">{es.gameOver.roundsPlayed}</span>
          <span className="stats-card__value">{roundNumber}</span>
        </div>

        <div className="stats-card__row">
          <span className="stats-card__label">{es.gameOver.impostorWas}</span>
          <span className="stats-card__value">
            {myRole === 'impostor' ? 'Tú' : 'Otro jugador'}
          </span>
        </div>
      </div>

      {/* Play again button (host only) */}
      {isHost ? (
        <button
          onClick={newMatch}
          className="btn btn--primary btn--lg btn--block"
        >
          {es.gameOver.playAgain}
        </button>
      ) : (
        <p className="auto-transition-info">{es.gameOver.hostOnly}</p>
      )}
    </div>
  );
}
