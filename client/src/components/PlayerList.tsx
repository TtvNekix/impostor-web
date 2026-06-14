import type { Player } from '@impostor/shared';

interface PlayerListProps {
  players: Player[];
  hostId?: string;
  currentPlayerId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#4ade80',
  SPECTATOR: '#9ca3af',
  DISCONNECTED: '#ef4444',
};

/**
 * Displays a list of players with:
 * - Green dot for ACTIVE
 * - Grey dot for SPECTATOR
 * - Red dot for DISCONNECTED
 * - Crown icon next to host
 * - "(Tú)" label next to current player
 */
export function PlayerList({
  players,
  hostId,
  currentPlayerId,
}: PlayerListProps) {
  if (players.length === 0) {
    return (
      <p style={{ color: '#9ca3af', textAlign: 'center', padding: '1rem' }}>
        No hay jugadores en la sala
      </p>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {players.map((player) => (
        <div
          key={player.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.6rem 1rem',
            background:
              player.id === currentPlayerId ? '#2a2a5a' : '#1a1a3a',
            borderRadius: '0.5rem',
            border:
              player.id === currentPlayerId
                ? '1px solid #4a4a8a'
                : '1px solid transparent',
          }}
        >
          {/* Status dot */}
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: STATUS_COLORS[player.status] ?? '#9ca3af',
              flexShrink: 0,
            }}
          />

          {/* Username */}
          <span style={{ flex: 1, fontWeight: 500 }}>{player.username}</span>

          {/* Host badge */}
          {(hostId ? player.id === hostId : player.isHost) && (
            <span
              style={{
                background: '#facc15',
                color: '#1a1a3a',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                borderRadius: '0.25rem',
                textTransform: 'uppercase',
              }}
            >
              Anfitrión
            </span>
          )}

          {/* Current player label */}
          {player.id === currentPlayerId && (
            <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>(Tú)</span>
          )}
        </div>
      ))}
    </div>
  );
}
