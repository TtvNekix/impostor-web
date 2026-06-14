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
 * - Highlight the selected player
 * - Disabled for spectators
 * - Shows a "Skip" button
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
      <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
        <p>Los espectadores no pueden votar</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        alignItems: 'center',
      }}
    >
      <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
        Selecciona a quién expulsar
      </p>

      {/* Player grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '0.75rem',
          width: '100%',
          maxWidth: '500px',
        }}
      >
        {activePlayers.map((player) => {
          const isSelected = selectedId === player.id;
          return (
            <button
              key={player.id}
              onClick={() => handleSelect(player.id)}
              disabled={disabled}
              style={{
                padding: '1rem 0.5rem',
                borderRadius: '0.5rem',
                border: isSelected
                  ? '2px solid #ef4444'
                  : '2px solid #3a3a6a',
                background: isSelected ? '#3a1a1a' : '#1a1a3a',
                color: '#e0e0e0',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: isSelected ? 700 : 400,
                transition: 'all 0.2s',
                textAlign: 'center',
                fontSize: '0.9rem',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {player.username}
              {isSelected && (
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: '#ef4444',
                    marginTop: '0.25rem',
                  }}
                >
                  ✓ SELECCIONADO
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleSkip}
          disabled={disabled}
          style={{
            padding: '0.6rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid #555',
            background: '#2a2a4a',
            color: '#ccc',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Saltar voto
        </button>

        <button
          onClick={handleConfirm}
          disabled={!selectedId || disabled}
          style={{
            padding: '0.6rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: !selectedId || disabled ? '#555' : '#ef4444',
            color: '#fff',
            cursor: !selectedId || disabled ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            opacity: !selectedId || disabled ? 0.5 : 1,
          }}
        >
          Votar
        </button>
      </div>
    </div>
  );
}
