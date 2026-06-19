import { useState, useEffect } from 'react';
import type { Player } from '@impostor/shared';
import { useT } from '../i18n/I18nContext';

interface VotingTableProps {
  players: Player[];
  currentPlayerId: string;
  isSpectator: boolean;
  onVote: (targetId: string | null) => void;
  disabled?: boolean;
  /** True after this client has already cast a vote in the current round. */
  hasVoted?: boolean;
  /** When true (default), the host can force-tally even if some players haven't voted. */
  showForceEnd?: boolean;
  onForceEnd?: () => void;
  /** When true, hide the "Skip vote" option (hardcore mode). */
  hardcore?: boolean;
}

/**
 * Grid of clickable player cards for selecting a vote target.
 * - Highlight the selected player with neon danger glow
 * - Disabled for spectators
 * - Shows a "Skip" button
 * - Hover glow effect on candidate cards
 * - Locks the selection after voting (the server rejects double votes)
 * - Host gets a "Force end" button once they've voted (so they can break
 *   ties when an AFK player is blocking the tally).
 */
export function VotingTable({
  players,
  currentPlayerId,
  isSpectator,
  onVote,
  disabled = false,
  hasVoted = false,
  showForceEnd = false,
  onForceEnd,
  hardcore = false,
}: VotingTableProps) {
  const t = useT();
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
        {t.voting.disabledSpectator}
      </div>
    );
  }

  if (voted) {
    return (
      <div className="voting-table__voted-msg">
        ✓ {t.voting.voteRegistered}
        {showForceEnd && onForceEnd && (
          <button
            type="button"
            className="btn btn--ghost btn--sm voting-table__force-end"
            onClick={onForceEnd}
          >
            {t.voting.forceEnd}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="voting-table">
      <p className="voting-table__label">
        {t.voting.selectTarget}
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
                <div className="voting-table__me-label">({t.lobby.you})</div>
              )}
              {isSelected && (
                <div className="voting-table__selected-label">
                  ✓ {t.voting.selected}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="voting-table__actions">
        {!hardcore && (
          <button
            onClick={handleSkip}
            disabled={locked}
            className="btn btn--ghost"
          >
            {t.voting.skip}
          </button>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selectedId || locked}
          className="btn btn--danger"
        >
          {t.voting.castVote}
        </button>
      </div>
    </div>
  );
}
