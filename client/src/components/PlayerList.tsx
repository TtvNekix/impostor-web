import type { Player } from '@impostor/shared';
import { useT } from '../i18n/I18nContext';

interface PlayerListProps {
  players: Player[];
  hostId?: string;
  currentPlayerId?: string;
  /** Show a kick button for each non-host, non-self player. */
  canKick?: boolean;
  onKick?: (username: string) => void;
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
 * - "(You)" label next to current player
 * - Staggered entrance animation
 * - Optional kick button (host only) per non-host player
 */
export function PlayerList({
  players,
  hostId,
  currentPlayerId,
  canKick = false,
  onKick,
}: PlayerListProps) {
  const t = useT();

  if (players.length === 0) {
    return (
      <p className="player-list__empty">
        {t.lobby.players === 'Jugadores' ? 'No hay jugadores en la sala' : t.lobby.players}
      </p>
    );
  }

  return (
    <div className="player-list">
      {players.map((player) => {
        const isCurrent = player.id === currentPlayerId;
        const isHostPlayer = hostId ? player.id === hostId : player.isHost;
        const showKick = canKick && !isHostPlayer && !isCurrent && onKick;
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
            {isHostPlayer && (
              <span className="player-list__badge player-list__badge--host">
                {t.lobby.host}
              </span>
            )}

            {/* Current player label */}
            {isCurrent && (
              <span className="player-list__badge player-list__badge--you">
                ({t.lobby.you})
              </span>
            )}

            {/* Kick button (host only, for non-host non-self players) */}
            {showKick && (
              <button
                type="button"
                className="player-list__kick"
                onClick={() => onKick(player.username)}
                aria-label={`${t.confirm.kick} ${player.username}`}
                title={t.confirm.kick}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
