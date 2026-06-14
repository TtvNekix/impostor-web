import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import { RoleReveal } from '../components/RoleReveal';
import { PlayerList } from '../components/PlayerList';
import es from '../i18n/es';

interface EvaluationScreenProps {
  /** Called when transitioning to next round (auto or manual) */
  onNextRound?: () => void;
}

/**
 * Evaluation screen shows:
 * - Round result (who was expelled and if they were the impostor)
 * - Role reveal of the expelled player
 * - Updated player list (spectators, alive players)
 * - Auto-transition info for next round
 */
export function EvaluationScreen({ onNextRound }: EvaluationScreenProps) {
  const phase = useGameStore((s) => s.phase);
  const roundResult = useGameStore((s) => s.roundResult);
  const myRole = useGameStore((s) => s.myRole);
  const word = useGameStore((s) => s.word);
  const players = useRoomStore((s) => s.players);

  // Only render during EVALUATION phase
  if (phase !== 'EVALUATION') return null;

  const isNoOneExpelled =
    !roundResult ||
    (roundResult.expelledId === null && roundResult.winner === null);

  const expelledId = roundResult?.expelledId;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem 1rem',
        gap: '1.5rem',
      }}
    >
      {/* Title */}
      <h2
        style={{
          textAlign: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: '1.5rem',
        }}
      >
        {es.evaluation.title}
      </h2>

      {/* Expulsion result */}
      <div
        style={{
          background: '#1a1a3a',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          border: isNoOneExpelled
            ? '1px solid #555'
            : roundResult?.wasImpostor
              ? '1px solid #4ade80'
              : '1px solid #ef4444',
        }}
      >
        {isNoOneExpelled ? (
          <>
            <p style={{ color: '#facc15', fontWeight: 700, fontSize: '1.2rem' }}>
              {es.evaluation.noOneExpelled}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              {roundResult?.expelledId === null &&
              roundResult?.expelledUsername === ''
                ? es.evaluation.allSkipped
                : es.evaluation.wasATie}
            </p>
          </>
        ) : (
          <>
            <p
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: '1.3rem',
              }}
            >
              {roundResult &&
                es.evaluation.expelled.replace(
                  '{player}',
                  roundResult.expelledUsername,
                )}
            </p>
            <p
              style={{
                color: roundResult?.wasImpostor ? '#4ade80' : '#ef4444',
                fontWeight: 600,
                fontSize: '1rem',
                marginTop: '0.5rem',
              }}
            >
              {roundResult?.wasImpostor
                ? es.evaluation.expelledWasImpostor.replace(
                    '{player}',
                    roundResult.expelledUsername,
                  )
                : es.evaluation.expelledWasNotImpostor.replace(
                    '{player}',
                    roundResult.expelledUsername,
                  )}
            </p>
          </>
        )}
      </div>

      {/* Alive counts */}
      {roundResult && (
        <div
          style={{
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '0.9rem',
          }}
        >
          {es.evaluation.aliveInfo
            .replace('{impostors}', String(roundResult.aliveImpostors))
            .replace('{nonImpostors}', String(roundResult.aliveNonImpostors))}
        </div>
      )}

      {/* Your role reveal (if not yet shown) */}
      {myRole && (
        <RoleReveal role={myRole} word={word} />
      )}

      {/* Player list */}
      <div>
        <h3
          style={{
            color: '#9ca3af',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          Jugadores
        </h3>
        <PlayerList players={players} />
      </div>

      {/* Auto-transition info */}
      <p
        style={{
          textAlign: 'center',
          color: '#9ca3af',
          fontSize: '0.85rem',
        }}
      >
        {es.evaluation.autoTransition}
      </p>
    </div>
  );
}
