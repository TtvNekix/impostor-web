import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import { RoleReveal } from '../components/RoleReveal';
import { PlayerList } from '../components/PlayerList';
import { useT } from '../i18n/I18nContext';

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
  const t = useT();
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

  // Determine result card style
  let resultCardClass = 'result-card--no-expulsion';
  if (!isNoOneExpelled) {
    resultCardClass = roundResult?.wasImpostor
      ? 'result-card--impostor-found'
      : 'result-card--innocent-expelled';
  }

  return (
    <div className="page">
      {/* Title */}
      <div className="page-header">
        <div className="page-header__title">{t.evaluation.title}</div>
      </div>

      {/* Expulsion result */}
      <div className={`result-card ${resultCardClass}`}>
        {isNoOneExpelled ? (
          <>
            <p className="result-card__title result-card__title--warning">
              {t.evaluation.noOneExpelled}
            </p>
            <p className="result-card__info result-card__info--spaced">
              {roundResult?.expelledId === null &&
              roundResult?.expelledUsername === ''
                ? t.evaluation.allSkipped
                : t.evaluation.wasATie}
            </p>
          </>
        ) : (
          <>
            <p className="result-card__title">
              {roundResult &&
                t.evaluation.expelled.replace(
                  '{player}',
                  roundResult.expelledUsername,
                )}
            </p>
            <p
              className={`result-card__sub ${
                roundResult?.wasImpostor
                  ? 'result-card__sub--success'
                  : 'result-card__sub--danger'
              }`}
            >
              {roundResult?.wasImpostor
                ? t.evaluation.expelledWasImpostor.replace(
                    '{player}',
                    roundResult.expelledUsername,
                  )
                : t.evaluation.expelledWasNotImpostor.replace(
                    '{player}',
                    roundResult.expelledUsername,
                  )}
            </p>
          </>
        )}
      </div>

      {/* Alive counts */}
      {roundResult && (
        <div className="result-card__info result-card__info--centered">
          {t.evaluation.aliveInfo
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
        <h3 className="section-header">{t.lobby.players}</h3>
        <PlayerList players={players} />
      </div>

      {/* Auto-transition info */}
      <p className="auto-transition-info">{t.evaluation.autoTransition}</p>
    </div>
  );
}
