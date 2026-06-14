import { useConnectionStore } from './stores/connectionStore';
import { useRoomStore } from './stores/roomStore';
import { useGameStore } from './stores/gameStore';
import { useSocket } from './hooks/useSocket';
import { LobbyScreen } from './screens/LobbyScreen';
import { DiscussionScreen } from './screens/DiscussionScreen';
import { VotingScreen } from './screens/VotingScreen';
import { EvaluationScreen } from './screens/EvaluationScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { TimerBar } from './components/TimerBar';
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
 * - In-game header with room code
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
    vote,
    updateSettings,
    newMatch,
  } = useSocket();

  /* ---------------------------------------------------------------- */
  /*  ConnectionGuard                                                   */
  /* ---------------------------------------------------------------- */

  if (socketStatus === 'connecting') {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '3px solid #3a3a6a',
            borderTopColor: '#6366f1',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p style={{ color: '#9ca3af' }}>{es.connection.connecting}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (socketStatus === 'disconnected' && !roomCode) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: '#fff',
          }}
        >
          {es.common.appName}
        </h1>
        {connectionError && (
          <p style={{ color: '#ef4444', textAlign: 'center' }}>
            {connectionError}
          </p>
        )}
        <p style={{ color: '#9ca3af', textAlign: 'center' }}>
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
    <div style={{ minHeight: '100vh', background: '#0f0f23' }}>
      {/* In-game header with room code */}
      {showHeader && (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: '#1a1a3a',
            borderBottom: '1px solid #3a3a6a',
          }}
        >
          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
            Sala:
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#facc15',
              letterSpacing: '0.15em',
            }}
          >
            {roomCode}
          </span>
        </header>
      )}

      {/* Phase-based screen router */}
      <ScreenRouter
        phase={phase}
        createRoom={createRoom}
        joinRoom={joinRoom}
        startMatch={startMatch}
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
  vote: (payload: { targetId: string | null }) => void;
  updateSettings: (payload: { impostorCount?: number; discussionTime?: number }) => void;
  newMatch: () => void;
}

function ScreenRouter({
  phase,
  createRoom,
  joinRoom,
  startMatch,
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
      // Both WORD_REVEAL and DISCUSSION show the discussion screen
      return <DiscussionScreen totalTime={90} />;

    case 'VOTING':
      return <VotingScreen vote={vote} />;

    case 'EVALUATION':
      return <EvaluationScreen />;

    case 'GAME_OVER':
      return <GameOverScreen newMatch={newMatch} />;

    default:
      return (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          {es.common.loading}
        </div>
      );
  }
}
