import { useConnectionStore } from './stores/connectionStore';
import { useRoomStore } from './stores/roomStore';
import { useGameStore } from './stores/gameStore';
import { useSocket } from './hooks/useSocket';
import { LobbyScreen } from './screens/LobbyScreen';
import { DiscussionScreen } from './screens/DiscussionScreen';
import { VotingScreen } from './screens/VotingScreen';
import { EvaluationScreen } from './screens/EvaluationScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import es from './i18n/es';

type GamePhase = import('@impostor/shared').GamePhase;

const PHASE_ORDER: GamePhase[] = [
  'LOBBY',
  'WORD_REVEAL',
  'DISCUSSION',
  'VOTING',
  'EVALUATION',
  'GAME_OVER',
];

/**
 * Determines if a phase is in-game (not LOBBY or GAME_OVER).
 */
function isInGame(phase: GamePhase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('WORD_REVEAL')
    && phase !== 'GAME_OVER';
}

/**
 * Root application component.
 *
 * - ConnectionGuard: shows loading/disconnected states
 * - Phase-based screen router
 * - In-game header with room code + cyberpunk theme
 */
export default function App() {
  const socketStatus = useConnectionStore((s) => s.socketStatus);
  const connectionError = useConnectionStore((s) => s.error);

  const roomCode = useRoomStore((s) => s.roomCode);
  const phase = useGameStore((s) => s.phase);

  const {
    createRoom,
    joinRoom,
    startMatch,
    startVoting,
    vote,
    updateSettings,
    newMatch,
    leaveRoom,
  } = useSocket();

  /* ---------------------------------------------------------------- */
  /*  ConnectionGuard                                                   */
  /* ---------------------------------------------------------------- */

  if (socketStatus === 'connecting') {
    return (
      <div className="connection-screen">
        <div className="spinner" />
        <p className="connection-screen__text">{es.connection.connecting}</p>
      </div>
    );
  }

  if (socketStatus === 'disconnected' && !roomCode) {
    return (
      <div className="connection-screen">
        <h1 className="connection-screen__title">
          {es.common.appName}
        </h1>
        {connectionError && (
          <p className="connection-screen__error">
            {connectionError}
          </p>
        )}
        <p className="connection-screen__text">
          {es.connection.connectionLost}
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  In-game header                                                    */
  /* ---------------------------------------------------------------- */

  const showHeader = roomCode && isInGame(phase);

  return (
    <div className="app-container">
      {/* In-game header with room code + leave button */}
      {showHeader && (
        <header className="game-header">
          <span className="game-header__label">Sala:</span>
          <span className="game-header__code">{roomCode}</span>
          <button
            type="button"
            className="game-header__leave"
            onClick={leaveRoom}
            aria-label="Salir de la partida"
            title="Salir de la partida"
          >
            ✕
          </button>
        </header>
      )}

      {/* Phase-based screen router */}
      <ScreenRouter
        phase={phase}
        createRoom={createRoom}
        joinRoom={joinRoom}
        startMatch={startMatch}
        startVoting={startVoting}
        vote={vote}
        updateSettings={updateSettings}
        newMatch={newMatch}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen Router                                                       */
/* ------------------------------------------------------------------ */

interface ScreenRouterProps {
  phase: GamePhase;
  createRoom: (payload: { code: string; username: string }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  startVoting: () => void;
  vote: (payload: { targetId: string | null }) => void;
  updateSettings: (payload: {
    impostorCount?: number;
    discussionTime?: number;
    category?: string | null;
  }) => void;
  newMatch: () => void;
}

function ScreenRouter({
  phase,
  createRoom,
  joinRoom,
  startMatch,
  startVoting,
  vote,
  updateSettings: updateSettingsAction,
  newMatch,
}: ScreenRouterProps) {
  switch (phase) {
    case 'LOBBY':
      return (
        <LobbyScreen
          createRoom={createRoom}
          joinRoom={joinRoom}
          startMatch={startMatch}
          updateSettings={updateSettingsAction}
        />
      );

    case 'WORD_REVEAL':
    case 'DISCUSSION':
      return <DiscussionScreen totalTime={90} startVoting={startVoting} />;

    case 'VOTING':
      return <VotingScreen vote={vote} />;

    case 'EVALUATION':
      return <EvaluationScreen />;

    case 'GAME_OVER':
      return <GameOverScreen newMatch={newMatch} />;

    default:
      return (
        <div className="connection-screen">
          <p className="connection-screen__text">{es.common.loading}</p>
        </div>
      );
  }
}
