import type { Player } from '@impostor/shared';

interface PlayerListProps {
  players: Player[];
  hostId?: string;
  currentPlayerId?: string;
}

const STATUS_DOT_CLASS: Record<string, string> = {
  ACTIVE: 'player-list__status-dot--active',
  SPECTATOR: 'player-list__status-dot--spectator',
  DISCONNECTED: 'player-list__status-dot--disconnected',
};

/**
 * Displays a list of players with:
 * - Green dot for ACTIVE
 * - Grey dot for SPECTATOR
 * - Red dot for DISCONNECTED
 * - Host badge
 * - "(Tú)" label next to current player
 * - Staggered entrance animation
 */
export function PlayerList({
  players,
  hostId,
  currentPlayerId,
}: PlayerListProps) {
  if (players.length === 0) {
    return (
      <p className="player-list__empty">
        No hay jugadores en la sala
      </p>
    );
  }

  return (
    <div className="player-list">
      {players.map((player) => {
        const isCurrent = player.id === currentPlayerId;
        return (
          <div
            key={player.id}
            className={`player-list__item${isCurrent ? ' player-list__item--current' : ''}`}
          >
            {/* Status dot */}
            <span
              className={`player-list__status-dot ${STATUS_DOT_CLASS[player.status] ?? 'player-list__status-dot--spectator'}`}
            />

            {/* Username */}
            <span className="player-list__name">{player.username}</span>

            {/* Host badge */}
            {(hostId ? player.id === hostId : player.isHost) && (
              <span className="player-list__badge player-list__badge--host">
                Anfitrión
              </span>
            )}

            {/* Current player label */}
            {isCurrent && (
              <span className="player-list__badge--you">(Tú)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
