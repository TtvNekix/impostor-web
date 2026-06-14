import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import es from '../i18n/es';

interface GameOverScreenProps {
  newMatch: () => void;
}

/**
 * Game Over screen shows:
 * - Winner announcement banner
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

  // Find the impostor player(s)
  const impostors = players.filter(
    (p) => p.status === 'ACTIVE' || p.status === 'SPECTATOR',
  );
  // Note: in GAME_OVER, the actual impostor identities are known from game state.
  // We show a generic message since the server doesn't send impostor identities
  // via game_over — the RoundResult already revealed who was impostor when expelled.

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
        gap: '2rem',
      }}
    >
      {/* Winner banner */}
      <div
        style={{
          width: '100%',
          padding: '2rem 1rem',
          borderRadius: '1rem',
          textAlign: 'center',
          background: nonImpostorsWin
            ? 'linear-gradient(135deg, #1a4a1a, #1d7f1d)'
            : 'linear-gradient(135deg, #4a1a1a, #7f1d1d)',
          border: nonImpostorsWin
            ? '2px solid #4ade80'
            : '2px solid #ef4444',
          boxShadow: nonImpostorsWin
            ? '0 0 40px rgba(74, 222, 128, 0.3)'
            : '0 0 40px rgba(239, 68, 68, 0.3)',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 800,
            color: '#fff',
            marginBottom: '0.5rem',
          }}
        >
          {es.gameOver.title}
        </h1>
        <p
          style={{
            fontSize: '1.3rem',
            fontWeight: 700,
            color: nonImpostorsWin ? '#86efac' : '#fca5a5',
          }}
        >
          {nonImpostorsWin
            ? es.gameOver.nonImpostorsWin
            : es.gameOver.impostorsWin}
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          width: '100%',
          background: '#1a1a3a',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#9ca3af',
          }}
        >
          <span>{es.gameOver.roundsPlayed}</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>
            {roundNumber}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#9ca3af',
          }}
        >
          <span>{es.gameOver.impostorWas}</span>
          <span style={{ fontWeight: 700, color: '#fff' }}>
            {myRole === 'impostor' ? 'Tú' : 'Otro jugador'}
          </span>
        </div>
      </div>

      {/* Play again button (host only) */}
      {isHost ? (
        <button
          onClick={newMatch}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: 'linear-gradient(135deg, #4a4a8a, #6366f1)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1.1rem',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
        >
          {es.gameOver.playAgain}
        </button>
      ) : (
        <p style={{ color: '#9ca3af', textAlign: 'center', fontSize: '0.9rem' }}>
          {es.gameOver.hostOnly}
        </p>
      )}
    </div>
  );
}
