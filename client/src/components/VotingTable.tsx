import { useState, useEffect } from 'react';
import type { Player } from '@impostor/shared';

interface VotingTableProps {
  players: Player[];
  currentPlayerId: string;
  isSpectator: boolean;
  onVote: (targetId: string | null) => void;
  disabled?: boolean;
  /** True after this client has already cast a vote in the current round. */
  hasVoted?: boolean;
}

/**
 * Grid of clickable player cards for selecting a vote target.
 * - Highlight the selected player with neon danger glow
 * - Disabled for spectators
 * - Shows a "Skip" button
 * - Hover glow effect on candidate cards
 * - Locks the selection after voting (the server rejects double votes)
 */
export function VotingTable({
  players,
  currentPlayerId,
  isSpectator,
  onVote,
  disabled = false,
  hasVoted = false,
}: VotingTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voted, setVoted] = useState(hasVoted);

  useEffect(() => {
    setVoted(hasVoted);
  }, [hasVoted]);

  const activePlayers = players.filter((p) => p.status === 'ACTIVE');

  const locked = disabled || voted;

  const handleSelect = (id: string) => {
    if (isSpectator || locked) return;
    setSelectedId(id === selectedId ? null : id);
  };

  const handleConfirm = () => {
    if (selectedId && !isSpectator && !locked) {
      onVote(selectedId);
      setVoted(true);
    }
  };

  const handleSkip = () => {
    if (!isSpectator && !locked) {
      onVote(null);
      setVoted(true);
    }
  };

  if (isSpectator) {
    return (
      <div className="voting-table__spectator-msg">
        Los espectadores no pueden votar
      </div>
    );
  }

  if (voted) {
    return (
      <div className="voting-table__voted-msg">
        ✓ Voto registrado
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
          const isMe = player.id === currentPlayerId;
          return (
            <button
              key={player.id}
              onClick={() => handleSelect(player.id)}
              disabled={locked}
              className={
                `voting-table__player-btn${isSelected ? ' voting-table__player-btn--selected' : ''}` +
                `${isMe ? ' voting-table__player-btn--me' : ''}`
              }
            >
              {player.username}
              {isMe && !isSelected && (
                <div className="voting-table__me-label">(Tú)</div>
              )}
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
          disabled={locked}
          className="btn btn--ghost"
        >
          Saltar voto
        </button>

        <button
          onClick={handleConfirm}
          disabled={!selectedId || locked}
          className="btn btn--danger"
        >
          Votar
        </button>
      </div>
    </div>
  );
}
