import { useConnectionStore } from './stores/connectionStore';
import { useRoomStore } from './stores/roomStore';
import { useGameStore } from './stores/gameStore';
import { useSocket } from './hooks/useSocket';
import { LobbyScreen } from './screens/LobbyScreen';
import { DiscussionScreen } from './screens/DiscussionScreen';
import { VotingScreen } from './screens/VotingScreen';
import { EvaluationScreen } from './screens/EvaluationScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { EntryPage } from './screens/EntryPage';
import { PoweredByFooter } from './components/PoweredByFooter';
import { useT } from './i18n/I18nContext';

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
  const t = useT();
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
    addCategory,
    addWords,
    newMatch,
    leaveRoom,
    myId,
  } = useSocket();

  /* ---------------------------------------------------------------- */
  /*  ConnectionGuard                                                   */
  /* ---------------------------------------------------------------- */

  if (socketStatus === 'connecting') {
    return (
      <div className="connection-screen">
        <img
          src="/logo-256x256.png"
          alt={t.common.appName}
          className="connection-screen__logo"
        />
        <div className="spinner" />
        <p className="connection-screen__text">{t.connection.connecting}</p>
      </div>
    );
  }

  if (socketStatus === 'disconnected' && !roomCode) {
    return (
      <div className="connection-screen">
        <img
          src="/logo-256x256.png"
          alt={t.common.appName}
          className="connection-screen__logo"
        />
        <h1 className="connection-screen__title">
          {t.common.appName}
        </h1>
        {connectionError && (
          <p className="connection-screen__error">
            {connectionError}
          </p>
        )}
        <p className="connection-screen__text">
          {t.connection.connectionLost}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => window.location.reload()}
        >
          {t.common.retry}
        </button>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  In-game header                                                    */
  /* ---------------------------------------------------------------- */

  const showHeader = roomCode && isInGame(phase);

  return (
    <div className="app-container">
      {/* In-game header with logo + room code + leave button */}
      {showHeader && (
        <header className="game-header">
          <img
            src="/logo-256x256.png"
            alt={t.common.appName}
            className="game-header__logo"
          />
          <span className="game-header__label">{t.lobby.roomCode}:</span>
          <span className="game-header__code">{roomCode}</span>
          <button
            type="button"
            className="game-header__leave"
            onClick={() => {
              // Best-effort: tell the server to remove us, then hard
              // navigate to the main page. The hard navigation closes
              // the WebSocket and reloads the UI, which is the most
              // reliable way to land the user back on the form.
              try { leaveRoom(); } catch { /* ignore */ }
              window.location.href = '/';
            }}
            aria-label={t.common.leaveRoom}
            title={t.common.leaveRoom}
          >
            ✕
          </button>
        </header>
      )}

      {/* Phase-based screen router */}
      <ScreenRouter
        phase={phase}
        roomCode={roomCode}
        createRoom={createRoom}
        joinRoom={joinRoom}
        startMatch={startMatch}
        startVoting={startVoting}
        vote={vote}
        updateSettings={updateSettings}
        addCategory={addCategory}
        addWords={addWords}
        myId={myId}
        newMatch={newMatch}
      />

      {/* Global "powered by coffeeprojects" footer — fixed at the bottom,
          shows on every page. */}
      <PoweredByFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen Router                                                       */
/* ------------------------------------------------------------------ */

interface ScreenRouterProps {
  phase: GamePhase;
  roomCode: string | null;
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
  addCategory: (payload: { name: string; displayName?: string; words: string }) => void;
  addWords: (payload: { category: string; words: string }) => void;
  newMatch: () => void;
  myId: string | null;
}

function ScreenRouter({
  phase,
  roomCode,
  createRoom,
  joinRoom,
  startMatch,
  startVoting,
  vote,
  updateSettings: updateSettingsAction,
  addCategory: addCategoryAction,
  addWords: addWordsAction,
  newMatch,
  myId,
}: ScreenRouterProps) {
  const t = useT();

  // No room yet → show the entry page (game mode selector + create/join).
  if (!roomCode) {
    return <EntryPage createRoom={createRoom} joinRoom={joinRoom} />;
  }

  switch (phase) {
    case 'LOBBY':
      return (
        <LobbyScreen
          createRoom={createRoom}
          joinRoom={joinRoom}
          startMatch={startMatch}
          updateSettings={updateSettingsAction}
          addCategory={addCategoryAction}
          addWords={addWordsAction}
        />
      );

    case 'WORD_REVEAL':
    case 'DISCUSSION':
      return <DiscussionScreen totalTime={90} startVoting={startVoting} />;

    case 'VOTING':
      return <VotingScreen vote={vote} myId={myId ?? ''} />;

    case 'EVALUATION':
      return <EvaluationScreen />;

    case 'GAME_OVER':
      return <GameOverScreen newMatch={newMatch} />;

    default:
      return (
        <div className="connection-screen">
          <p className="connection-screen__text">{t.common.loading}</p>
        </div>
      );
  }
}
