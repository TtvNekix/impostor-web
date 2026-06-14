import { useState } from 'react';
import type { Player } from '@impostor/shared';

interface VotingTableProps {
  players: Player[];
  currentPlayerId: string;
  isSpectator: boolean;
  onVote: (targetId: string | null) => void;
  disabled?: boolean;
}

/**
 * Grid of clickable player cards for selecting a vote target.
 * - Highlight the selected player with neon danger glow
 * - Disabled for spectators
 * - Shows a "Skip" button
 * - Hover glow effect on candidate cards
 */
export function VotingTable({
  players,
  currentPlayerId,
  isSpectator,
  onVote,
  disabled = false,
}: VotingTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activePlayers = players.filter(
    (p) => p.status === 'ACTIVE' && p.id !== currentPlayerId,
  );

  const handleSelect = (id: string) => {
    if (isSpectator || disabled) return;
    setSelectedId(id === selectedId ? null : id);
  };

  const handleConfirm = () => {
    if (selectedId && !isSpectator && !disabled) {
      onVote(selectedId);
    }
  };

  const handleSkip = () => {
    if (!isSpectator && !disabled) {
      onVote(null);
    }
  };

  if (isSpectator) {
    return (
      <div className="voting-table__spectator-msg">
        Los espectadores no pueden votar
      </div>
    );
  }

  return (
    <div className="voting-table">
      <p className="voting-table__label">
        Selecciona a quién expulsar
      </p>

      {/* Player grid */}
      <div className="voting-table__grid">
        {activePlayers.map((player) => {
          const isSelected = selectedId === player.id;
          return (
            <button
              key={player.id}
              onClick={() => handleSelect(player.id)}
              disabled={disabled}
              className={`voting-table__player-btn${isSelected ? ' voting-table__player-btn--selected' : ''}`}
            >
              {player.username}
              {isSelected && (
                <div className="voting-table__selected-label">
                  ✓ SELECCIONADO
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="voting-table__actions">
        <button
          onClick={handleSkip}
          disabled={disabled}
          className="btn btn--ghost"
        >
          Saltar voto
        </button>

        <button
          onClick={handleConfirm}
          disabled={!selectedId || disabled}
          className="btn btn--danger"
        >
          Votar
        </button>
      </div>
    </div>
  );
}
