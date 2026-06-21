import { useState } from 'react';
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
import { LobbiesPage } from './screens/LobbiesPage';
import { JoinPage } from './screens/JoinPage';
import { PoweredByFooter } from './components/PoweredByFooter';
import { ConfirmationModal } from './components/ConfirmationModal';
import { useT } from './i18n/I18nContext';
import { parseJoinCode, useLocation } from './lib/router';

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
  const isHost = useRoomStore((s) => s.isHost);
  const settings = useRoomStore((s) => s.settings);

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
    kickPlayer,
    myId,
    forceEndVoting,
  } = useSocket();

  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const handleLeaveConfirmed = () => {
    setConfirmLeaveOpen(false);
    try { leaveRoom(); } catch { /* ignore */ }
    window.location.href = '/';
  };

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
            onClick={() => setConfirmLeaveOpen(true)}
            aria-label={t.common.leaveRoom}
            title={t.common.leaveRoom}
          >
            ✕
          </button>
        </header>
      )}

      {/* Leave-room confirmation modal. Opens when the user clicks the
          header X — confirming navigates them to the entry page. */}
      <ConfirmationModal
        open={confirmLeaveOpen}
        title={t.confirm.leaveRoomTitle}
        message={isHost ? t.confirm.leaveRoomHostMessage : t.confirm.leaveRoomMessage}
        confirmLabel={t.confirm.leave}
        cancelLabel={t.common.cancel}
        variant="danger"
        onConfirm={handleLeaveConfirmed}
        onCancel={() => setConfirmLeaveOpen(false)}
      />

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
        kickPlayer={kickPlayer}
        settings={settings}
        forceEndVoting={forceEndVoting}
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
  createRoom: (payload: {
    code: string;
    username: string;
    settings?: {
      maxPlayers: number;
      visibility?: 'public' | 'private';
      hostLocale?: string;
    };
  }) => void;
  joinRoom: (payload: { code: string; username: string }) => void;
  startMatch: () => void;
  startVoting: () => void;
  vote: (payload: { targetId: string | null }) => void;
  updateSettings: (payload: {
    impostorCount?: number;
    discussionTime?: number;
    category?: string | null;
    votingTimer?: 15 | 30 | 45 | 60;
    hardcore?: boolean;
    visibility?: 'public' | 'private';
    hostLocale?: string;
  }) => void;
  addCategory: (payload: { name: string; displayName?: string; words: string }) => void;
  addWords: (payload: { category: string; words: string }) => void;
  newMatch: () => void;
  kickPlayer: (username: string) => void;
  myId: string | null;
  /** Room settings (max players, voting timer, hardcore, etc.) —
   *  used to drive UI elements like the voting timer bar. */
  settings: import('@impostor/shared').RoomSettings | null;
  /** Host-only: force-tally the current set of votes even if some
   *  active players haven't voted yet. */
  forceEndVoting: () => void;
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
  kickPlayer,
  myId,
  settings,
  forceEndVoting,
}: ScreenRouterProps) {
  const t = useT();
  const location = useLocation();

  // Dedicated public-rooms page — always wins over the room-based
  // routing. This means navigating to /salas from anywhere (even with
  // a room code already set) renders the lobbies browser.
  if (location === 'lobbies') {
    return <LobbiesPage joinRoom={joinRoom} />;
  }

  // Already in a room → fall through to the in-game router. This
  // wins over the /join/CODE check below: if the user joined via a
  // deep link and the WS already accepted them, we should render the
  // LobbyScreen, not stick them on the JoinPage. (Previously the
  // /join/CODE check ran first and would re-render JoinPage forever
  // because the URL never changed after a successful join.)
  if (roomCode) {
    // fall through to the phase-based switch below
  } else {
    // /join/CODE — render the dedicated join page only if we don't
    // have a room yet. Once we do, the deep link is "consumed".
    const joinCode = parseJoinCode();
    if (joinCode !== null) {
      return <JoinPage code={joinCode} joinRoom={joinRoom} />;
    }
    // No room yet and not on a deep link → show the entry page.
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
          kickPlayer={kickPlayer}
          myId={myId}
        />
      );

    case 'WORD_REVEAL':
    case 'DISCUSSION':
      return <DiscussionScreen totalTime={90} startVoting={startVoting} />;

    case 'VOTING':
      return (
        <VotingScreen
          vote={vote}
          myId={myId ?? ''}
          totalTime={settings?.votingTimer}
          forceEndVoting={forceEndVoting}
        />
      );

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
